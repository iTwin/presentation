/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlBinding, TypedPrimitiveValue } from "@itwin/presentation-shared";
import { ECSQL_PREFIX } from "../InternalUtils.js";

import type { Id64String } from "@itwin/core-bentley";
import type { PrimitiveValueType } from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../Content.js";
import type { CalculatedField, PropertyField } from "../model/Field.js";

type ContentFilterValueType = Exclude<PrimitiveValueType, "Point2d" | "Point3d">;

interface ValueFilterSelector {
  selector: string;
  type: ContentFilterValueType;
}

/**
 * Builds the `WHERE` clause and ECSQL bindings for a set of {@link ContentValueFilter}s.
 *
 * @internal
 */
export function buildValueFilterClauses(props: {
  filters: ContentValueFilter[];
  /**
   * Resolves the ECSQL selector (column reference) and value type for a field's column.
   *
   * Implementers should return the selector for the raw property column only. For navigation
   * properties, do **not** append the `.Id` member — `buildValueFilterClauses` appends it
   * automatically based on the field's type.
   */
  resolveSelector: (field: PropertyField | CalculatedField, member?: string) => ValueFilterSelector;
}): { where: string; bindings: Record<string, ECSqlBinding> } | undefined {
  const clauses: string[] = [];
  const bindings: Record<string, ECSqlBinding> = {};

  props.filters.forEach((filter, filterIndex) => {
    // ignore `member` on navigation properties, since they are structs whose target instance id lives in a `.Id` member
    const resolved = props.resolveSelector(
      filter.field,
      filter.field.type.kind === "navigation" ? undefined : filter.member,
    );
    // Navigation properties are structs whose target instance id lives in a `.Id` member, so filter
    // against that member rather than the raw navigation column.
    const selector =
      filter.field.type.kind === "navigation" ? { ...resolved, selector: `${resolved.selector}.[Id]` } : resolved;
    const clause = buildFilterClause({ filter, selector, filterIndex, bindings });
    clauses.push(clause);
  });

  if (clauses.length === 0) {
    return undefined;
  }

  const where = clauses.length > 1 ? clauses.map((clause) => `(${clause})`).join(" AND ") : clauses[0];
  return { where, bindings };
}

function buildFilterClause(props: {
  filter: ContentValueFilter;
  selector: ValueFilterSelector;
  filterIndex: number;
  bindings: Record<string, ECSqlBinding>;
}): string {
  const { filter, selector, filterIndex, bindings } = props;
  switch (filter.operator) {
    case "is-null":
      return `${selector.selector} IS NULL`;
    case "is-not-null":
      return `${selector.selector} IS NOT NULL`;
    case "is-in":
    case "is-not-in":
      return buildInClause({ filter, selector, filterIndex, bindings });
    default: {
      const bindingName = `${ECSQL_PREFIX}vf${filterIndex}`;
      bindings[bindingName] = ECSqlBinding.create(TypedPrimitiveValue.create(filter.value, selector.type));
      return `${selector.selector} ${getSqlOperator(filter.operator)} :${bindingName}`;
    }
  }
}

function buildInClause(props: {
  filter: Extract<ContentValueFilter, { operator: "is-in" | "is-not-in" }>;
  selector: ValueFilterSelector;
  filterIndex: number;
  bindings: Record<string, ECSqlBinding>;
}): string {
  const { filter, selector, filterIndex, bindings } = props;
  const negated = filter.operator === "is-not-in";

  if (filter.value.length === 0) {
    return negated ? "TRUE" : "FALSE";
  }

  const operator = negated ? "NOT IN" : "IN";

  if (selector.type === "Id") {
    const bindingName = `${ECSQL_PREFIX}vf${filterIndex}`;
    bindings[bindingName] = { type: "idset", value: filter.value as Id64String[] };
    return `${selector.selector} ${operator} (SELECT id FROM IdSet(:${bindingName}) ECSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES)`;
  }

  const bindingNames = filter.value.map((value, valueIndex) => {
    const bindingName = `${ECSQL_PREFIX}vf${filterIndex}_${valueIndex}`;
    bindings[bindingName] = ECSqlBinding.create(TypedPrimitiveValue.create(value, selector.type));
    return `:${bindingName}`;
  });
  return `${selector.selector} ${operator} (${bindingNames.join(", ")})`;
}

function getSqlOperator(
  operator: Exclude<ContentValueFilter["operator"], "is-null" | "is-not-null" | "is-in" | "is-not-in">,
): string {
  switch (operator) {
    case "is-equal":
      return "=";
    case "is-not-equal":
      return "<>";
    case "less-than":
      return "<";
    case "less-than-or-equal":
      return "<=";
    case "greater-than":
      return ">";
    case "greater-than-or-equal":
      return ">=";
    case "like":
      return "LIKE";
  }
}
