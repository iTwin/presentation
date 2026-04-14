/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConcatenatedValueJsonSelector,
  createRawPropertyValueSelector,
} from "../../shared/ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { createBisInstanceLabelSelectClauseFactory } from "../../shared/instance-label-factory-impls/BisInstanceLabelSelectClauseFactory.js";
import { createDefaultInstanceLabelSelectClauseFactory } from "../../shared/instance-label-factory-impls/DefaultInstanceLabelSelectClauseFactory.js";
import { trimWhitespace } from "../../shared/Utils.js";

import type { IInstanceLabelSelectClauseFactory } from "../../shared/InstanceLabelSelectClauseFactory.js";

describe("createBisInstanceLabelSelectClauseFactory", () => {
  const classHierarchyInspector = { classDerivesFrom: vi.fn() };
  let factory: IInstanceLabelSelectClauseFactory;
  beforeEach(() => {
    factory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector });
    classHierarchyInspector.classDerivesFrom.mockReset();
    classHierarchyInspector.classDerivesFrom.mockImplementation(async (derived, base) => {
      if (derived === "BisCore.GeometricElement") {
        return base === "BisCore.Element" || base === "BisCore.GeometricElement";
      }
      if (derived === "BisCore.Element") {
        return base === "BisCore.Element";
      }
      if (derived === "BisCore.Model") {
        return base === "BisCore.Model";
      }
      return false;
    });
  });

  it("returns valid clause for geometric elements", async () => {
    const result = await factory.createSelectClause({ classAlias: "test", className: "BisCore.GeometricElement" });
    expect(trimWhitespace(result)).toBe(
      trimWhitespace(`
        COALESCE(
          IIF(
            [test].[ECClassId] IS (BisCore.GeometricElement),
            COALESCE(
              ${createRawPropertyValueSelector("test", "CodeValue")},
              ${createConcatenatedValueJsonSelector(
                [
                  { selector: createRawPropertyValueSelector("test", "UserLabel") },
                  { value: ` [`, type: "String" },
                  { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} >> 40) AS TEXT)` },
                  { value: `-`, type: "String" },
                  {
                    selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)`,
                  },
                  { value: `]`, type: "String" },
                ],
                `${createRawPropertyValueSelector("test", "UserLabel")} IS NOT NULL`,
              )}
            ),
            NULL
          ),
          IIF(
            [test].[ECClassId] IS (BisCore.Element),
            COALESCE(
              ${createRawPropertyValueSelector("test", "UserLabel")},
              ${createRawPropertyValueSelector("test", "CodeValue")}
            ),
            NULL
          ),
          ${await createDefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
        )
      `),
    );
  });

  it("returns valid clause for any element", async () => {
    const result = await factory.createSelectClause({ classAlias: "test", className: "BisCore.Element" });
    expect(trimWhitespace(result)).toBe(
      trimWhitespace(`
        COALESCE(
          IIF(
            [test].[ECClassId] IS (BisCore.GeometricElement),
            COALESCE(
              ${createRawPropertyValueSelector("test", "CodeValue")},
              ${createConcatenatedValueJsonSelector(
                [
                  { selector: createRawPropertyValueSelector("test", "UserLabel") },
                  { value: ` [`, type: "String" },
                  { selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} >> 40) AS TEXT)` },
                  { value: `-`, type: "String" },
                  {
                    selector: `CAST(base36(${createRawPropertyValueSelector("test", "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)`,
                  },
                  { value: `]`, type: "String" },
                ],
                `${createRawPropertyValueSelector("test", "UserLabel")} IS NOT NULL`,
              )}
            ),
            NULL
          ),
          IIF(
            [test].[ECClassId] IS (BisCore.Element),
            COALESCE(
              ${createRawPropertyValueSelector("test", "UserLabel")},
              ${createRawPropertyValueSelector("test", "CodeValue")}
            ),
            NULL
          ),
          ${await createDefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
        )
      `),
    );
  });

  it("returns valid clause for any model", async () => {
    const result = await factory.createSelectClause({ classAlias: "test", className: "BisCore.Model" });
    expect(trimWhitespace(result)).toBe(
      trimWhitespace(`
        COALESCE(
          IIF(
            [test].[ECClassId] IS (BisCore.Model),
            (
              SELECT ${await factory.createSelectClause({ classAlias: "e", className: "BisCore.Element" })}
              FROM [bis].[Element] AS [e]
              WHERE [e].[ECInstanceId] = [test].[ModeledElement].[Id]
            ),
            NULL
          ),
          ${await createDefaultInstanceLabelSelectClauseFactory().createSelectClause({ classAlias: "test" })}
        )
      `),
    );
  });
});
