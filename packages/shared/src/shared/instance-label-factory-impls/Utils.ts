/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  createConcatenatedValueJsonSelector,
  createRawPropertyValueSelector,
} from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";

import type { TypedValueSelectClauseProps } from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";

export const ALIAS_PREFIX = "pres_";

export function createECInstanceIdSuffixSelectors(classAlias: string): TypedValueSelectClauseProps[] {
  return [
    { value: ` [`, type: "String" },
    { selector: `CAST(base36(${createRawPropertyValueSelector(classAlias, "ECInstanceId")} >> 40) AS TEXT)` },
    { value: `-`, type: "String" },
    {
      selector: `CAST(base36(${createRawPropertyValueSelector(classAlias, "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)`,
    },
    { value: `]`, type: "String" },
  ];
}

export function concatenate(
  props: { selectorsConcatenator?: (selectors: TypedValueSelectClauseProps[], checkSelector?: string) => string },
  selectors: TypedValueSelectClauseProps[],
  checkSelector?: string,
): string {
  return (props.selectorsConcatenator ?? createConcatenatedValueJsonSelector)(selectors, checkSelector);
}
