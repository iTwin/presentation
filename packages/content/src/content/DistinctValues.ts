/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { distinct, finalize, from, map, mergeMap } from "rxjs";
import { eachValueFrom } from "@itwin/presentation-shared";
import { mergeBindings, stableStringify } from "./InternalUtils.js";
import { buildTargetScopedQuery, classifyRelationshipClasses, resolveFieldSelector } from "./query/BaseQuery.js";
import { QUERY_CONCURRENCY } from "./query/QueryConcurrency.js";

import type { Observable } from "rxjs";
import type {
  EC,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  Value,
} from "@itwin/presentation-shared";
import type { ContentValueFilter } from "./Content.js";
import type { ContentTarget } from "./ContentTarget.js";
import type { CalculatedField, PropertyField } from "./model/Field.js";

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
}

/**
 * Builds a single-target `SELECT DISTINCT <field selector>` query for `getDistinctFieldValues`.
 */
export async function buildDistinctValuesQuery(props: {
  schemaProvider: ECSchemaProvider;
  target: ContentTarget;
  field: PropertyField | CalculatedField;
  filters?: ContentValueFilter[];
}): Promise<ECSqlQueryDef> {
  const { schemaProvider, target, field } = props;
  const filters = props.filters ?? [];

  if (field.type.kind === "array" || field.type.kind === "struct") {
    throw new Error(`Getting distinct values for ${field.type.kind} fields is not supported.`);
  }

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
  const selector = field.type.kind === "navigation" ? `${resolved.selector}.[Id]` : resolved.selector;

  const bindings: Record<string, ECSqlBinding> = { ...parts.bindings };
  mergeBindings(bindings, resolved.bindings);

  const ecsql = `SELECT DISTINCT ${selector} ${parts.from} ${parts.joins}${parts.where ? ` ${parts.where}` : ""}`;
  return { ecsql, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
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
 * Streams a single content target's `SELECT DISTINCT` results, releasing the
 * underlying query reader when the returned observable is unsubscribed (including on early consumer
 * cancellation).
 */
function streamTargetDistinctValues(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  target: ContentTarget;
  field: PropertyField | CalculatedField;
  filters?: ContentValueFilter[];
}): Observable<Value> {
  const { imodelAccess, target, field, filters } = props;
  return from(buildDistinctValuesQuery({ schemaProvider: imodelAccess, target, field, filters })).pipe(
    mergeMap((query) => {
      const reader = imodelAccess.createQueryReader(query, { rowFormat: "Indexes" });
      // Calling `return()` on the iterator cancels the query execution on the backend and frees up resources.
      return from(reader).pipe(finalize(() => void reader.return?.(undefined)));
    }),
    map((row): Value => rowValueToValue(field, row[0])),
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
  return {
    [Symbol.asyncIterator]: (): AsyncIterableIterator<Value> => {
      const values$ = from(targets).pipe(
        mergeMap((target) => streamTargetDistinctValues({ imodelAccess, target, field, filters }), QUERY_CONCURRENCY),
        distinct((value): string => stableStringify(value)),
      );
      return eachValueFrom(values$);
    },
  };
}
