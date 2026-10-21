/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSQL_PREFIX, mergeBindings } from "../../InternalUtils.js";
import { namespaceBindings } from "../NamespaceBindings.js";
import { PAGE_SIZE, SQLITE_MAX_COMPOUND_SELECT_TERMS } from "../QueryLimits.js";
import { buildKeysetPredicate } from "./Keyset.js";

import type { Id64String } from "@itwin/core-bentley";
import type {
  ECSqlBinding,
  ECSqlQueryDef,
  InstanceKey,
  PrimitiveValue,
  PrimitiveValueType,
} from "@itwin/presentation-shared";
import type { BaseQueryGroup } from "../BaseQuery.js";
import type { ContentQuerySort, SelectProjection } from "../SelectBuilder.js";
import type { KeysetOrderColumn } from "./Keyset.js";
import type { RowDecoder } from "./RowDecoder.js";

export const QUERY_ALIAS = `${ECSQL_PREFIX}q`;

/**
 * A base-query group paired with the projection that selects its columns.
 */
export interface PlannedGroup {
  baseQuery: BaseQueryGroup;
  projection: SelectProjection;
  rowDecoder: RowDecoder;
}

/**
 * The queries and projections for one content source: its anchor group (with the projection that reads
 * its values and the key-only projection used by the multi-source ordering stream) and the additional
 * stitched groups.
 */
export interface SourcePlan {
  anchor: PlannedGroup & { keyProjection: SelectProjection };
  additional: PlannedGroup[];
}

/**
 * Position of the last emitted row, used to seed the next page's keyset predicate.
 */
export interface Cursor {
  sortValues: Array<PrimitiveValue | undefined>;
  primaryKey: InstanceKey;
}

/**
 * Builds a single source's keyset-paged anchor query.
 */
export function buildAnchorPageQuery(props: {
  plan: SourcePlan;
  sorting: ContentQuerySort[];
  cursor?: Cursor;
}): ECSqlQueryDef {
  const { plan, sorting, cursor } = props;
  const { baseQuery, projection } = plan.anchor;
  const bindings: Record<string, ECSqlBinding> = {};
  mergeBindings(bindings, baseQuery.parts.bindings);
  mergeBindings(bindings, projection.bindings);
  const inner = selectFragments({
    select: projection.clauses.select,
    from: baseQuery.parts.from,
    joins: [baseQuery.parts.joins],
    where: baseQuery.parts.where,
  });
  const where = cursor ? applyKeyset({ projection, sorting, cursor, bindings }) : "";
  return {
    ecsql: `
      SELECT [${QUERY_ALIAS}].*
      FROM (${inner}) [${QUERY_ALIAS}]
      ${where}
      ${orderByClause(projection)}
      LIMIT ${PAGE_SIZE}
    `,
    bindings,
  };
}

/**
 * Builds the globally-ordered `UNION ALL` key stream that interleaves multiple sources by sort order.
 * Only primary keys and sort values are selected here; field values are fetched separately per page.
 * @throws If no source plans are supplied.
 */
export function buildKeyStreamQuery(props: {
  plans: SourcePlan[];
  sorting: ContentQuerySort[];
  cursor?: Cursor;
}): ECSqlQueryDef {
  const { plans, sorting, cursor } = props;
  if (plans.length === 0) {
    throw new Error("Cannot build a key stream query without source plans.");
  }
  const bindings: Record<string, ECSqlBinding> = {};
  const branches = plans.map((plan, sourceIndex) => {
    const branchBindings: Record<string, ECSqlBinding> = {};
    mergeBindings(branchBindings, plan.anchor.baseQuery.parts.bindings);
    mergeBindings(branchBindings, plan.anchor.keyProjection.bindings);
    const branchSql = selectFragments({
      select: plan.anchor.keyProjection.clauses.select,
      from: plan.anchor.baseQuery.parts.from,
      joins: [plan.anchor.baseQuery.parts.joins],
      where: plan.anchor.baseQuery.parts.where,
    });
    const namespaced = namespaceBindings({ sql: branchSql, bindings: branchBindings, prefix: `s${sourceIndex}_` });
    mergeBindings(bindings, namespaced.bindings);
    return `SELECT * FROM (${namespaced.sql})`;
  });
  const union = unionAll(branches);
  const where = cursor ? applyKeyset({ projection: plans[0].anchor.keyProjection, sorting, cursor, bindings }) : "";
  return {
    ecsql: `
      SELECT [${QUERY_ALIAS}].*
      FROM (${union}) [${QUERY_ALIAS}]
      ${where}
      ${orderByClause(plans[0].anchor.keyProjection)}
      LIMIT ${PAGE_SIZE}
    `,
    bindings,
  };
}

/**
 * Builds a group's value query restricted to a page of primary keys via an `IdSet` join.
 */
export function buildValueQuery(props: {
  baseQuery: BaseQueryGroup;
  projection: SelectProjection;
  ids: Id64String[];
}): ECSqlQueryDef {
  const { baseQuery, projection, ids } = props;
  const idsetBinding = "pres_page_ids";
  const bindings: Record<string, ECSqlBinding> = {};
  mergeBindings(bindings, baseQuery.parts.bindings);
  mergeBindings(bindings, projection.bindings);
  mergeBindings(bindings, { [idsetBinding]: { type: "idset", value: ids } });
  return {
    ecsql: selectFragments({
      select: projection.clauses.select,
      from: baseQuery.parts.from,
      joins: [
        baseQuery.parts.joins,
        `JOIN IdSet(:${idsetBinding}) [pres_page] ON [pres_page].[id] = [${baseQuery.parts.primaryClassAlias}].[ECInstanceId]`,
      ],
      where: baseQuery.parts.where,
    }),
    bindings,
  };
}

function selectFragments(props: { select: string; from: string; joins: string[]; where?: string }): string {
  const { select, from, joins, where } = props;
  return [select, from, ...joins, where].filter((fragment) => fragment).join(" ");
}

// Combines the branches into a single result set, nesting them into derived tables when there are more of
// them than one compound SELECT may contain.
function unionAll(branches: string[]): string {
  if (branches.length <= SQLITE_MAX_COMPOUND_SELECT_TERMS) {
    return branches.join(" UNION ALL ");
  }
  const groups: string[] = [];
  for (let i = 0; i < branches.length; i += SQLITE_MAX_COMPOUND_SELECT_TERMS) {
    const group = branches.slice(i, i + SQLITE_MAX_COMPOUND_SELECT_TERMS);
    groups.push(`SELECT * FROM (${group.join(" UNION ALL ")})`);
  }
  return unionAll(groups);
}

function applyKeyset(props: {
  projection: SelectProjection;
  sorting: ContentQuerySort[];
  cursor: Cursor;
  bindings: Record<string, ECSqlBinding>;
}): string {
  const { projection, sorting, cursor, bindings } = props;
  const keyset = buildKeysetPredicate({ columns: keysetColumns({ projection, sorting, cursor }) });
  mergeBindings(bindings, keyset.bindings);
  return `WHERE ${keyset.clause}`;
}

function keysetColumns(props: {
  projection: SelectProjection;
  sorting: ContentQuerySort[];
  cursor: Cursor;
}): KeysetOrderColumn[] {
  const { projection, sorting, cursor } = props;
  const columns: KeysetOrderColumn[] = projection.sort.map((entry, index) => ({
    expression: `[${QUERY_ALIAS}].[${entry.column}]`,
    direction: entry.direction,
    type: sortPrimitiveType(sorting[index]),
    value: cursor.sortValues[index],
  }));
  columns.push({
    expression: `[${QUERY_ALIAS}].[${projection.columnNames.primaryKey.className}]`,
    direction: "asc",
    type: "String",
    value: cursor.primaryKey.className,
  });
  columns.push({
    expression: `[${QUERY_ALIAS}].[${projection.columnNames.primaryKey.id}]`,
    direction: "asc",
    type: "Id",
    value: cursor.primaryKey.id,
  });
  return columns;
}

function orderByClause(projection: SelectProjection): string {
  const parts = projection.sort.map((entry) => `[${QUERY_ALIAS}].[${entry.column}] ${entry.direction.toUpperCase()}`);
  parts.push(
    `[${QUERY_ALIAS}].[${projection.columnNames.primaryKey.className}] ASC`,
    `[${QUERY_ALIAS}].[${projection.columnNames.primaryKey.id}] ASC`,
  );
  return `ORDER BY ${parts.join(", ")}`;
}

function sortPrimitiveType(sort: ContentQuerySort): PrimitiveValueType {
  if (sort.field.type.kind !== "primitive") {
    throw new Error(`Cannot sort by field "${sort.field.id}" because its value is not a primitive.`);
  }
  return sort.field.type.type;
}
