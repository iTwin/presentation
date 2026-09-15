/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { distinct, finalize, from, map, mergeMap } from "rxjs";
import {
  createDefaultInstanceLabelSelectClauseFactory,
  createIModelInstanceLabelSelectClauseFactory,
  eachValueFrom,
  ECSql,
  parseInstanceLabel,
} from "@itwin/presentation-shared";
import { mergeBindings, stableStringify } from "./InternalUtils.js";
import { buildTargetScopedQuery, classifyRelationshipClasses, resolveFieldSelector } from "./query/BaseQuery.js";
import { QUERY_CONCURRENCY } from "./query/QueryConcurrency.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type {
  EC,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  IInstanceLabelSelectClauseFactory,
  NavigationValue,
  Value,
} from "@itwin/presentation-shared";
import type { ContentValueFilter } from "./Content.js";
import type { ContentTarget } from "./ContentTarget.js";
import type { CalculatedField, PropertyField } from "./model/Field.js";

/**
 * Alias assigned to the class joined to resolve a navigation value's target instance. Carries no
 * `ECSQL_PREFIX`, so it can never collide with the prefixed aliases `buildTargetScopedQuery` assigns
 * to relationship-path steps.
 */
const NAVIGATION_TARGET_ALIAS = "navTarget";

/**
 * Alias assigned to the inner distinct-ids derived table a navigation field's query wraps (see
 * `buildNavigationValuesQuery`). Carries no `ECSQL_PREFIX` for the same reason as
 * {@link NAVIGATION_TARGET_ALIAS}.
 */
const NAVIGATION_IDS_ALIAS = "navIds";

/**
 * Props for `getDistinctFieldValues`.
 *
 * @public
 */
interface GetDistinctFieldValuesProps {
  /**
   * Access to the iModel for running ECSQL queries and accessing schema metadata.
   */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;

  /** The content targets to query against. */
  targets: ContentTarget[];

  /** The field to get distinct values for. */
  field: PropertyField | CalculatedField;

  /** Optional filters (restricts which rows contribute distinct values). */
  filters?: ContentValueFilter[];

  /**
   * Used to select labels for navigation fields' target instances. Ignored for non-navigation fields.
   * Defaults to `createIModelInstanceLabelSelectClauseFactory({ imodelAccess })`.
   */
  labelsFactory?: IInstanceLabelSelectClauseFactory;
}

/**
 * Builds a single-target `SELECT DISTINCT <field selector>` query for `getDistinctFieldValues`.
 *
 * For a non-navigation field, this *is* the whole query. For a navigation field, it is instead built as
 * the inner half of {@link buildNavigationValuesQuery}: reducing to the distinct id set first — before
 * joining the (few) resulting ids to the navigation target class for their class name and label — keeps
 * the source scan as cheap as the non-navigation case, paying the join + label cost once per distinct
 * value rather than once per source row.
 */
export async function buildDistinctValuesQuery(props: {
  schemaProvider: ECSchemaProvider;
  target: ContentTarget;
  field: PropertyField | CalculatedField;
  filters?: ContentValueFilter[];
  labelsFactory?: IInstanceLabelSelectClauseFactory;
}): Promise<ECSqlQueryDef> {
  const { schemaProvider, target, field } = props;
  const filters = props.filters ?? [];

  if (field.type.kind === "array" || field.type.kind === "struct") {
    throw new Error(`Getting distinct values for ${field.type.kind} fields is not supported.`);
  }

  const navigationTargetClassName = field.type.kind === "navigation" ? field.type.targetClassName : undefined;
  const fieldPath = field.kind === "property" ? field.pathFromTarget : undefined;
  const parts = await buildTargetScopedQuery({ schemaProvider, target, paths: fieldPath ? [fieldPath] : [], filters });

  const relationshipPropertyClasses =
    field.kind === "property" && field.pathFromTarget.length > 0
      ? await classifyRelationshipClasses(schemaProvider, [field.propertyClassName])
      : new Set<EC.FullClassNameDotNotation>();

  const resolved = resolveFieldSelector({
    field,
    relatedClassAliases: parts.relatedClassAliases,
    isRelationshipClass: (className) => relationshipPropertyClasses.has(className),
  });

  const bindings: Record<string, ECSqlBinding> = { ...parts.bindings };
  mergeBindings(bindings, resolved.bindings);

  // Non-navigation: this selector *is* the query. Navigation: it's just the id reduction — the
  // `.[Id]` member is aliased so the wrapping query below can reference it as a plain column.
  const innerSelector = navigationTargetClassName ? `${resolved.selector}.[Id] AS [id]` : resolved.selector;
  const innerEcsql = `SELECT DISTINCT ${innerSelector} ${parts.from} ${parts.joins}${parts.where ? ` ${parts.where}` : ""}`;

  if (!navigationTargetClassName) {
    return { ecsql: innerEcsql, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
  }

  const ecsql = await buildNavigationValuesQuery({
    innerEcsql,
    targetClassName: navigationTargetClassName,
    labelsFactory: props.labelsFactory ?? createDefaultInstanceLabelSelectClauseFactory(),
  });
  return { ecsql, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
}

/**
 * Wraps `innerEcsql` (a `SELECT DISTINCT <id> AS [id] ...` query) as a derived table and left-joins its
 * distinct ids to the navigation target class — polymorphically (no `ONLY`), so a subclass instance
 * resolves, and outer, so an id with no matching instance (e.g. a dangling reference) still contributes
 * its row rather than being silently dropped; `rowValueToNavigationValue` then surfaces such a row the
 * same way as a `NULL` navigation value — as `undefined` — since `ec_classname` comes back `NULL` too.
 *
 * Deliberately a single query, not a second round trip: `getDistinctFieldValues` streams one query's
 * results as they arrive, and a separate lookup query would force buffering the entire id set in memory
 * first. Measurements also showed this single nested-subquery shape edges out an equivalent two-query
 * `IdSet`-bound lookup, on top of preserving the streaming behavior.
 */
async function buildNavigationValuesQuery(props: {
  innerEcsql: string;
  targetClassName: EC.FullClassNameDotNotation;
  labelsFactory: IInstanceLabelSelectClauseFactory;
}): Promise<string> {
  const labelSelector = await props.labelsFactory.createSelectClause({
    classAlias: NAVIGATION_TARGET_ALIAS,
    className: props.targetClassName,
  });
  return `
    SELECT [${NAVIGATION_IDS_ALIAS}].[id], ec_classname([${NAVIGATION_TARGET_ALIAS}].[ECClassId], 's.c'), ${labelSelector}
    FROM (${props.innerEcsql}) [${NAVIGATION_IDS_ALIAS}]
    LEFT JOIN ${ECSql.createClassSelector(props.targetClassName)} [${NAVIGATION_TARGET_ALIAS}] ON [${NAVIGATION_TARGET_ALIAS}].[ECInstanceId] = [${NAVIGATION_IDS_ALIAS}].[id]
  `;
}

/**
 * Converts a query row's raw column value to the public `Value` shape. The only case needing
 * conversion is a whole point column, which the query reader returns with uppercase coordinate
 * members (`{ X, Y[, Z] }`) — the public `Point2dValue` / `Point3dValue` shapes use lowercase.
 *
 * Only property fields are considered: a calculated field's declared type doesn't constrain its row
 * shape (its selector is an arbitrary scalar expression), so keying the conversion off a declared
 * point type there would turn a scalar row value into `{ x: undefined, y: undefined }`.
 */
function rowValueToValue(field: PropertyField | CalculatedField, raw: unknown): Value {
  if (
    raw !== undefined &&
    field.kind === "property" &&
    field.type.kind === "primitive" &&
    (field.type.type === "Point2d" || field.type.type === "Point3d")
  ) {
    const coords = raw as Record<string, number>;
    return field.type.type === "Point3d" ? { x: coords.X, y: coords.Y, z: coords.Z } : { x: coords.X, y: coords.Y };
  }
  return raw as Value;
}

/**
 * Converts a navigation field's query row to a `DistinctNavigationValue`. A SQL-NULL navigation value
 * carries no target instance, so it's yielded as `undefined` — the same plain `Value` any other field
 * yields for a NULL.
 */
function rowValueToNavigationValue(props: { row: ECSqlQueryRow }): Value | undefined {
  const { row } = props;
  const id = row[0] as Id64String | undefined;
  const className = row[1] as EC.FullClassNameDotNotation | undefined;
  if (id === undefined || className === undefined) {
    return undefined;
  }
  return { key: { className, id }, label: parseInstanceLabel(row[2] as string | undefined) };
}

/**
 * Streams a single content target's `SELECT DISTINCT` results, releasing the
 * underlying query reader when the returned observable is unsubscribed (including on early consumer
 * cancellation).
 */
function streamTargetDistinctValues(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  target: ContentTarget;
  field: PropertyField | CalculatedField;
  filters?: ContentValueFilter[];
  labelsFactory: IInstanceLabelSelectClauseFactory;
}): Observable<Value> {
  const { imodelAccess, target, field, filters, labelsFactory } = props;
  const isNavigationField = field.type.kind === "navigation";
  return from(buildDistinctValuesQuery({ schemaProvider: imodelAccess, target, field, filters, labelsFactory })).pipe(
    mergeMap((query) => {
      const reader = imodelAccess.createQueryReader(query, { rowFormat: "Indexes" });
      // Calling `return()` on the iterator cancels the query execution on the backend and frees up resources.
      return from(reader).pipe(finalize(() => void reader.return?.(undefined)));
    }),
    map((row): Value => (isNavigationField ? rowValueToNavigationValue({ row }) : rowValueToValue(field, row[0]))),
  );
}

/**
 * Gets distinct raw values for a single field across the given content targets.
 *
 * The field itself carries the join path from the content target to the property (for a related
 * property field), so resolved content sources are not needed — this builds and executes one
 * `SELECT DISTINCT <field selector>` query per target directly from the field's own metadata plus the
 * target, and merges/de-duplicates the results.
 *
 * @public
 */
export function getDistinctFieldValues(props: GetDistinctFieldValuesProps): AsyncIterable<Value> {
  const { imodelAccess, targets, field, filters } = props;
  const labelsFactory = props.labelsFactory ?? createIModelInstanceLabelSelectClauseFactory({ imodelAccess });
  const isNavigation = field.type.kind === "navigation";
  return {
    [Symbol.asyncIterator]: (): AsyncIterableIterator<Value> => {
      const values = from(targets).pipe(
        mergeMap(
          (target) => streamTargetDistinctValues({ imodelAccess, target, field, filters, labelsFactory }),
          QUERY_CONCURRENCY,
        ),
        distinct((value): string | undefined => {
          if (value === undefined) {
            return undefined;
          }
          return isNavigation ? (value as NavigationValue).key.id : stableStringify(value);
        }),
      );
      return eachValueFrom(values);
    },
  };
}
