/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, defer, EMPTY, expand, finalize, forkJoin, from, map, mergeMap, of, toArray } from "rxjs";
import { assert } from "@itwin/core-bentley";
import {
  eachValueFrom,
  type ECSchemaProvider,
  type ECSqlQueryDef,
  type ECSqlQueryExecutor,
  type ECSqlQueryRow,
  type InstanceKey,
  type PrimitiveValue,
} from "@itwin/presentation-shared";
import { createContentItem } from "../../model/ContentItem.js";
import { serializeRelationshipPath } from "../../model/Utils.js";
import { collectPathCardinalities } from "../../PathCardinality.js";
import { buildBaseQuery } from "../BaseQuery.js";
import { QUERY_CONCURRENCY } from "../QueryConcurrency.js";
import { PAGE_SIZE } from "../QueryLimits.js";
import { buildSelectProjection } from "../SelectBuilder.js";
import { createExternalValuePopulator } from "./ExternalValues.js";
import { buildAnchorPageQuery, buildKeyStreamQuery, buildValueQuery } from "./PageQueries.js";
import {
  buildRelatedInstanceKeyMap,
  decodeGroupRows,
  decodePrimaryKey,
  mergeGroupValues,
  toContentValues,
} from "./RowDecoder.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type { ContentValueFilter } from "../../Content.js";
import type { ContentSource } from "../../ContentTarget.js";
import type { ExternalFieldsProvider } from "../../extensions/ExternalFieldsProvider.js";
import type { QueryFilterer } from "../../extensions/QueryFilterer.js";
import type { ContentDescriptor } from "../../model/ContentDescriptor.js";
import type { ContentItem } from "../../model/ContentItem.js";
import type { PropertyValueSelector } from "../../model/ValueSelector.js";
import type { BaseQueryGroup } from "../BaseQuery.js";
import type { ContentQuerySort, SelectProjection } from "../SelectBuilder.js";
import type { ExternalValuePopulator } from "./ExternalValues.js";
import type { Cursor, PlannedGroup, SourcePlan } from "./PageQueries.js";
import type { GroupValues } from "./RowDecoder.js";

/**
 * Loads content items for the configured sources, paging with a keyset cursor and stitching SQL-backed
 * values into `ContentItem` accessors. Once a page's SQL-backed values are stitched, every configured
 * external fields provider is called once with that page's pre-extracted input values and its declared
 * fields are merged in before the items are emitted.
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
  externalFieldsProviders?: ExternalFieldsProvider[];
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
  externalFieldsProviders?: ExternalFieldsProvider[];
}): Observable<ContentItem> {
  const { imodelAccess, getDescriptor, sources, queryFilterers, filters, externalFieldsProviders } = props;
  const sorting = props.sorting ?? [];
  const hasSort = sorting.length > 0;
  return from(getDescriptor()).pipe(
    mergeMap((descriptor) => {
      const populateExternalValues = createExternalValuePopulator({ descriptor, providers: externalFieldsProviders });
      // A descriptor-level fact (which internal join-path key maps to which public one) built once per
      // descriptor rather than re-derived for every item.
      const relatedInstanceKeyMap = buildRelatedInstanceKeyMap(descriptor);
      return from(sources).pipe(
        mergeMap(async (source) =>
          createSourcePlan({ imodelAccess, descriptor, source, sorting, queryFilterers, filters }),
        ),
        toArray(),
        mergeMap((plans) => {
          if (plans.length === 1 || !hasSort) {
            // Single source (sorted or not) and multi-source unsorted both page each source's anchor directly and
            // stitch its additional groups; multi-source unsorted pages the sources concurrently (up to QUERY_CONCURRENCY).
            return from(plans).pipe(
              mergeMap(
                (plan) =>
                  pageAnchor({
                    imodelAccess,
                    descriptor,
                    plan,
                    sorting,
                    populateExternalValues,
                    relatedInstanceKeyMap,
                  }),
                QUERY_CONCURRENCY,
              ),
            );
          }

          // Multiple sources sorted by a shared key: order and page globally with the two-phase key stream.
          return pageMultiSourceSorted({
            imodelAccess,
            descriptor,
            plans,
            sorting,
            populateExternalValues,
            relatedInstanceKeyMap,
          });
        }),
      );
    }),
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
  const propertySelectorPaths = Object.values(descriptor.selectors)
    .filter((selector): selector is PropertyValueSelector => selector.kind === "property")
    .map((selector) => selector.pathFromTarget)
    .filter((path) => path.length > 0);
  const { anchor, additional = [] } = await buildBaseQuery({
    schemaProvider: imodelAccess,
    source,
    queryFilterers,
    filters,
    sortFields: sorting.map((sort) => sort.field),
    includeRelatedJoins: true,
    cardinalityHints: collectPathCardinalities(descriptor),
    propertySelectorPaths,
  });
  // [anchor, ...additional] order matters: it is the tie-break order `assignPathOwnership` uses for a
  // key resolvable in more than one group's alias map but not a leaf path of any of them.
  const ownedPathKeys = assignPathOwnership(anchor, additional);
  const [anchorProjection, keyProjection, additionalProjections] = await Promise.all([
    buildSelectProjection({
      schemaProvider: imodelAccess,
      descriptor,
      group: anchor,
      sorting,
      ownedPathKeys: ownedPathKeys.anchor,
    }),
    buildSelectProjection({
      schemaProvider: imodelAccess,
      descriptor: { ...descriptor, selectors: {} },
      group: anchor,
      sorting,
      ownedPathKeys: ownedPathKeys.anchor,
    }),
    Promise.all(
      additional.map(async (group, index) =>
        buildSelectProjection({
          schemaProvider: imodelAccess,
          descriptor,
          group,
          ownedPathKeys: ownedPathKeys.additional[index],
        }),
      ),
    ),
  ]);
  return {
    anchor: { baseQuery: anchor, projection: anchorProjection, keyProjection },
    additional: additional.map((baseQuery, index) => ({ baseQuery, projection: additionalProjections[index] })),
  };
}

/**
 * Assigns every join-path key resolvable by any of `anchor`'s or `additional`'s alias maps to exactly
 * one owner, so `buildSelectProjection` projects a selector from a single group. The group whose own
 * `paths` lists the key as a leaf path wins; a key that is nobody's leaf path (a prefix shared with a
 * longer, differently-grouped path, or a filter/sort-only path) goes to the first group that can resolve
 * it — `anchor`, then `additional` in order — so the anchor wins ties. Direct properties and calculated
 * selectors share the key `""` (a direct property's empty `pathFromTarget` serializes to `""`, and
 * neither kind can overflow into another group), so it is seeded onto the anchor alone.
 */
function assignPathOwnership(
  anchor: BaseQueryGroup,
  additional: BaseQueryGroup[],
): { anchor: Set<string>; additional: Set<string>[] } {
  const groups = [anchor, ...additional];
  const owned = groups.map(() => new Set<string>());
  owned[0].add("");
  const claimed = new Set<string>([""]);
  for (const [index, group] of groups.entries()) {
    for (const { path } of group.paths) {
      const key = serializeRelationshipPath({ path, includeInstanceFilters: true });
      // `splitRelatedPaths` partitions each unique path into exactly one group, so a leaf path's key is
      // never already claimed here.
      assert(!claimed.has(key), `Join-path key "${key}" is a leaf path of more than one group.`);
      owned[index].add(key);
      claimed.add(key);
    }
  }
  for (const [index, group] of groups.entries()) {
    for (const key of group.parts.relatedClassAliases.keys()) {
      if (!claimed.has(key)) {
        owned[index].add(key);
        claimed.add(key);
      }
    }
  }
  return { anchor: owned[0], additional: owned.slice(1) };
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
  populateExternalValues: ExternalValuePopulator | undefined;
  relatedInstanceKeyMap: Map<string, string>;
}): Observable<ContentItem> {
  const { imodelAccess, descriptor, plan, sorting, populateExternalValues, relatedInstanceKeyMap } = props;
  const { columnNames } = plan.anchor.projection;
  const fetchPage = (cursor: Cursor | undefined): Observable<PageResult> =>
    readRows(imodelAccess, buildAnchorPageQuery({ plan, sorting, cursor })).pipe(
      mergeMap((anchorRows) =>
        fetchGroupRows({
          imodelAccess,
          groups: plan.additional,
          ids: anchorRows.map((row) => row[columnNames.primaryKey.id] as Id64String),
        }).pipe(map((rowsByGroup) => ({ anchorRows, rowsByGroup }))),
      ),
      map(({ anchorRows, rowsByGroup }) => {
        const valuesById = stitchPlans({
          descriptor,
          plans: [plan],
          rowsByGroup: rowsByGroup.set(plan.anchor, anchorRows),
        });
        return anchorRows.map((row) => {
          const primaryKey = decodePrimaryKey({ row, columnNames });
          return {
            primaryKey,
            values: valuesById.get(primaryKey.id)!,
            sortValues: readSortValues({ row, sort: plan.anchor.projection.sort }),
          };
        });
      }),
      mergeMap((decoded) =>
        materializeItems({ descriptor, populateExternalValues, relatedInstanceKeyMap, rows: decoded }).pipe(
          map((items): PageResult => {
            if (decoded.length < PAGE_SIZE) {
              return { items, next: undefined };
            }
            const last = decoded[decoded.length - 1];
            return { items, next: { sortValues: last.sortValues, primaryKey: last.primaryKey } };
          }),
        ),
      ),
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
  populateExternalValues: ExternalValuePopulator | undefined;
  relatedInstanceKeyMap: Map<string, string>;
}): Observable<ContentItem> {
  const { imodelAccess, descriptor, plans, sorting, populateExternalValues, relatedInstanceKeyMap } = props;
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
  // stitch their values by id. All groups across all plans share a single QUERY_CONCURRENCY budget.
  const fetchValues = (keys: InstanceKey[]): Observable<ContentItem[]> => {
    const groups = plans.flatMap((plan) => [plan.anchor, ...plan.additional]);
    return fetchGroupRows({ imodelAccess, groups, ids: keys.map((key) => key.id) }).pipe(
      mergeMap((rowsByGroup) => {
        const valuesById = stitchPlans({ descriptor, plans, rowsByGroup });
        return materializeItems({
          descriptor,
          populateExternalValues,
          relatedInstanceKeyMap,
          rows: keys.map((key) => ({
            primaryKey: key,
            values: valuesById.get(key.id) ?? { selectorValues: new Map(), relatedInstances: new Map() },
          })),
        });
      }),
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

// Maps stitched values onto descriptor fields and, when providers are configured, enriches the resulting
// items with external field values before wrapping them as `ContentItem`s.
function materializeItems(props: {
  descriptor: ContentDescriptor;
  populateExternalValues: ExternalValuePopulator | undefined;
  relatedInstanceKeyMap: Map<string, string>;
  rows: Array<{ primaryKey: InstanceKey; values: GroupValues }>;
}): Observable<ContentItem[]> {
  const { descriptor, populateExternalValues, relatedInstanceKeyMap, rows } = props;
  const contentValues = rows.map((row) =>
    toContentValues({ descriptor, primaryKey: row.primaryKey, values: row.values, relatedInstanceKeyMap }),
  );
  if (!populateExternalValues || rows.length === 0) {
    return of(contentValues.map((values) => createContentItem({ descriptor, contentValues: values })));
  }
  return populateExternalValues(rows.map((row) => row.values)).pipe(
    map((externalValuesByRow) =>
      contentValues.map((values, index) => {
        Object.assign(values.values, externalValuesByRow[index]);
        return createContentItem({ descriptor, contentValues: values });
      }),
    ),
  );
}

// Runs every group's value query for the page's ids — a flat pipeline sharing a single QUERY_CONCURRENCY
// budget — and hands back each group's raw rows.
function fetchGroupRows(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  groups: PlannedGroup[];
  ids: Id64String[];
}): Observable<Map<PlannedGroup, ECSqlQueryRow[]>> {
  const { imodelAccess, groups, ids } = props;
  if (groups.length === 0 || ids.length === 0) {
    return of(new Map());
  }
  return from(groups).pipe(
    mergeMap(
      (group) =>
        readRows(imodelAccess, buildValueQuery({ baseQuery: group.baseQuery, projection: group.projection, ids })).pipe(
          map((rows): [PlannedGroup, ECSqlQueryRow[]] => [group, rows]),
        ),
      QUERY_CONCURRENCY,
    ),
    toArray(),
    map((entries) => new Map(entries)),
  );
}

/**
 * Stitches every plan's group rows into one `primary id -> values` map. A plan's anchor rows say which of
 * the page's primaries belong to it, and each of its additional groups is decoded against exactly those
 * ids — a `"many"` group reports `[]` for a primary of this plan that reached no related instance, and a
 * row an additional group returned for another plan's primary (possible when sources' targets overlap) is
 * ignored. Each selector and join-path key is owned by exactly one group (`assignPathOwnership`), so merging
 * is a disjoint union and `mergeGroupValues` throws only on a planning bug.
 */
function stitchPlans(props: {
  descriptor: ContentDescriptor;
  plans: SourcePlan[];
  rowsByGroup: Map<PlannedGroup, ECSqlQueryRow[]>;
}): Map<Id64String, GroupValues> {
  const { descriptor, plans, rowsByGroup } = props;
  const result = new Map<Id64String, GroupValues>();
  const mergeInto = (groupValues: Map<Id64String, GroupValues>) => {
    for (const [id, values] of groupValues) {
      const existing = result.get(id);
      if (existing) {
        mergeGroupValues(existing, values);
      } else {
        result.set(id, values);
      }
    }
  };
  const decode = (group: PlannedGroup, ids?: Id64String[]) =>
    decodeGroupRows({
      rows: rowsByGroup.get(group) ?? [],
      descriptor,
      cardinality: group.baseQuery.cardinality,
      columnNames: group.projection.columnNames,
      ids,
    });

  for (const plan of plans) {
    const anchorValues = decode(plan.anchor);
    const ids = [...anchorValues.keys()];
    mergeInto(anchorValues);
    for (const group of plan.additional) {
      mergeInto(decode(group, ids));
    }
  }
  return result;
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
