/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { ECSql, getClass } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, mergeBindings, PRIMARY_CLASS_ALIAS, substituteExpressionAlias } from "../InternalUtils.js";
import { serializeRelationshipPath } from "../model/Utils.js";
import {
  classifyPathCardinality,
  countJoinTables,
  packPathsWithinBudget,
  partitionPathsByJoinBudget,
} from "./QueryLimits.js";
import { buildTargetFilter } from "./TargetFilter.js";
import { buildValueFilterClause, buildValueFilterClauses } from "./ValueFilters.js";

import type {
  EC,
  ECSchemaProvider,
  ECSqlBinding,
  PrimitiveValueType,
  RelationshipPath,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../Content.js";
import type { CardinalityHint, ContentSource, ContentTarget, ResolvedPath } from "../ContentTarget.js";
import type { QueryFilterer } from "../extensions/QueryFilterer.js";
import type { CalculatedField, PropertyField } from "../model/Field.js";

/** The resolved, render-ready join structure `ECSql.createRelationshipPathJoinInfo` produces for a path. */
type RelationshipPathJoinInfo = Awaited<ReturnType<typeof ECSql.createRelationshipPathJoinInfo>>;

/**
 * The `FROM` / `JOIN` / `WHERE` fragments (and their bindings) of a base content query, plus the
 * alias information downstream `SELECT` builders need to emit their own columns.
 */
interface BaseQueryParts {
  /** `FROM <primary-selector> [this]`. */
  from: string;
  /** IdSet join + merged relationship-path joins + query-filterer joins. */
  joins: string;
  /** Complete WHERE clause with ANDed conditions, or undefined. */
  where?: string;
  bindings?: Record<string, ECSqlBinding>;
  /** Alias of the primary class in the FROM clause. Always `"this"`. */
  primaryClassAlias: string;
  /**
   * `serializeJoinPath(prefix) -> { target, relationship }` for every **related** path prefix (incl.
   * intermediate classes). Keyed by {@link serializeJoinPath} (not the plain serialization) so paths
   * differing only by a step `instanceFilter` map to distinct aliases. Both aliases carry the
   * `ECSQL_PREFIX` (e.g. `pres_t0` / `pres_r0`). `target` locates the step's target-class table;
   * `relationship` locates the step's relationship-class table (a relationship-class property field
   * reads from it). Every entry is a related step, so `relationship` is **always** defined. Direct
   * properties (empty `pathFromTarget`) use `primaryClassAlias`, not this map.
   */
  relatedClassAliases: Map<string, { target: string; relationship: string }>;
}

/**
 * A single base-query group — a subset of a source's related paths joined onto the shared primaries.
 */
interface BaseQueryGroup {
  /** Subset of the source's resolved paths this group joins (used by Stage 4 stitching). */
  paths: ResolvedPath[];
  parts: BaseQueryParts;
}

/**
 * Props shared by both `buildBaseQuery` overloads.
 */
interface BuildBaseQueryProps {
  schemaProvider: ECSchemaProvider;
  source: ContentSource;
  /** Query filterers to inject WHERE/JOIN (default: none). */
  queryFilterers?: QueryFilterer[];
  /** Value filters to translate into WHERE (default: none). */
  filters?: ContentValueFilter[];
}

/**
 * The output of `buildBaseQuery`: an always-present `anchor` group plus, when related joins split, the
 * `additional` groups to stitch onto it.
 *
 * @internal
 */
export interface BaseQuery {
  /**
   * The **anchor** group — always present (even for a direct-only source). Owns the primary-key +
   * direct + calculated columns plus its share of 1:1 related columns, and drives ORDER BY + paging.
   * Also carries the primary-restricting clauses (query filterers + value filters), so it additionally
   * joins budget-fitting 1:1 paths referenced by value filters — even when their selected columns are
   * owned by an `additional` group. Overflow 1:1 paths and all 1:many paths use correlated subqueries.
   */
  anchor: BaseQueryGroup;
  /**
   * Additional groups stitched onto the `anchor` by primary key (via IdSet page fan-out). Present only
   * when related joins split — budget-overflow 1:1 partitions and one group per 1:many path. Each carries
   * a **disjoint** subset of the source's related paths. Omitted in primaries-only mode.
   */
  additional?: BaseQueryGroup[];
}

/**
 * Related-columns mode (`getItems`): collects, merges, aliases, and JOINs the source's related paths.
 *
 * @internal
 */
export async function buildBaseQuery(
  props: BuildBaseQueryProps & {
    includeRelatedJoins: true;
    /**
     * Provider-supplied cardinality hints per resolved path, keyed by `serializeRelationshipPath(path)`.
     * A hint wins over schema multiplicity; paths without a hint fall back to schema multiplicity
     * inspection. Only meaningful when related joins are built, so it lives on this overload only.
     */
    cardinalityHints?: Map<string, CardinalityHint>;
  },
): Promise<BaseQuery>;

/**
 * Primaries-only mode (`getSize` / `getInstanceKeys`, the default): does NOT collect/merge/alias/JOIN
 * related paths (only joins required to *evaluate filters* are emitted), never splits → only the
 * `anchor`.
 *
 * @internal
 */
export async function buildBaseQuery(
  props: BuildBaseQueryProps & { includeRelatedJoins?: false },
): Promise<Pick<BaseQuery, "anchor">>;

export async function buildBaseQuery(
  props: BuildBaseQueryProps & { includeRelatedJoins?: boolean; cardinalityHints?: Map<string, CardinalityHint> },
): Promise<BaseQuery> {
  const { schemaProvider, source } = props;
  const filters = props.filters ?? [];
  const includeRelatedJoins = props.includeRelatedJoins === true;

  const from = `FROM ${ECSql.createClassSelector(source.target.primaryClass)} [${PRIMARY_CLASS_ALIAS}]`;
  const targetFilter = buildTargetFilter(source.target);
  // Query filterers are resolved once (side-effect-free per their contract) and shared by the group
  // that carries the primary-restricting clauses.
  const filtererClauses = (props.queryFilterers ?? []).map((filterer) =>
    filterer.getFilterClauses({ targetAlias: PRIMARY_CLASS_ALIAS }),
  );

  // Related-columns mode joins every resolved path; primaries-only mode joins only the paths a value
  // filter references (to evaluate it). Value-filter paths are collected in both modes: primaries-only
  // joins exactly them, while related-columns force-joins them onto the anchor so a filtered path's
  // predicate is still evaluable even when its selected columns are owned by an additional group.
  const groupPaths = includeRelatedJoins ? collectUniquePaths(source) : [];
  const filterPaths = collectFilterPaths(filters);

  // 1:many filter paths must use correlated subqueries to avoid duplicating primary rows. 1:1 filter
  // paths keep join-and-compare evaluation while they fit the anchor's JOIN budget; overflow paths use
  // the same correlated-subquery fallback. Classification is cached because a path may be selected too.
  const cardinalityCache = new Map<string, CardinalityHint>();
  const classifyCardinality = async (path: RelationshipPath): Promise<CardinalityHint> => {
    const key = serializeRelationshipPath({ path });
    let cardinality = cardinalityCache.get(key);
    if (!cardinality) {
      cardinality = await classifyPathCardinality({
        schemaProvider,
        path,
        cardinalityHint: props.cardinalityHints?.get(key),
      });
      cardinalityCache.set(key, cardinality);
    }
    return cardinality;
  };
  const classifiedFilterPaths = await Promise.all(
    filterPaths.map(async (path) => ({ path, cardinality: await classifyCardinality(path) })),
  );
  const oneToOneFilterPaths = classifiedFilterPaths
    .filter((entry) => entry.cardinality !== "many")
    .map((entry) => entry.path);
  const oneToManyFilterPathKeys = classifiedFilterPaths
    .filter((entry) => entry.cardinality === "many")
    .map((entry) => serializeJoinPath(entry.path));

  // Serialize each path's prefix keys once (memoized by path reference); every alias lookup below reuses
  // them instead of re-serializing path slices.
  const getPrefixKeys = createPrefixKeyResolver();

  // Assign deterministic aliases to every unique related prefix up front. Being stable across the whole
  // query, they let the join info resolved for a path (below) serve both the JOIN-table budget count and
  // the rendered SQL, so a path's join info is never resolved more than once.
  const relatedClassAliases = assignPrefixAliases(
    includeRelatedJoins ? [...groupPaths.map((p) => p.path), ...filterPaths] : filterPaths,
    getPrefixKeys,
  );

  // Memoized per-(path, join type) join-info resolver. `createRelationshipPathJoinInfo` reads the schema
  // once; the result is reused for the budget count and rendered via the sync `createRelationshipPathJoinClause`
  // overload (which reads no schema).
  const resolvePathInfo = createPathInfoResolver({ schemaProvider, relatedClassAliases, getPrefixKeys });

  // Assembles one group's parts: every group shares FROM + target filter and renders its own subset of
  // related paths (merged so a shared prefix is joined once); only the group that owns the primaries (the
  // anchor, or the primaries-only group) additionally carries the query-filterer and value-filter clauses.
  const buildGroupParts = async (groupProps: {
    paths: RelationshipPath[];
    joinType: "inner" | "outer";
    includePrimaryFilters: boolean;
    existentialFilterPathKeys: Set<string>;
  }): Promise<BaseQueryParts> =>
    buildQueryParts({
      schemaProvider,
      from,
      targetFilter,
      filtererClauses,
      filters,
      relatedClassAliases,
      getPrefixKeys,
      resolvePathInfo,
      ...groupProps,
    });

  // Primary FROM, target-filter join, and query-filterer joins cannot spill. Fill remaining budget
  // with a contiguous prefix of 1:1 filter paths; all overflow filters retain query-wide aliases and
  // are evaluated in independent correlated subqueries.
  const fixedReserves =
    1 +
    (targetFilter.joins?.length ?? 0) +
    filtererClauses.reduce((count, clauses) => count + (clauses.joins?.length ?? 0), 0);
  const { fitting: fittingFilterPaths, overflow: overflowFilterPaths } = packPathsWithinBudget({
    paths: await Promise.all(
      oneToOneFilterPaths.map(async (path) => ({
        path,
        targetClassNames: [],
        joinInfo: await resolvePathInfo(path, "outer"),
      })),
    ),
    reservedTables: fixedReserves,
  });
  const joinedFilterPaths = fittingFilterPaths.map((entry) => entry.path);
  const existentialFilterPathKeys = new Set([
    ...oneToManyFilterPathKeys,
    ...overflowFilterPaths.map((entry) => serializeJoinPath(entry.path)),
  ]);

  // Primaries-only mode: no related columns and never a split — only the joins required to *evaluate*
  // budget-fitting 1:1 value filters are emitted. Other related filters use existential subqueries.
  if (!includeRelatedJoins) {
    const parts = await buildGroupParts({
      paths: joinedFilterPaths,
      joinType: "outer",
      includePrimaryFilters: true,
      existentialFilterPathKeys,
    });
    return { anchor: { paths: [], parts } };
  }

  // Related-columns mode: split the resolved paths into the anchor (primary-key + direct + calculated +
  // its share of 1:1 related columns) plus additional groups for budget-overflow 1:1 partitions and each
  // 1:many path (isolated so the anchor stays one row per primary).
  //
  // Joined filters reserve anchor tables before selected 1:1 paths are packed. Overflow filters cost no
  // top-level tables because each opens an independent subquery scope.
  const reservedTables =
    fixedReserves + fittingFilterPaths.reduce((count, entry) => count + countJoinTables(entry.joinInfo), 0);
  const { anchorPaths, additionalGroups } = await splitRelatedPaths({
    resolvePathInfo,
    classifyCardinality,
    paths: groupPaths,
    reservedTables,
  });

  // The anchor owns direct/calculated columns, so its related steps are outer-joined (an inner join
  // would drop a primary missing one related instance and take its direct columns down with it). Its join
  // set unions the anchor's own value paths with each joined filter path (a shared prefix is
  // merged by alias, so a path already selected by the anchor is joined only once).
  const anchorJoinPaths = unionPaths([...anchorPaths.map((resolved) => resolved.path), ...joinedFilterPaths]);
  const anchor: BaseQueryGroup = {
    paths: anchorPaths,
    parts: await buildGroupParts({
      paths: anchorJoinPaths,
      joinType: "outer",
      includePrimaryFilters: true,
      existentialFilterPathKeys,
    }),
  };
  if (additionalGroups.length === 0) {
    return { anchor };
  }
  const additional = await Promise.all(
    additionalGroups.map(async (group) => ({
      paths: group.paths,
      parts: await buildGroupParts({
        paths: group.paths.map((resolved) => resolved.path),
        joinType: group.joinType,
        includePrimaryFilters: false,
        existentialFilterPathKeys: new Set(),
      }),
    })),
  );
  return { anchor, additional };
}

/**
 * Splits a source's resolved related paths into the anchor's paths plus additional groups. A 1:many path
 * (a `cardinalityHint`, else schema multiplicity) is isolated into its own inner-joined group so the
 * anchor stays one row per primary; because such a path never shares a query with others, inner-joining
 * it needs no extra join-info resolution. The remaining 1:1 paths are strictly packed into the anchor,
 * then overflow is partitioned into additional groups. All stay outer-joined and reuse resolved info.
 */
async function splitRelatedPaths(props: {
  resolvePathInfo: (path: RelationshipPath, joinType: "inner" | "outer") => Promise<RelationshipPathJoinInfo>;
  /** Shared, cached classifier (see `buildBaseQuery`), so a path already classified for filtering isn't re-read. */
  classifyCardinality: (path: RelationshipPath) => Promise<CardinalityHint>;
  paths: ResolvedPath[];
  reservedTables: number;
}): Promise<{
  anchorPaths: ResolvedPath[];
  additionalGroups: { paths: ResolvedPath[]; joinType: "inner" | "outer" }[];
}> {
  const oneToOne: ResolvedPath[] = [];
  const oneToManyGroups: { paths: ResolvedPath[]; joinType: "inner" }[] = [];
  for (const resolved of props.paths) {
    const cardinality = await props.classifyCardinality(resolved.path);
    if (cardinality === "many") {
      oneToManyGroups.push({ paths: [resolved], joinType: "inner" });
    } else {
      oneToOne.push(resolved);
    }
  }

  // Resolve each 1:1 path's join info once (outer) for the budget count; the memoized resolver hands the
  // same info back when the anchor / 1:1 groups render, so it is not resolved again.
  const oneToOneWithInfo = await Promise.all(
    oneToOne.map(async (resolved) => ({ ...resolved, joinInfo: await props.resolvePathInfo(resolved.path, "outer") })),
  );
  const { fitting: anchorPartition, overflow } = packPathsWithinBudget({
    paths: oneToOneWithInfo,
    reservedTables: props.reservedTables,
  });
  const extraPartitions = partitionPathsByJoinBudget({ paths: overflow, reservedTables: props.reservedTables });
  const toResolvedPaths = (partition: typeof oneToOneWithInfo): ResolvedPath[] =>
    partition.map((entry) => ({ path: entry.path, targetClassNames: entry.targetClassNames }));

  return {
    anchorPaths: toResolvedPaths(anchorPartition),
    // 1:1 partitions stay outer so they reuse the info resolved for the count; only isolated 1:many
    // paths inner-join.
    additionalGroups: [
      ...extraPartitions.map((partition) => ({ paths: toResolvedPaths(partition), joinType: "outer" as const })),
      ...oneToManyGroups,
    ],
  };
}

/**
 * Keys a relationship path for JOIN aliasing / de-duplication. Includes each step's `instanceFilter`
 * so paths that differ only by a filter map to distinct aliases and joins (rather than being merged).
 */
function serializeJoinPath(path: RelationshipPath): string {
  return serializeRelationshipPath({ path, includeInstanceFilters: true });
}

/** Gathers every resolved path across the source's declarations, de-duplicated by serialized path. */
function collectUniquePaths(source: ContentSource): ResolvedPath[] {
  const byKey = new Map<string, ResolvedPath>();
  for (const group of source.resolvedDeclarations) {
    for (const resolved of group.paths) {
      const key = serializeJoinPath(resolved.path);
      if (!byKey.has(key)) {
        byKey.set(key, resolved);
      }
    }
  }
  return [...byKey.values()];
}

/** Collects the distinct related paths referenced by value filters (joined to evaluate their predicates). */
function collectFilterPaths(filters: ContentValueFilter[]): RelationshipPath[] {
  const byKey = new Map<string, RelationshipPath>();
  for (const filter of filters) {
    if (filter.field.kind === "property" && filter.field.pathFromTarget.length > 0) {
      const key = serializeJoinPath(filter.field.pathFromTarget);
      if (!byKey.has(key)) {
        byKey.set(key, filter.field.pathFromTarget);
      }
    }
  }
  return [...byKey.values()];
}

/** De-duplicates related paths by their serialized join key, preserving first-seen order. */
function unionPaths(paths: RelationshipPath[]): RelationshipPath[] {
  const byKey = new Map<string, RelationshipPath>();
  for (const path of paths) {
    const key = serializeJoinPath(path);
    if (!byKey.has(key)) {
      byKey.set(key, path);
    }
  }
  return [...byKey.values()];
}

/**
 * Assigns a deterministic, `ECSQL_PREFIX`-scoped alias pair (`target` / `relationship`) to every unique
 * related prefix across `paths`, so a prefix always renders under the same alias regardless of which
 * group joins it.
 */
function assignPrefixAliases(
  paths: RelationshipPath[],
  getPrefixKeys: (path: RelationshipPath) => readonly string[],
): Map<string, { target: string; relationship: string }> {
  const aliases = new Map<string, { target: string; relationship: string }>();
  const prefixKeys = new Set<string>(paths.flatMap((path) => getPrefixKeys(path)));
  [...prefixKeys].sort().forEach((key, index) => {
    aliases.set(key, { target: `${ECSQL_PREFIX}t${index}`, relationship: `${ECSQL_PREFIX}r${index}` });
  });
  return aliases;
}

/** Narrows the global prefix-alias map to the prefixes a single group joins. */
function collectPrefixAliases(
  paths: RelationshipPath[],
  all: Map<string, { target: string; relationship: string }>,
  getPrefixKeys: (path: RelationshipPath) => readonly string[],
): Map<string, { target: string; relationship: string }> {
  const aliases = new Map<string, { target: string; relationship: string }>();
  for (const path of paths) {
    for (const key of getPrefixKeys(path)) {
      aliases.set(key, all.get(key)!);
    }
  }
  return aliases;
}

/**
 * Concatenates several resolved path join infos into one, dropping duplicate join entries that share a
 * prefix (identified by `joinAlias`, which is stable across paths thanks to {@link assignPrefixAliases})
 * so a shared step is emitted exactly once.
 */
function mergeJoinInfos(infos: RelationshipPathJoinInfo[]): RelationshipPathJoinInfo {
  const seenTargets = new Set<string>();
  const steps: RelationshipPathJoinInfo["steps"] = [];
  const bindings: Record<string, ECSqlBinding> = {};
  for (const info of infos) {
    for (const step of info.steps) {
      // A step's `targetClassIdSelector` encodes its target alias, which is stable across paths (thanks
      // to {@link assignPrefixAliases}), so it identifies a shared-prefix step and lets it be emitted once.
      if (!seenTargets.has(step.targetClassIdSelector)) {
        seenTargets.add(step.targetClassIdSelector);
        steps.push(step);
      }
    }
    // Shared-prefix steps contribute identical bindings; keep an identical duplicate but reject a name
    // reused with a different value.
    mergeBindings(bindings, info.bindings);
  }
  return { steps, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
}

/**
 * Renders an inner-resolved filter path's join info as an existential-subquery skeleton: the first
 * join's target becomes the subquery's `FROM`, the remaining joins render as ordinary `JOIN`s, and the
 * first join's own `ON` condition — which always references {@link PRIMARY_CLASS_ALIAS}, since the path
 * is resolved relative to it — is pulled out as the subquery's correlation to the primary.
 */
function buildExistentialSkeleton(info: RelationshipPathJoinInfo) {
  const [first, ...rest] = info.steps.flatMap((step) => step.joins);
  // The path is always resolved with joinType "inner", so `createRelationshipPathJoinInfo` never
  // produces the outer link-table subquery wrapper (`relationship-select`) here. `first` is guaranteed
  // to exist since `collectFilterPaths` only ever collects a non-empty `pathFromTarget`.
  assert(first.joinTarget.kind === "class", "Expected a resolved join to a class, not a relationship-select subquery");
  const { joins, bindings } = ECSql.createRelationshipPathJoinClause({ steps: [{ joins: rest }] });
  return {
    from: `${ECSql.createClassSelector(first.joinTarget.className)} [${first.joinAlias}]`,
    joins,
    bindings,
    correlation: first.joinCondition,
  };
}

/**
 * Builds a correlated clause for a value filter that should not join the primary-owning group. This is
 * used for every 1:many path (to avoid duplicating primary rows) and for 1:1 paths that exceed the
 * top-level JOIN budget.
 *
 * `is-null` must match a primary with no related instance at all, or one whose related instance has a
 * null value; that needs a "no related row" check and a "some related row is null" check, which — unlike
 * every other operator — can't collapse into a single `EXISTS`. Rather than scan the related rows twice
 * (an `EXISTS` for each check), both facts are read off one aggregate scan: `COUNT(*)` (rows joined) and
 * `COUNT(<selector>)` (rows joined with a non-null value, since `COUNT(column)` skips `NULL`s) — the
 * primary matches when either is zero or they differ. Every other operator — including `is-not-equal` /
 * `is-not-in` — keeps "at least one related instance matches" semantics via a single `EXISTS`.
 */
async function buildExistentialFilterClause(props: {
  filter: ContentValueFilter;
  path: RelationshipPath;
  filterIndex: number;
  resolvePathInfo: (path: RelationshipPath, joinType: "inner" | "outer") => Promise<RelationshipPathJoinInfo>;
  resolveSelector: (field: PropertyField | CalculatedField, member?: string) => ReturnType<typeof resolveSelector>;
}): Promise<{ clause: string; bindings: Record<string, ECSqlBinding> }> {
  const { filter, path, filterIndex, resolvePathInfo, resolveSelector: resolveFilterSelector } = props;
  const info = await resolvePathInfo(path, "inner");
  const skeleton = buildExistentialSkeleton(info);
  const predicate = buildValueFilterClause({ filter, filterIndex, resolveSelector: resolveFilterSelector });

  const bindings: Record<string, ECSqlBinding> = {};
  mergeBindings(bindings, info.bindings);
  mergeBindings(bindings, skeleton.bindings);
  mergeBindings(bindings, predicate.bindings);

  const renderFrom = (): string => ["FROM", skeleton.from, skeleton.joins].filter(Boolean).join(" ");
  // `extraCondition` (the filter predicate) is parenthesized: it's opaque here and could itself be a
  // compound expression (e.g. an `is-in` list or a calculated-field expression), which must not silently
  // change the AND's precedence with `skeleton.correlation`.
  const renderWhere = (extraCondition?: string): string =>
    `WHERE ${skeleton.correlation}${extraCondition ? ` AND (${extraCondition})` : ""}`;

  if (filter.operator === "is-null") {
    // An aggregate query always returns exactly one row (even over zero joined rows: `COUNT(*)` is 0,
    // so `COUNT(<selector>)` is too), so this single scan supplies both checks without an `EXISTS` twice.
    const clause = `(SELECT COUNT(*) = 0 OR COUNT(${predicate.selector}) < COUNT(*) ${renderFrom()} ${renderWhere()})`;
    return { clause, bindings };
  }
  return { clause: `EXISTS (SELECT 1 ${renderFrom()} ${renderWhere(predicate.clause)})`, bindings };
}

/** Resolves a field's raw column selector (without navigation `.Id`) and its value type. */
function resolveSelector(props: {
  field: PropertyField | CalculatedField;
  member?: string;
  relatedClassAliases: Map<string, { target: string; relationship: string }>;
  isRelationshipClass: (className: EC.FullClassNameDotNotation) => boolean;
}): {
  selector: string;
  type: Exclude<PrimitiveValueType, "Point2d" | "Point3d">;
  bindings?: Record<string, ECSqlBinding>;
} {
  // Validate the value type first, so a non-scalar-filterable shape is rejected before a selector
  // is constructed for it.
  const type = getSelectorValueType(props.field.type, props.member);
  return { type, ...resolveFieldSelector(props) };
}

/**
 * Resolves a field's raw column selector (without navigation `.Id`) without validating that the
 * addressed value is scalar-filterable.
 */
export function resolveFieldSelector(props: {
  field: PropertyField | CalculatedField;
  member?: string;
  relatedClassAliases: Map<string, { target: string; relationship: string }>;
  isRelationshipClass: (className: EC.FullClassNameDotNotation) => boolean;
}): { selector: string; bindings?: Record<string, ECSqlBinding> } {
  const { field, member, relatedClassAliases, isRelationshipClass } = props;
  switch (field.kind) {
    case "calculated": {
      // A calculated field is an arbitrary scalar ECSQL expression; `ContentValueFilter` disallows a
      // `member` on it at the type level, so there is nothing composite to address here. Wrap it in
      // parentheses so the filter operator binds to the whole expression (e.g. `(A OR B) = :vf`, not
      // `A OR B = :vf`), and carry its own bindings so the expression's parameters are supplied.
      const expression = substituteExpressionAlias({
        expression: field.expression,
        fromAlias: field.targetAlias ?? PRIMARY_CLASS_ALIAS,
        toAlias: PRIMARY_CLASS_ALIAS,
      });
      return { selector: `(${expression})`, ...(field.bindings ? { bindings: field.bindings } : undefined) };
    }
    case "property": {
      // Composite access (e.g. a struct member or point `x`) addresses a member of the property column.
      // For a point property, emit the validated, canonical coordinate spelling; other composite
      // members are addressed verbatim.
      const resolvedMember = isPointType(field.type) && member ? resolvePointMember(field.type.type, member) : member;
      const memberSuffix = resolvedMember ? `.[${resolvedMember}]` : "";
      const alias = resolvePropertyAlias({ field, relatedClassAliases, isRelationshipClass });
      return { selector: `[${alias}].[${field.propertyName}]${memberSuffix}` };
    }
  }
}

/**
 * Picks the runtime alias for a property field: the primary alias for a direct property, or — for a
 * related property — the `relationship` alias when the property is declared on a relationship class,
 * otherwise the `target` alias.
 */
function resolvePropertyAlias(props: {
  field: PropertyField;
  relatedClassAliases: Map<string, { target: string; relationship: string }>;
  isRelationshipClass: (className: EC.FullClassNameDotNotation) => boolean;
}): string {
  const { field, relatedClassAliases, isRelationshipClass } = props;
  if (field.pathFromTarget.length === 0) {
    return PRIMARY_CLASS_ALIAS;
  }
  const aliases = relatedClassAliases.get(serializeJoinPath(field.pathFromTarget))!;
  return isRelationshipClass(field.propertyClassName) ? aliases.relationship : aliases.target;
}

/**
 * Determines which value-filter property fields read from a relationship class rather than a target
 * class — a relationship-class property reads from the step's relationship table (the `relationship`
 * alias). Relationship-ness is intrinsic to the declaring class, so a property declared on a *base* of
 * the step's concrete relationship is still classified correctly (unlike a name comparison against the
 * step's `relationshipName`). Returns the set of such classes, keyed by normalized full name.
 */
async function collectRelationshipPropertyClasses(
  schemaProvider: ECSchemaProvider,
  filters: ContentValueFilter[],
): Promise<Set<EC.FullClassNameDotNotation>> {
  const classNames = filters.flatMap((filter) =>
    filter.field.kind === "property" && filter.field.pathFromTarget.length > 0 ? [filter.field.propertyClassName] : [],
  );
  return classifyRelationshipClasses(schemaProvider, classNames);
}

/**
 * Determines which of `classNames` are relationship classes — a relationship-class property reads
 * from the step's relationship table (the `relationship` alias) rather than its target table.
 */
export async function classifyRelationshipClasses(
  schemaProvider: ECSchemaProvider,
  classNames: EC.FullClassNameDotNotation[],
): Promise<Set<EC.FullClassNameDotNotation>> {
  const uniqueClassNames = new Set(classNames);
  const relationshipClasses = new Set<EC.FullClassNameDotNotation>();
  await Promise.all(
    [...uniqueClassNames].map(async (className) => {
      const ecClass = await getClass(schemaProvider, className);
      if (ecClass.isRelationshipClass()) {
        relationshipClasses.add(className);
      }
    }),
  );
  return relationshipClasses;
}

/**
 * Resolves the primitive type a filter operand binds as for the value addressed by `type` (optionally
 * one of its composite `member`s). A point requires a coordinate `member` (`x`/`y`/`z`), each of which
 * binds as `Double`; a struct member binds as that member's declared type; a navigation column binds
 * as `Id`. Array fields are not scalar-filterable and are rejected.
 */
function getSelectorValueType(
  type: ValueDescriptor,
  member: string | undefined,
): Exclude<PrimitiveValueType, "Point2d" | "Point3d"> {
  switch (type.kind) {
    case "navigation":
      return "Id";
    case "array":
      throw new Error(`Value filters on array fields are not supported.`);
    case "struct": {
      if (!member) {
        throw new Error(
          `Value filters directly on struct fields are not supported. Provide a member to filter on instead.`,
        );
      }
      const memberType = type.members.find((structMember) => structMember.name === member)?.type;
      if (!memberType) {
        throw new Error(`Value filter references member "${member}" that is not a member of the struct field.`);
      }
      return getSelectorValueType(memberType, undefined);
    }
    case "primitive":
      if (type.type === "Point2d" || type.type === "Point3d") {
        // A point is filtered through a coordinate member (`x`/`y`/`z`), all of which are doubles.
        resolvePointMember(type.type, member);
        return "Double";
      }
      return type.type;
  }
}

/** Narrows a value descriptor to a point primitive. */
function isPointType(
  type: ValueDescriptor,
): type is Extract<ValueDescriptor, { kind: "primitive" }> & { type: "Point2d" | "Point3d" } {
  return type.kind === "primitive" && (type.type === "Point2d" || type.type === "Point3d");
}

/**
 * Validates the coordinate `member` addressed on a point field and returns its canonical (lowercase)
 * spelling. A point value is not scalar-filterable on its own, so a member is required; only the
 * type's coordinate axes are accepted (matched case-insensitively, consistent with struct members).
 */
function resolvePointMember(pointType: "Point2d" | "Point3d", member: string | undefined): string {
  const allowed = pointType === "Point2d" ? ["x", "y"] : ["x", "y", "z"];
  if (!member) {
    throw new Error(
      `Value filters directly on ${pointType} fields are not supported. Provide coordinate member ${formatOrList(allowed)}.`,
    );
  }
  const canonical = allowed.find((axis) => axis === member.toLocaleLowerCase());
  if (!canonical) {
    throw new Error(
      `Value filters on ${pointType} fields require member ${formatOrList(allowed)}, but got "${member}".`,
    );
  }
  return canonical;
}

/** Formats a list of coordinate names as a quoted, `or`-joined enumeration (e.g. `"x", "y", or "z"`). */
function formatOrList(items: readonly string[]): string {
  const quoted = items.map((item) => `"${item}"`);
  if (quoted.length === 2) {
    return `${quoted[0]} or ${quoted[1]}`;
  }
  return `${quoted.slice(0, -1).join(", ")}, or ${quoted[quoted.length - 1]}`;
}

/**
 * Memoizes each path's prefix serializations (one entry per prefix length) so repeated alias lookups
 * for the same path reuse the computed keys instead of re-serializing path slices.
 */
function createPrefixKeyResolver(): (path: RelationshipPath) => readonly string[] {
  const prefixKeysByPath = new Map<RelationshipPath, readonly string[]>();
  return (path: RelationshipPath): readonly string[] => {
    let keys = prefixKeysByPath.get(path);
    if (!keys) {
      const computed: string[] = [];
      for (let length = 1; length <= path.length; ++length) {
        computed.push(serializeJoinPath(path.slice(0, length)));
      }
      keys = computed;
      prefixKeysByPath.set(path, keys);
    }
    return keys;
  };
}

/**
 * Creates a memoized per-(path, join type) join-info resolver. `createRelationshipPathJoinInfo` reads
 * the schema once per entry; the memoized result can then serve both a JOIN-table budget count and the
 * rendered SQL without re-reading the schema.
 */
function createPathInfoResolver(props: {
  schemaProvider: ECSchemaProvider;
  relatedClassAliases: Map<string, { target: string; relationship: string }>;
  getPrefixKeys: (path: RelationshipPath) => readonly string[];
}): (path: RelationshipPath, joinType: "inner" | "outer") => Promise<RelationshipPathJoinInfo> {
  const { schemaProvider, relatedClassAliases, getPrefixKeys } = props;
  const infoCache = new Map<string, RelationshipPathJoinInfo>();
  return async (path, joinType) => {
    const prefixKeys = getPrefixKeys(path);
    const cacheKey = `${joinType}:${prefixKeys.length > 0 ? prefixKeys[prefixKeys.length - 1] : ""}`;
    let info = infoCache.get(cacheKey);
    if (!info) {
      info = await ECSql.createRelationshipPathJoinInfo({
        schemaProvider,
        path: path.map((step, index) => ({
          ...step,
          sourceAlias: index === 0 ? PRIMARY_CLASS_ALIAS : relatedClassAliases.get(prefixKeys[index - 1])!.target,
          targetAlias: relatedClassAliases.get(prefixKeys[index])!.target,
          relationshipAlias: relatedClassAliases.get(prefixKeys[index])!.relationship,
          joinType,
        })),
      });
      infoCache.set(cacheKey, info);
    }
    return info;
  };
}

/**
 * Assembles one query's `FROM`/`JOIN`/`WHERE`/bindings parts: renders the given related paths (merged
 * so a shared prefix is joined once) onto the shared FROM + target filter, and — only when the query
 * owns the primary-restricting clauses (`includePrimaryFilters`) — additionally applies the
 * query-filterer and value-filter clauses, evaluating filters on `existentialFilterPathKeys` paths as
 * correlated subqueries instead of join-and-compare.
 */
async function buildQueryParts(props: {
  schemaProvider: ECSchemaProvider;
  from: string;
  targetFilter: ReturnType<typeof buildTargetFilter>;
  filtererClauses: ReturnType<QueryFilterer["getFilterClauses"]>[];
  filters: ContentValueFilter[];
  relatedClassAliases: Map<string, { target: string; relationship: string }>;
  getPrefixKeys: (path: RelationshipPath) => readonly string[];
  resolvePathInfo: (path: RelationshipPath, joinType: "inner" | "outer") => Promise<RelationshipPathJoinInfo>;
  paths: RelationshipPath[];
  joinType: "inner" | "outer";
  includePrimaryFilters: boolean;
  existentialFilterPathKeys: Set<string>;
}): Promise<BaseQueryParts> {
  const {
    schemaProvider,
    from,
    targetFilter,
    filtererClauses,
    filters,
    relatedClassAliases,
    getPrefixKeys,
    resolvePathInfo,
  } = props;
  const infos = await Promise.all(props.paths.map(async (path) => resolvePathInfo(path, props.joinType)));
  const rendered = ECSql.createRelationshipPathJoinClause(mergeJoinInfos(infos));
  const groupAliases = collectPrefixAliases(props.paths, relatedClassAliases, getPrefixKeys);

  const joinFragments: string[] = [];
  const whereConditions: string[] = [];
  const bindings: Record<string, ECSqlBinding> = {};

  if (targetFilter.joins) {
    joinFragments.push(...targetFilter.joins);
  }
  if (rendered.joins) {
    joinFragments.push(rendered.joins);
  }
  if (targetFilter.where) {
    whereConditions.push(targetFilter.where);
  }
  mergeBindings(bindings, targetFilter.bindings);
  mergeBindings(bindings, rendered.bindings);

  if (props.includePrimaryFilters) {
    // Query filterers inject WHERE/JOIN clauses only (never SELECT), scoped to the primary alias.
    for (const clauses of filtererClauses) {
      if (clauses.joins) {
        joinFragments.push(...clauses.joins);
      }
      if (clauses.where) {
        whereConditions.push(...clauses.where);
      }
      mergeBindings(bindings, clauses.bindings);
    }

    // Value filters resolve relationship-class properties against the step's relationship alias; classify
    // once up front which of the referenced property classes are relationship classes.
    const relationshipPropertyClasses = await collectRelationshipPropertyClasses(schemaProvider, filters);
    const isPropertyFieldRelationshipClass = (className: EC.FullClassNameDotNotation) =>
      relationshipPropertyClasses.has(className);
    const resolveFilterSelector = (field: PropertyField | CalculatedField, member?: string) =>
      resolveSelector({
        field,
        member,
        relatedClassAliases: groupAliases,
        isRelationshipClass: isPropertyFieldRelationshipClass,
      });
    // An existential filter's path isn't part of this group's join set, so resolve its selector
    // against the query-wide alias map.
    const resolveExistentialFilterSelector = (field: PropertyField | CalculatedField, member?: string) =>
      resolveSelector({ field, member, relatedClassAliases, isRelationshipClass: isPropertyFieldRelationshipClass });

    // Direct/calculated and budget-fitting 1:1 filters use join-and-compare evaluation. The
    // precomputed existential set (1:many plus overflow 1:1) uses independent subqueries.
    const oneToOneFilters: ContentValueFilter[] = [];
    const existentialFilters: { filter: ContentValueFilter; path: RelationshipPath }[] = [];
    for (const filter of filters) {
      const path = filter.field.kind === "property" ? filter.field.pathFromTarget : [];
      if (path.length > 0 && props.existentialFilterPathKeys.has(serializeJoinPath(path))) {
        existentialFilters.push({ filter, path });
      } else {
        oneToOneFilters.push(filter);
      }
    }

    // Value filters resolve their columns through the alias map (related fields) or `targetAlias`
    // substitution (calculated fields).
    const valueFilter = buildValueFilterClauses({ filters: oneToOneFilters, resolveSelector: resolveFilterSelector });
    if (valueFilter) {
      whereConditions.push(valueFilter.where);
      mergeBindings(bindings, valueFilter.bindings);
    }

    // Existential filters get their own binding-index space after the join-based filters', so an
    // index can never collide with one `buildValueFilterClauses` assigned internally above.
    for (const [offset, { filter, path }] of existentialFilters.entries()) {
      const existential = await buildExistentialFilterClause({
        filter,
        path,
        filterIndex: oneToOneFilters.length + offset,
        resolvePathInfo,
        resolveSelector: resolveExistentialFilterSelector,
      });
      whereConditions.push(existential.clause);
      mergeBindings(bindings, existential.bindings);
    }
  }

  const whereConditionsClause =
    whereConditions.length > 1 ? whereConditions.map((c) => `(${c})`).join(" AND ") : whereConditions[0];
  const where = whereConditionsClause && `WHERE ${whereConditionsClause}`;
  return {
    from,
    joins: joinFragments.join("\n"),
    ...(where ? { where } : undefined),
    ...(Object.keys(bindings).length > 0 ? { bindings } : undefined),
    primaryClassAlias: PRIMARY_CLASS_ALIAS,
    relatedClassAliases: groupAliases,
  };
}

/**
 * Builds a target-scoped, non-grouped query scaffold: outer-joins exactly the given related paths
 * (preserving rows whose related instance is missing) plus whatever the target filter and value
 * filters need, and returns the `FROM`/`JOIN`/`WHERE`/bindings shape plus the alias map a `SELECT`
 * builder needs.
 *
 * Used by the distinct-values query builder to reuse the existing target-filter and value-filter
 * building blocks without the source-oriented anchor/additional grouping performed by `buildBaseQuery`.
 *
 * @internal
 */
export async function buildTargetScopedQuery(props: {
  schemaProvider: ECSchemaProvider;
  target: ContentTarget;
  /**
   * Related paths to JOIN — e.g. paths referenced by `filters`, plus (for distinct values) the
   * selected field's own related path. De-duplicated internally by serialized join key.
   */
  paths: RelationshipPath[];
  /** Value filters to translate into WHERE. */
  filters: ContentValueFilter[];
}): Promise<BaseQueryParts> {
  const { schemaProvider, target, filters } = props;
  const paths = unionPaths([...props.paths, ...collectFilterPaths(filters)]);
  const getPrefixKeys = createPrefixKeyResolver();
  const relatedClassAliases = assignPrefixAliases(paths, getPrefixKeys);
  return buildQueryParts({
    schemaProvider,
    from: `FROM ${ECSql.createClassSelector(target.primaryClass)} [${PRIMARY_CLASS_ALIAS}]`,
    targetFilter: buildTargetFilter(target),
    filtererClauses: [],
    filters,
    relatedClassAliases,
    getPrefixKeys,
    resolvePathInfo: createPathInfoResolver({ schemaProvider, relatedClassAliases, getPrefixKeys }),
    // Join all paths (the selected field's own path plus filter-referenced ones) with outer joins, and
    // evaluate every filter with join-and-compare — no grouping, budgets, or existential subqueries.
    paths,
    joinType: "outer",
    includePrimaryFilters: true,
    existentialFilterPathKeys: new Set(),
  });
}
