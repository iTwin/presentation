/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSql, getClass } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, PRIMARY_CLASS_ALIAS, substituteExpressionAlias } from "../InternalUtils.js";
import { serializeRelationshipPath } from "../model/Utils.js";
import { classifyPathCardinality, partitionPathsByJoinBudget } from "./QueryLimits.js";
import { buildTargetFilter } from "./TargetFilter.js";
import { buildValueFilterClauses } from "./ValueFilters.js";

import type {
  EC,
  ECSchemaProvider,
  ECSqlBinding,
  PrimitiveValueType,
  RelationshipPath,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../Content.js";
import type { CardinalityHint, ContentSource, ResolvedPath } from "../ContentTarget.js";
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
  /** ANDed WHERE conditions (no `WHERE` keyword), or undefined. */
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
  // filter references (to evaluate it).
  const groupPaths = includeRelatedJoins ? collectUniquePaths(source) : [];
  const filterPaths = includeRelatedJoins ? [] : collectFilterPaths(filters);

  // Serialize each path's prefix keys once (memoized by path reference); every alias lookup below reuses
  // them instead of re-serializing path slices.
  const prefixKeysByPath = new Map<RelationshipPath, readonly string[]>();
  const getPrefixKeys = (path: RelationshipPath): readonly string[] => {
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

  // Assign deterministic aliases to every unique related prefix up front. Being stable across the whole
  // query, they let the join info resolved for a path (below) serve both the JOIN-table budget count and
  // the rendered SQL, so a path's join info is never resolved more than once.
  const relatedClassAliases = assignPrefixAliases(
    includeRelatedJoins ? groupPaths.map((p) => p.path) : filterPaths,
    getPrefixKeys,
  );

  // Memoized per-(path, join type) join-info resolver. `createRelationshipPathJoinInfo` reads the schema
  // once; the result is reused for the budget count and rendered via the sync `createRelationshipPathJoinClause`
  // overload (which reads no schema).
  const infoCache = new Map<string, RelationshipPathJoinInfo>();
  const resolvePathInfo = async (
    path: RelationshipPath,
    joinType: "inner" | "outer",
  ): Promise<RelationshipPathJoinInfo> => {
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

  // Assembles one group's parts: every group shares FROM + target filter and renders its own subset of
  // related paths (merged so a shared prefix is joined once); only the group that owns the primaries (the
  // anchor, or the primaries-only group) additionally carries the query-filterer and value-filter clauses.
  const buildGroupParts = async (groupProps: {
    paths: RelationshipPath[];
    joinType: "inner" | "outer";
    includePrimaryFilters: boolean;
  }): Promise<BaseQueryParts> => {
    const infos = await Promise.all(groupProps.paths.map(async (path) => resolvePathInfo(path, groupProps.joinType)));
    const rendered = ECSql.createRelationshipPathJoinClause(mergeJoinInfos(infos));
    const groupAliases = collectPrefixAliases(groupProps.paths, relatedClassAliases, getPrefixKeys);

    const joinFragments: string[] = [];
    const whereConditions: string[] = [];
    const bindings: Record<string, ECSqlBinding> = {};

    if (targetFilter.joins) {
      joinFragments.push(targetFilter.joins);
    }
    if (rendered.joins) {
      joinFragments.push(rendered.joins);
    }
    if (targetFilter.where) {
      whereConditions.push(targetFilter.where);
    }
    mergeBindings(bindings, targetFilter.bindings);
    mergeBindings(bindings, rendered.bindings);

    if (groupProps.includePrimaryFilters) {
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

      // Value filters resolve their columns through the alias map (related fields) or `targetAlias`
      // substitution (calculated fields).
      const valueFilter = buildValueFilterClauses({
        filters,
        resolveSelector: (field, member) =>
          resolveSelector({
            field,
            member,
            relatedClassAliases: groupAliases,
            isRelationshipClass: isPropertyFieldRelationshipClass,
          }),
      });
      if (valueFilter.where) {
        whereConditions.push(valueFilter.where);
      }
      mergeBindings(bindings, valueFilter.bindings);
    }

    const where = whereConditions.length > 1 ? whereConditions.map((c) => `(${c})`).join(" AND ") : whereConditions[0];
    return {
      from,
      joins: joinFragments.join("\n"),
      ...(where ? { where } : undefined),
      ...(Object.keys(bindings).length > 0 ? { bindings } : undefined),
      primaryClassAlias: PRIMARY_CLASS_ALIAS,
      relatedClassAliases: groupAliases,
    };
  };

  // Primaries-only mode: no related columns and never a split — only the joins required to *evaluate*
  // value filters are emitted (outer, so an `is-null` filter still matches primaries with no related
  // instance), and the single `anchor` carries all filter clauses.
  if (!includeRelatedJoins) {
    const parts = await buildGroupParts({ paths: filterPaths, joinType: "outer", includePrimaryFilters: true });
    return { anchor: { paths: [], parts } };
  }

  // Related-columns mode: split the resolved paths into the anchor (primary-key + direct + calculated +
  // its share of 1:1 related columns) plus additional groups for budget-overflow 1:1 partitions and each
  // 1:many path (isolated so the anchor stays one row per primary).
  const reservedTables =
    1 +
    (targetFilter.joins ? 1 : 0) +
    filtererClauses.reduce((count, clauses) => count + (clauses.joins?.length ?? 0), 0);
  const { anchorPaths, additionalGroups } = await splitRelatedPaths({
    resolvePathInfo,
    schemaProvider,
    paths: groupPaths,
    cardinalityHints: props.cardinalityHints,
    reservedTables,
  });

  // The anchor owns direct/calculated columns, so its related steps are outer-joined (an inner join
  // would drop a primary missing one related instance and take its direct columns down with it).
  const anchor: BaseQueryGroup = {
    paths: anchorPaths,
    parts: await buildGroupParts({
      paths: anchorPaths.map((resolved) => resolved.path),
      joinType: "outer",
      includePrimaryFilters: true,
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
      }),
    })),
  );
  return { anchor, additional };
}

/**
 * Splits a source's resolved related paths into the anchor's paths plus additional groups. A 1:many path
 * (a `cardinalityHint`, else schema multiplicity) is isolated into its own inner-joined group so the
 * anchor stays one row per primary; because such a path never shares a query with others, inner-joining
 * it needs no extra join-info resolution. The remaining 1:1 paths are budget-packed under the SQLite
 * JOIN-table limit and stay outer-joined (reusing the join info resolved here for the budget count).
 */
async function splitRelatedPaths(props: {
  resolvePathInfo: (path: RelationshipPath, joinType: "inner" | "outer") => Promise<RelationshipPathJoinInfo>;
  schemaProvider: ECSchemaProvider;
  paths: ResolvedPath[];
  cardinalityHints: Map<string, CardinalityHint> | undefined;
  reservedTables: number;
}): Promise<{
  anchorPaths: ResolvedPath[];
  additionalGroups: { paths: ResolvedPath[]; joinType: "inner" | "outer" }[];
}> {
  const oneToOne: ResolvedPath[] = [];
  const oneToManyGroups: { paths: ResolvedPath[]; joinType: "inner" }[] = [];
  for (const resolved of props.paths) {
    const cardinality = await classifyPathCardinality({
      schemaProvider: props.schemaProvider,
      path: resolved.path,
      cardinalityHint: props.cardinalityHints?.get(serializeRelationshipPath({ path: resolved.path })),
    });
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
  const [anchorPartition = [], ...extraPartitions] = partitionPathsByJoinBudget({
    paths: oneToOneWithInfo,
    reservedTables: props.reservedTables,
  });
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

/** Collects the distinct related paths referenced by value filters (used by primaries-only mode). */
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
  const seenAliases = new Set<string>();
  const joins: RelationshipPathJoinInfo["joins"] = [];
  const bindings: Record<string, ECSqlBinding> = {};
  for (const info of infos) {
    for (const entry of info.joins) {
      if (!seenAliases.has(entry.joinAlias)) {
        seenAliases.add(entry.joinAlias);
        joins.push(entry);
      }
    }
    // Shared-prefix steps contribute identical bindings; keep the first occurrence of each key.
    for (const [name, binding] of Object.entries(info.bindings ?? {})) {
      if (!(name in bindings)) {
        bindings[name] = binding;
      }
    }
  }
  return { joins, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
}

/** Resolves a field's raw column selector (without navigation `.Id`) and its value type. */
function resolveSelector(props: {
  field: PropertyField | CalculatedField;
  member?: string;
  relatedClassAliases: Map<string, { target: string; relationship: string }>;
  isRelationshipClass: (className: EC.FullClassNameDotNotation) => boolean;
}): { selector: string; type: Exclude<PrimitiveValueType, "Point2d" | "Point3d"> } {
  const { field, member, relatedClassAliases, isRelationshipClass } = props;
  const type = getSelectorValueType(field.type, member);
  switch (field.kind) {
    case "calculated": {
      // A calculated field is a scalar ECSQL expression; `ContentValueFilter` disallows a `member` on
      // it at the type level, so there is nothing composite to address here.
      const selector = substituteExpressionAlias({
        expression: field.expression,
        fromAlias: field.targetAlias ?? PRIMARY_CLASS_ALIAS,
        toAlias: PRIMARY_CLASS_ALIAS,
      });
      return { selector, type };
    }
    case "property": {
      // Composite access (e.g. a struct member or point `x`) addresses a member of the property column.
      const memberSuffix = member ? `.[${member}]` : "";
      const alias = resolvePropertyAlias({ field, relatedClassAliases, isRelationshipClass });
      return { selector: `[${alias}].[${field.propertyName}]${memberSuffix}`, type };
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
  const classNames = new Set(
    filters.flatMap((filter) =>
      filter.field.kind === "property" && filter.field.pathFromTarget.length > 0
        ? [filter.field.propertyClassName]
        : [],
    ),
  );
  const relationshipClasses = new Set<EC.FullClassNameDotNotation>();
  await Promise.all(
    [...classNames].map(async (className) => {
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
 * one of its composite `member`s). A point coordinate member (`x`/`y`/`z`) binds as `Double`; a struct
 * member binds as that member's declared type; a navigation column binds as `Id`. Array fields are not
 * scalar-filterable and are rejected.
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
      const memberLowercase = member.toLocaleLowerCase();
      const memberType = type.members.find(
        (structMember) => structMember.name.toLocaleLowerCase() === memberLowercase,
      )?.type;
      if (!memberType) {
        throw new Error(`Value filter references member "${member}" that is not a member of the struct field.`);
      }
      return getSelectorValueType(memberType, undefined);
    }
    case "primitive":
      // A point is filtered through a coordinate member (`x`/`y`/`z`), all of which are doubles.
      return type.type === "Point2d" || type.type === "Point3d" ? "Double" : type.type;
  }
}

/**
 * Merges `source` bindings into `target`, throwing on a duplicate name. Internal binding names are
 * `ECSQL_PREFIX`-scoped and thus collision-free by construction, so a clash signals a real bug (e.g.
 * a query filterer or instance filter reusing a reserved/duplicate parameter name).
 */
function mergeBindings(target: Record<string, ECSqlBinding>, source: Record<string, ECSqlBinding> | undefined): void {
  if (!source) {
    return;
  }
  for (const [name, binding] of Object.entries(source)) {
    if (name in target) {
      throw new Error(`Duplicate ECSQL binding name "${name}" while assembling the base query.`);
    }
    target[name] = binding;
  }
}
