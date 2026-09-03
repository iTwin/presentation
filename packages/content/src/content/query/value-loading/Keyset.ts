/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlBinding, TypedPrimitiveValue } from "@itwin/presentation-shared";
import { ECSQL_PREFIX } from "../../InternalUtils.js";

import type { PrimitiveValue, PrimitiveValueType } from "@itwin/presentation-shared";

/**
 * One column of the keyset order, in ORDER BY priority. `expression` is the SQL the predicate compares
 * against (a derived-table column reference such as `[q].[pres_sort_0]`); `type` selects the binding
 * type for the cursor value; `value` is the cursor value for this column (or `undefined` for a NULL).
 *
 * @internal
 */
export interface KeysetOrderColumn {
  expression: string;
  direction: "asc" | "desc";
  type: PrimitiveValueType;
  value: PrimitiveValue | undefined;
}

/**
 * Builds the keyset `WHERE` predicate that selects the rows strictly *after* a cursor in a query's
 * `ORDER BY`. Expands lexicographic comparison over the ordered columns into the standard OR-of-AND
 * ladder and matches SQLite/ECSQL null ordering (NULLs sort first ascending, last descending), so paging
 * neither skips nor duplicates rows across a page boundary — including ties on leading sort keys.
 *
 * @internal
 */
export function buildKeysetPredicate(props: { columns: KeysetOrderColumn[] }): {
  clause: string;
  bindings: Record<string, ECSqlBinding>;
} {
  const { columns } = props;
  const prefix = `${ECSQL_PREFIX}keyset_`;
  const bindings: Record<string, ECSqlBinding> = {};

  const bindingFor = (value: PrimitiveValue, type: PrimitiveValueType, index: number): string => {
    const name = `${prefix}${index}`;
    bindings[name] = ECSqlBinding.create(TypedPrimitiveValue.create(value, type));
    return `:${name}`;
  };

  // Predicate that a row's column value equals the cursor value at this position (used as the tie-prefix
  // for lower-priority columns).
  const equalTo = (column: KeysetOrderColumn, index: number): string => {
    if (column.value === undefined) {
      return `${column.expression} IS NULL`;
    }
    return `${column.expression} = ${bindingFor(column.value, column.type, index)}`;
  };

  // Predicate that a row is strictly *after* the cursor value at this position, honoring null ordering.
  const strictlyAfter = (column: KeysetOrderColumn, index: number): string => {
    const asc = column.direction === "asc";
    if (column.value === undefined) {
      // Cursor sits on a NULL: ascending NULLs come first, so anything non-null is after; descending
      // NULLs come last, so nothing is after.
      return asc ? `${column.expression} IS NOT NULL` : `FALSE`;
    }
    const comparison = asc
      ? `${column.expression} > ${bindingFor(column.value, column.type, index)}`
      : `${column.expression} < ${bindingFor(column.value, column.type, index)}`;
    // Descending places NULLs last, so a NULL row is after any non-null cursor value.
    return asc ? comparison : `(${comparison} OR ${column.expression} IS NULL)`;
  };

  const ladder: string[] = [];
  for (let i = 0; i < columns.length; ++i) {
    const conditions: string[] = [];
    for (let j = 0; j < i; ++j) {
      conditions.push(equalTo(columns[j], j));
    }
    conditions.push(strictlyAfter(columns[i], i));
    ladder.push(conditions.length > 1 ? `(${conditions.join(" AND ")})` : conditions[0]);
  }

  return { clause: ladder.join(" OR "), bindings };
}
