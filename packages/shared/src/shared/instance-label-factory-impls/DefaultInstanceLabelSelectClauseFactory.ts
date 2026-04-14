/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRawPropertyValueSelector } from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { concatenate, createECInstanceIdSuffixSelectors } from "./Utils.js";

import type { IInstanceLabelSelectClauseFactory } from "../InstanceLabelSelectClauseFactory.js";

/**
 * Creates a label select clause in a format `Class label [base36(briefcase id)-base36(local id)]`, where
 * local and briefcase IDs are calculated based on ECInstance ID:
 * - `{briefcase id} = ECInstanceId >> 40`
 * - `{local id} = ECInstanceId & (1 << 40 - 1)`
 *
 * @see https://www.itwinjs.org/presentation/advanced/defaultbisrules/#label-overrides
 * @public
 */
export function createDefaultInstanceLabelSelectClauseFactory(): IInstanceLabelSelectClauseFactory {
  return {
    async createSelectClause(props): Promise<string> {
      return `(
        SELECT
          ${concatenate(props, [
            {
              selector: `COALESCE(
                ${createRawPropertyValueSelector("c", "DisplayLabel")},
                ${createRawPropertyValueSelector("c", "Name")}
              )`,
            },
            ...createECInstanceIdSuffixSelectors(props.classAlias),
          ])}
        FROM [meta].[ECClassDef] AS [c]
        WHERE [c].[ECInstanceId] = ${createRawPropertyValueSelector(props.classAlias, "ECClassId")}
      )`;
    },
  };
}
