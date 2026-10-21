/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from "vitest";
import {
  createConcatenatedValueJsonSelector,
  createRawPropertyValueSelector,
} from "../../shared/ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { createDefaultInstanceLabelSelectClauseFactory } from "../../shared/instance-label-factory-impls/DefaultInstanceLabelSelectClauseFactory.js";
import { ALIAS_PREFIX } from "../../shared/instance-label-factory-impls/Utils.js";
import { trimWhitespace } from "../../shared/Utils.js";

import type { IInstanceLabelSelectClauseFactory } from "../../shared/InstanceLabelSelectClauseFactory.js";

describe("createDefaultInstanceLabelSelectClauseFactory", () => {
  let factory: IInstanceLabelSelectClauseFactory;
  beforeEach(() => {
    factory = createDefaultInstanceLabelSelectClauseFactory();
  });

  it("returns valid clause", async () => {
    const result = await factory.createSelectClause({ classAlias: "test" });
    const expectedAlias = `${ALIAS_PREFIX}c`;
    expect(trimWhitespace(result)).toBe(
      trimWhitespace(`(
        SELECT ${createConcatenatedValueJsonSelector([
          {
            selector: `COALESCE(
              ${createRawPropertyValueSelector(expectedAlias, "DisplayLabel")},
              ${createRawPropertyValueSelector(expectedAlias, "Name")}
            )`,
          },
          { value: ` [`, type: "String" },
          { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} >> 40) AS TEXT)` },
          { value: `-`, type: "String" },
          {
            selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)`,
          },
          { value: `]`, type: "String" },
        ])}
        FROM [meta].[ECClassDef] AS ${expectedAlias}
        WHERE ${expectedAlias}.[ECInstanceId] = [test].[ECClassId]
      )`),
    );
  });
});
