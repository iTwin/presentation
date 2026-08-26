/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, mergeBindings, substituteExpressionAlias } from "../InternalUtils.js";
import { serializeRelationshipPath } from "../model/Utils.js";

import type { EC, ECSchemaProvider, ECSqlBinding, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../model/ContentDescriptor.js";
import type { CalculatedField, PropertyField } from "../model/Field.js";
import type { PropertyValueSelector } from "../model/ValueSelector.js";
import type { BaseQueryGroup } from "./BaseQuery.js";

/** @internal */
export interface ContentQuerySort {
  field: PropertyField | CalculatedField;
  direction: "asc" | "desc";
}

/**
 * The columns selected for one `BaseQueryGroup`, together with the information required to locate
 * descriptor selectors in the returned row.
 *
 * @internal
 */
export interface SelectProjection {
  /** ECSQL clause fragments contributed by this group's projection. */
  clauses: {
    /** Complete `SELECT` clause, including the keyword. */
    select: string;
    /** ORDER BY clause, including stable primary-key tie-breakers, when sorting was requested. */
    orderBy?: string;
  };
  /** Bindings referenced by calculated expressions. */
  bindings?: Record<string, ECSqlBinding>;
  /**
   * Names of the result columns each descriptor value is read from. Rows should be read with
   * `{ rowFormat: "ECSqlPropertyNames" }`, so the loader locates values by these aliases rather than by
   * position. Property selectors sharing a table alias map to the same `$`-blob column; the loader parses
   * that blob once and reads each selector's `propertyName` from it. Calculated selectors map to their own
   * scalar column.
   */
  columnNames: {
    /** Aliases of the primary instance identity columns. */
    primaryKey: { className: string; id: string };
    /** Property selector id -> alias of the `$` blob column it is read from. */
    propertyBlobs: Record<string, string>;
    /** Calculated selector id -> alias of its scalar column. */
    calculatedValues: Record<string, string>;
  };
  /** Private sort-key columns read by the keyset cursor and re-emitted in the ECSQL `ORDER BY`. */
  sort: { fieldId: string; column: string; direction: "asc" | "desc" }[];
}

/**
 * Builds the SELECT projection for one base-query group. Property selectors sharing one table alias
 * read from a single `$` blob; each calculated selector has its own scalar result column.
 *
 * @internal
 */
export async function buildSelectProjection(props: {
  schemaProvider: ECSchemaProvider;
  descriptor: ContentDescriptor;
  group: BaseQueryGroup;
  sorting?: ContentQuerySort[];
}): Promise<SelectProjection> {
  const { schemaProvider, descriptor, group, sorting = [] } = props;
  const primaryKey = { className: `${ECSQL_PREFIX}primary_class`, id: `${ECSQL_PREFIX}primary_id` };
  const select = [
    `ec_classname([${group.parts.primaryClassAlias}].[ECClassId], 's.c') AS [${primaryKey.className}]`,
    `[${group.parts.primaryClassAlias}].[ECInstanceId] AS [${primaryKey.id}]`,
  ];

  const propertyBlobs: Record<string, string> = {};
  const propertySelectors = Object.values(descriptor.selectors).filter(
    (selector): selector is PropertyValueSelector => selector.kind === "property",
  );
  const relationshipClassNames = await collectRelationshipClassNames({ schemaProvider, selectors: propertySelectors });
  const projectedAliases = new Set<string>();
  for (const selector of propertySelectors) {
    const alias = resolvePropertyAlias({ selector, group, relationshipClassNames });
    if (!alias) {
      continue;
    }
    if (!projectedAliases.has(alias)) {
      select.push(`[${alias}].$ AS [${alias}]`);
      projectedAliases.add(alias);
    }
    propertyBlobs[selector.id] = alias;
  }

  const bindings: Record<string, ECSqlBinding> = {};
  const calculatedValues: Record<string, string> = {};
  const calculatedSelectors = Object.values(descriptor.selectors).filter((selector) => selector.kind === "calculated");
  for (const [index, selector] of calculatedSelectors.entries()) {
    // Alias by a controlled name rather than the raw selector id so ids with special characters (e.g. `:`)
    // stay addressable under the name-based row format.
    const column = `${ECSQL_PREFIX}calc_${index}`;
    const expression = substituteExpressionAlias({
      expression: selector.expression,
      fromAlias: selector.targetAlias ?? group.parts.primaryClassAlias,
      toAlias: group.parts.primaryClassAlias,
    });
    select.push(`(${expression}) AS [${column}]`);
    calculatedValues[selector.id] = column;
    mergeBindings(bindings, selector.bindings);
  }

  const sort: SelectProjection["sort"] = [];
  const sortingRelationshipClasses = await collectRelationshipClassNames({
    schemaProvider,
    selectors: sorting.flatMap((entry) => (entry.field.kind === "property" ? [entry.field] : [])),
  });
  for (const [index, entry] of sorting.entries()) {
    const column = `${ECSQL_PREFIX}sort_${index}`;
    const selector = resolveSortSelector({
      field: entry.field,
      group,
      relationshipClassNames: sortingRelationshipClasses,
    });
    // Emit the sort key as a private column so the loader can read its value into the keyset cursor.
    select.push(`${selector.selector} AS [${column}]`);
    mergeBindings(bindings, selector.bindings);
    sort.push({ fieldId: entry.field.id, column, direction: entry.direction });
  }
  const orderBy =
    sort.length > 0
      ? `ORDER BY ${sort.map((entry) => `[${entry.column}] ${entry.direction.toUpperCase()}`).join(", ")}, [${primaryKey.className}] ASC, [${primaryKey.id}] ASC`
      : undefined;

  return {
    clauses: { select: `SELECT ${select.join(",\n")}`, ...(orderBy ? { orderBy } : undefined) },
    ...(Object.keys(bindings).length > 0 ? { bindings } : undefined),
    columnNames: { primaryKey, propertyBlobs, calculatedValues },
    sort,
  };
}

function resolvePropertyAlias(props: {
  selector: PropertyValueSelector;
  group: BaseQueryGroup;
  relationshipClassNames: Set<EC.FullClassNameDotNotation>;
}): string | undefined {
  const { selector, group, relationshipClassNames } = props;
  if (selector.pathFromTarget.length === 0) {
    return group.parts.primaryClassAlias;
  }
  const aliases = group.parts.relatedClassAliases.get(serializeRelationshipPath({ path: selector.pathFromTarget }));
  if (!aliases) {
    return undefined;
  }
  return relationshipClassNames.has(selector.propertyClassName) ? aliases.relationship : aliases.target;
}

async function collectRelationshipClassNames(props: {
  schemaProvider: ECSchemaProvider;
  selectors: { propertyClassName: EC.FullClassNameDotNotation; pathFromTarget: RelationshipPath }[];
}): Promise<Set<EC.FullClassNameDotNotation>> {
  const classNames = new Set(
    props.selectors
      .filter((selector) => selector.pathFromTarget.length > 0)
      .map((selector) => selector.propertyClassName),
  );
  const classes = await Promise.all(
    classNames.values().map(async (className) => getClass(props.schemaProvider, className)),
  );
  return new Set(classes.filter((ecClass) => ecClass.isRelationshipClass()).map((ecClass) => ecClass.fullName));
}

function resolveSortSelector(props: {
  field: PropertyField | CalculatedField;
  group: BaseQueryGroup;
  relationshipClassNames: Set<EC.FullClassNameDotNotation>;
}): { selector: string; bindings?: Record<string, ECSqlBinding> } {
  if (props.field.kind === "property") {
    const alias = resolvePropertyAlias({
      selector: props.field,
      group: props.group,
      relationshipClassNames: props.relationshipClassNames,
    });
    if (!alias) {
      throw new Error(
        `Cannot sort by field "${props.field.id}" because its relationship path is not joined by this query group.`,
      );
    }
    return { selector: `[${alias}].$->[${props.field.propertyName}]` };
  }
  const expression = substituteExpressionAlias({
    expression: props.field.expression,
    fromAlias: props.field.targetAlias ?? props.group.parts.primaryClassAlias,
    toAlias: props.group.parts.primaryClassAlias,
  });
  return { selector: `(${expression})`, bindings: props.field.bindings };
}
