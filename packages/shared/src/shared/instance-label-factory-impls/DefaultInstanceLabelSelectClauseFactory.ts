/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRawPropertyValueSelector } from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { ALIAS_PREFIX, concatenate, createECInstanceIdSuffixSelectors } from "./Utils.js";

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
  const alias = `${ALIAS_PREFIX}c`;
  return {
    async createSelectClause(props): Promise<string> {
      return `(
        SELECT
          ${concatenate(props, [
            {
              selector: `COALESCE(
                ${createRawPropertyValueSelector(alias, "DisplayLabel")},
                ${createRawPropertyValueSelector(alias, "Name")}
              )`,
            },
            ...createECInstanceIdSuffixSelectors(props.classAlias),
          ])}
        FROM [meta].[ECClassDef] AS ${alias}
        WHERE ${alias}.[ECInstanceId] = ${createRawPropertyValueSelector(props.classAlias, "ECClassId")}
      )`;
    },
  };
}
