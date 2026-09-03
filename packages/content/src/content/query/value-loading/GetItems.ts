/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, defer, EMPTY, expand, finalize, forkJoin, from, map, mergeMap, of, toArray } from "rxjs";
import {
  eachValueFrom,
  type ECSchemaProvider,
  type ECSqlQueryDef,
  type ECSqlQueryExecutor,
  type ECSqlQueryRow,
  type InstanceKey,
  type PrimitiveValue,
  type Value,
} from "@itwin/presentation-shared";
import { createContentItem } from "../../model/ContentItem.js";
import { buildBaseQuery } from "../BaseQuery.js";
import { QUERY_CONCURRENCY } from "../QueryConcurrency.js";
import { PAGE_SIZE } from "../QueryLimits.js";
import { buildSelectProjection } from "../SelectBuilder.js";
import { buildAnchorPageQuery, buildKeyStreamQuery, buildValueQuery } from "./PageQueries.js";
import { decodePrimaryKey, decodeSelectorValues, mergeSelectorValues, toContentValues } from "./RowDecoder.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type { ContentValueFilter } from "../../Content.js";
import type { ContentSource } from "../../ContentTarget.js";
import type { QueryFilterer } from "../../extensions/QueryFilterer.js";
import type { ContentDescriptor } from "../../model/ContentDescriptor.js";
import type { ContentItem } from "../../model/ContentItem.js";
import type { ContentQuerySort, SelectProjection } from "../SelectBuilder.js";
import type { Cursor, PlannedGroup, SourcePlan } from "./PageQueries.js";

/**
 * Loads content items for the configured sources, paging with a keyset cursor and stitching SQL-backed
 * values into `ContentItem` accessors. External fields are left `undefined` — Stage 5 populates them.
 *
 * @internal
 */
export function getItems(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  getDescriptor: () => Promise<ContentDescriptor>;
  sources: ContentSource[];
  queryFilterers?: QueryFilterer[];
  filters?: ContentValueFilter[];
  sorting?: ContentQuerySort[];
}): AsyncIterable<ContentItem> {
  return {
    [Symbol.asyncIterator]() {
      return eachValueFrom(loadItems(props));
    },
  };
}

function loadItems(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  getDescriptor: () => Promise<ContentDescriptor>;
  sources: ContentSource[];
  queryFilterers?: QueryFilterer[];
  filters?: ContentValueFilter[];
  sorting?: ContentQuerySort[];
}): Observable<ContentItem> {
  const { imodelAccess, getDescriptor, sources, queryFilterers, filters } = props;
  const sorting = props.sorting ?? [];
  const hasSort = sorting.length > 0;
  return from(getDescriptor()).pipe(
    mergeMap((descriptor) =>
      from(sources).pipe(
        mergeMap(async (source) =>
          createSourcePlan({ imodelAccess, descriptor, source, sorting, queryFilterers, filters }),
        ),
        toArray(),
        mergeMap((plans) => {
          if (plans.length === 1 || !hasSort) {
            // Single source (sorted or not) and multi-source unsorted both page each source's anchor directly and
            // stitch its additional groups; multi-source unsorted pages the sources concurrently (up to QUERY_CONCURRENCY).
            return from(plans).pipe(
              mergeMap((plan) => pageAnchor({ imodelAccess, descriptor, plan, sorting }), QUERY_CONCURRENCY),
            );
          }

          // Multiple sources sorted by a shared key: order and page globally with the two-phase key stream.
          return pageMultiSourceSorted({ imodelAccess, descriptor, plans, sorting });
        }),
      ),
    ),
  );
}

async function createSourcePlan(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  descriptor: ContentDescriptor;
  source: ContentSource;
  sorting: ContentQuerySort[];
  queryFilterers?: QueryFilterer[];
  filters?: ContentValueFilter[];
}): Promise<SourcePlan> {
  const { imodelAccess, descriptor, source, sorting, queryFilterers, filters } = props;
  const { anchor, additional = [] } = await buildBaseQuery({
    schemaProvider: imodelAccess,
    source,
    queryFilterers,
    filters,
    sortFields: sorting.map((sort) => sort.field),
    includeRelatedJoins: true,
  });
  const [anchorProjection, keyProjection, additionalProjections] = await Promise.all([
    buildSelectProjection({ schemaProvider: imodelAccess, descriptor, group: anchor, sorting }),
    buildSelectProjection({
      schemaProvider: imodelAccess,
      descriptor: { ...descriptor, selectors: {} },
      group: anchor,
      sorting,
    }),
    Promise.all(
      additional.map(async (group) => buildSelectProjection({ schemaProvider: imodelAccess, descriptor, group })),
    ),
  ]);
  return {
    anchor: { baseQuery: anchor, projection: anchorProjection, keyProjection },
    additional: additional.map((baseQuery, index) => ({ baseQuery, projection: additionalProjections[index] })),
  };
}

interface PageResult {
  items: ContentItem[];
  next: Cursor | undefined;
}

function pageAnchor(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  descriptor: ContentDescriptor;
  plan: SourcePlan;
  sorting: ContentQuerySort[];
}): Observable<ContentItem> {
  const { imodelAccess, descriptor, plan, sorting } = props;
  const fetchPage = (cursor: Cursor | undefined): Observable<PageResult> =>
    readRows(imodelAccess, buildAnchorPageQuery({ plan, sorting, cursor })).pipe(
      mergeMap((rows) => {
        if (rows.length === 0) {
          return of<PageResult>({ items: [], next: undefined });
        }
        const decoded = rows.map((row) => ({
          primaryKey: decodePrimaryKey({ row, columnNames: plan.anchor.projection.columnNames }),
          selectorValues: decodeSelectorValues({ row, descriptor, columnNames: plan.anchor.projection.columnNames }),
          sortValues: readSortValues({ row, sort: plan.anchor.projection.sort }),
        }));
        return fetchGroupValues({
          imodelAccess,
          descriptor,
          groups: plan.additional,
          ids: decoded.map((item) => item.primaryKey.id),
        }).pipe(
          map((additionalValuesById): PageResult => {
            const items = decoded.map((item) => {
              const additionalValues = additionalValuesById.get(item.primaryKey.id);
              if (additionalValues) {
                mergeSelectorValues(item.selectorValues, additionalValues);
              }
              return createContentItem({
                descriptor,
                contentValues: toContentValues({
                  descriptor,
                  primaryKey: item.primaryKey,
                  selectorValues: item.selectorValues,
                }),
              });
            });
            if (rows.length < PAGE_SIZE) {
              return { items, next: undefined };
            }
            const last = decoded[decoded.length - 1];
            return { items, next: { sortValues: last.sortValues, primaryKey: last.primaryKey } };
          }),
        );
      }),
    );

  return fetchPage(undefined).pipe(
    expand((page) => (page.next ? fetchPage(page.next) : EMPTY)),
    concatMap((page) => from(page.items)),
  );
}

interface KeyPage {
  keys: InstanceKey[];
  next: Cursor | undefined;
}

function pageMultiSourceSorted(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  descriptor: ContentDescriptor;
  plans: SourcePlan[];
  sorting: ContentQuerySort[];
}): Observable<ContentItem> {
  const { imodelAccess, descriptor, plans, sorting } = props;
  const keyProjection = plans[0].anchor.keyProjection;

  // Phase 1: page the globally ordered key stream. The next cursor is derived from the key rows alone, so
  // this can advance ahead of value loading.
  const fetchKeyPage = (cursor: Cursor | undefined): Observable<KeyPage> =>
    readRows(imodelAccess, buildKeyStreamQuery({ plans, sorting, cursor })).pipe(
      map((keyRows) => {
        const keys = keyRows.map((row) => decodePrimaryKey({ row, columnNames: keyProjection.columnNames }));
        if (keyRows.length < PAGE_SIZE) {
          return { keys, next: undefined };
        }
        // Only the final row seeds the next keyset cursor, so decode sort values for it alone.
        const lastRow = keyRows[keyRows.length - 1];
        const next: Cursor = {
          primaryKey: keys[keys.length - 1],
          sortValues: readSortValues({ row: lastRow, sort: keyProjection.sort }),
        };
        return { keys, next };
      }),
    );

  // Phase 2: for a page's keys, pull every plan's anchor and additional groups by an IdSet restriction and
  // merge their values by id. All groups across all plans share a single QUERY_CONCURRENCY budget.
  const fetchValues = (keys: InstanceKey[]): Observable<ContentItem[]> => {
    const ids = keys.map((key) => key.id);
    const groups = plans.flatMap((plan) => [plan.anchor, ...plan.additional]);
    return fetchGroupValues({ imodelAccess, descriptor, groups, ids }).pipe(
      map((valuesById) =>
        keys.map((key) => {
          const selectorValues = valuesById.get(key.id) ?? new Map<string, Value>();
          return createContentItem({
            descriptor,
            contentValues: toContentValues({ descriptor, primaryKey: key, selectorValues }),
          });
        }),
      ),
    );
  };

  // Overlap the phases: load the current page's values while prefetching the next page's keys, bounding the
  // prefetch to a single page ahead.
  const step = (page: KeyPage): Observable<{ items: ContentItem[]; next: KeyPage | undefined }> =>
    forkJoin({ items: fetchValues(page.keys), next: page.next ? fetchKeyPage(page.next) : of(undefined) });

  return fetchKeyPage(undefined).pipe(
    mergeMap(step),
    expand((result) => (result.next ? step(result.next) : EMPTY)),
    concatMap((result) => from(result.items)),
  );
}

function fetchGroupValues(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  descriptor: ContentDescriptor;
  groups: PlannedGroup[];
  ids: Id64String[];
}): Observable<Map<Id64String, Map<string, Value>>> {
  const { imodelAccess, descriptor, groups, ids } = props;
  if (groups.length === 0 || ids.length === 0) {
    return of(new Map());
  }
  return from(groups).pipe(
    mergeMap(
      ({ baseQuery, projection }) =>
        readRows(imodelAccess, buildValueQuery({ baseQuery, projection, ids })).pipe(
          map((rows) =>
            rows.map((row) => ({
              id: row[projection.columnNames.primaryKey.id] as Id64String,
              selectorValues: decodeSelectorValues({ row, descriptor, columnNames: projection.columnNames }),
            })),
          ),
        ),
      QUERY_CONCURRENCY,
    ),
    toArray(),
    map((perGroup) => {
      const result = new Map<Id64String, Map<string, Value>>();
      for (const groupRows of perGroup) {
        for (const { id, selectorValues } of groupRows) {
          const existing = result.get(id);
          if (existing) {
            // TODO(1:many): a 1:many group returns multiple rows per id, all sharing the same selectors,
            // so this merge trips the duplicate-selector guard and throws. Accumulate into index-aligned
            // per-selector arrays instead
            mergeSelectorValues(existing, selectorValues);
          } else {
            result.set(id, selectorValues);
          }
        }
      }
      return result;
    }),
  );
}

function readSortValues(props: {
  row: ECSqlQueryRow;
  sort: SelectProjection["sort"];
}): Array<PrimitiveValue | undefined> {
  return props.sort.map(({ column }) => {
    const value = props.row[column];
    return value === null ? undefined : (value as PrimitiveValue);
  });
}

// Emits the whole page as a single array rather than streaming rows: callers batch the value-fetch by
// id-set, derive the keyset cursor from the last row, and decide pagination from the row count.
function readRows(imodelAccess: ECSqlQueryExecutor, query: ECSqlQueryDef): Observable<ECSqlQueryRow[]> {
  return defer(() => {
    const reader = imodelAccess.createQueryReader(query, { rowFormat: "ECSqlPropertyNames" });
    return from(reader).pipe(
      toArray(),
      // Calling `return()` on the iterator cancels the query on the backend and frees its resources.
      finalize(() => void reader.return?.(undefined)),
    );
  });
}
