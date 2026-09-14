/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, filter, finalize, forkJoin, from, lastValueFrom, map, mergeMap, of, race, take, toArray } from "rxjs";
import { ECSql, getClass } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, getOrCreate, PRIMARY_CLASS_ALIAS } from "./InternalUtils.js";
import { serializeRelationshipPath, toSortedUniqueClassNames } from "./model/Utils.js";
import { QUERY_CONCURRENCY } from "./query/QueryConcurrency.js";
import { buildTargetFilter } from "./query/TargetFilter.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type {
  EC,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  Props,
  RelationshipPath,
} from "@itwin/presentation-shared";
import type { CardinalityHint, ContentSource, ContentTarget, ResolvedPath } from "./ContentTarget.js";
import type { ExternalFieldsProvider, InputPropertyDeclaration } from "./extensions/ExternalFieldsProvider.js";
import type { IModelFieldsProvider, RelatedPropertiesDeclaration } from "./extensions/IModelFieldsProvider.js";

// --- Types ---

type JoinRelationshipPath = Extract<
  Props<typeof ECSql.createRelationshipPathJoinClause>,
  { schemaProvider: ECSchemaProvider }
>["path"];

interface ResolutionQueryContext {
  target: ContentTarget;
  joinPath: JoinRelationshipPath;
  schemaProvider: ECSchemaProvider;
}

interface ResolutionQueryStrategy {
  readonly name: string;
  isApplicable(ctx: ResolutionQueryContext): boolean;
  buildQuery(ctx: ResolutionQueryContext): Promise<ECSqlQueryDef>;
}

// --- Query building helpers ---

// Concrete class-name columns for a set of per-step class-id selectors
function buildClassNameColumns(selectors: string[]): string {
  return selectors.map((selector) => `ec_classname(${selector}, 's.c')`).join(", ");
}

// The raw class-id selectors themselves — used for `GROUP BY`. Grouping on the raw indexed
// `ECClassId` lets the engine use its index, unlike `DISTINCT` on the computed `ec_classname(...)`
// string.
function buildClassIdColumns(selectors: string[]): string {
  return selectors.join(", ");
}

// Resolves a relationship path into its JOIN clause plus the per-step concrete relationship/target
// `ECClassId` selectors.
async function resolveJoin(
  schemaProvider: ECSchemaProvider,
  path: JoinRelationshipPath,
): Promise<{
  joins: string;
  bindings?: Record<string, ECSqlBinding>;
  selectors: Array<{ relationshipClassId: string; targetClassId: string }>;
}> {
  const info = await ECSql.createRelationshipPathJoinInfo({ schemaProvider, path });
  const joinClause = ECSql.createRelationshipPathJoinClause(info);
  return {
    ...joinClause,
    selectors: info.steps.map((step) => ({
      relationshipClassId: step.relationshipClassIdSelector,
      targetClassId: step.targetClassIdSelector,
    })),
  };
}

// Distinct-class scan of the primary itself: enumerates the concrete classes that actually
// have instances in scope (honoring the target's instance IDs / filter). A plain class
// selector is polymorphic, so this naturally spans the selected base and all its subclasses.
function buildPrimaryEnumerationQuery(target: ContentTarget): ECSqlQueryDef {
  const targetFilter = buildTargetFilter(target);
  const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
  const ecsql = `
    SELECT ec_classname([${PRIMARY_CLASS_ALIAS}].[ECClassId], 's.c')
    FROM ${ECSql.createClassSelector(target.primaryClass)} [${PRIMARY_CLASS_ALIAS}]
    ${targetFilter.joins?.join("\n") ?? ""}
    ${whereClause}
    GROUP BY [${PRIMARY_CLASS_ALIAS}].[ECClassId]
  `;
  return { ecsql, ...(targetFilter.bindings ? { bindings: targetFilter.bindings } : {}) };
}

// --- Strategies ---

// Straightforward approach: join all path steps from the source class and select distinct
// class names at each step. Always applicable but may be slow when the source table is
// large and only a small subset of class combinations exists in the joined tables.
const originalStrategy: ResolutionQueryStrategy = {
  name: "original",
  isApplicable() {
    return true;
  },
  async buildQuery(ctx) {
    const { target, joinPath, schemaProvider } = ctx;
    const { joins, bindings: joinBindings, selectors } = await resolveJoin(schemaProvider, joinPath);
    const classSelectors = selectors.flatMap((s) => [s.relationshipClassId, s.targetClassId]);
    const targetFilter = buildTargetFilter(target);
    const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
    const allBindings = { ...joinBindings, ...targetFilter.bindings };
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([${PRIMARY_CLASS_ALIAS}].[ECClassId], 's.c')), ${buildClassNameColumns(classSelectors)}
      FROM ${ECSql.createClassSelector(target.primaryClass)} [${PRIMARY_CLASS_ALIAS}]
      ${joins} ${targetFilter.joins?.join("\n") ?? ""}
      ${whereClause}
      GROUP BY ${buildClassIdColumns(classSelectors)}
    `;
    return { ecsql, ...(Object.keys(allBindings).length > 0 ? { bindings: allBindings } : {}) };
  },
};

// Anchors the scan at the first hop's target class instead of the (potentially large)
// source class. Uses a subquery to restrict `[s0].ECClassId` to only those reachable from
// the filtered source instances, then joins the remaining steps from there. Helps when
// the source table has many rows but the intermediate table has few distinct class IDs.
const rewriteStrategy: ResolutionQueryStrategy = {
  name: "subquery-anchor",
  isApplicable(ctx) {
    return ctx.joinPath.length >= 2;
  },
  async buildQuery(ctx) {
    const { target, joinPath, schemaProvider } = ctx;
    const targetFilter = buildTargetFilter(target);

    const [
      { joins: firstStepJoins, bindings: firstStepBindings, selectors: firstStepSelectors },
      { joins: remainingJoins, bindings: remainingBindings, selectors: remainingSelectors },
    ] = await Promise.all([
      // First step joins (for the subquery anchoring at source)
      resolveJoin(schemaProvider, [joinPath[0]]),
      // Remaining step joins (for the outer query anchored at first hop's target)
      resolveJoin(schemaProvider, joinPath.slice(1)),
    ]);

    // Anchor at first hop's target class
    const firstStep = joinPath[0];
    const firstHopTarget = firstStep.targetClassName;
    const firstHopAlias = firstStep.targetAlias;

    const firstStepRelSelector = firstStepSelectors[0].relationshipClassId;

    const classSelectors = [
      ...firstStepSelectors.map((s) => s.targetClassId),
      ...remainingSelectors.flatMap((s) => [s.relationshipClassId, s.targetClassId]),
    ];
    const instanceFilterClauses = targetFilter.where ? `WHERE ${targetFilter.where}` : "";

    // The inner scan is anchored at the (large) source, but only ever yields a small set of
    // DISTINCT (first-hop class, near-end class) id pairs. Joining that derived table keeps the
    // outer scan anchored at the first hop while still projecting the concrete near-end class.
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([reachable].[NearEndClassId], 's.c')), ec_classname([reachable].[FirstStepRelClassId], 's.c'), ${buildClassNameColumns(classSelectors)}
      FROM ${ECSql.createClassSelector(firstHopTarget)} [${firstHopAlias}]
      ${remainingJoins}
      INNER JOIN (
        SELECT [${firstHopAlias}].[ECInstanceId] [FirstHopInstanceId], [${PRIMARY_CLASS_ALIAS}].[ECClassId] [NearEndClassId], ${firstStepRelSelector} [FirstStepRelClassId]
        FROM ${ECSql.createClassSelector(target.primaryClass)} [${PRIMARY_CLASS_ALIAS}]
        ${firstStepJoins} ${targetFilter.joins?.join("\n") ?? ""}
        ${instanceFilterClauses}
        GROUP BY [${firstHopAlias}].[ECInstanceId], [${PRIMARY_CLASS_ALIAS}].[ECClassId], ${firstStepRelSelector}
      ) [reachable] ON [reachable].[FirstHopInstanceId] = [${firstHopAlias}].[ECInstanceId]
      GROUP BY  [reachable].[FirstStepRelClassId], ${buildClassIdColumns(classSelectors)}
    `;

    const allBindings = { ...firstStepBindings, ...remainingBindings, ...targetFilter.bindings };
    return { ecsql, ...(Object.keys(allBindings).length > 0 ? { bindings: allBindings } : {}) };
  },
};

// Replaces INNER JOINs with CROSS JOINs. This can help the query planner choose a
// better execution order for long join chains (3+ steps) where intermediate cardinalities
// vary significantly.
const crossJoinStrategy: ResolutionQueryStrategy = {
  name: "cross-join",
  isApplicable(ctx) {
    return ctx.joinPath.length >= 3;
  },
  async buildQuery(ctx) {
    const { target, joinPath, schemaProvider } = ctx;
    const { joins, bindings: joinBindings, selectors } = await resolveJoin(schemaProvider, joinPath);
    const classSelectors = selectors.flatMap((s) => [s.relationshipClassId, s.targetClassId]);
    const crossJoins = joins.replaceAll(/\bINNER\s+JOIN\b/gi, "CROSS JOIN");
    const targetFilter = buildTargetFilter(target);
    const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
    const allBindings = { ...joinBindings, ...targetFilter.bindings };
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([${PRIMARY_CLASS_ALIAS}].[ECClassId], 's.c')), ${buildClassNameColumns(classSelectors)}
      FROM ${ECSql.createClassSelector(target.primaryClass)} [${PRIMARY_CLASS_ALIAS}]
      ${crossJoins} ${targetFilter.joins?.join("\n") ?? ""}
      ${whereClause}
      GROUP BY ${buildClassIdColumns(classSelectors)}
    `;
    return { ecsql, ...(Object.keys(allBindings).length > 0 ? { bindings: allBindings } : {}) };
  },
};

const ALL_STRATEGIES: ResolutionQueryStrategy[] = [originalStrategy, rewriteStrategy, crossJoinStrategy];

// --- Query execution ---

function raceQueryExecution({
  executor,
  queries,
}: {
  executor: ECSqlQueryExecutor;
  queries: ECSqlQueryDef[];
}): Observable<ECSqlQueryRow> {
  const streams = queries.map((query) => {
    const reader = executor.createQueryReader(query, { rowFormat: "Indexes" });
    // Calling `return()` on the iterator should cancel the query execution on the backend and free up resources
    return from(reader).pipe(finalize(() => void reader.return?.(undefined)));
  });
  return race(streams);
}

// --- Declaration resolution ---

async function resolveDeclarationPaths({
  imodelAccess,
  target,
  declaration,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  target: ContentTarget;
  declaration: Pick<RelatedPropertiesDeclaration, "path" | "resolve">;
}): Promise<ResolvedPath[]> {
  if (declaration.resolve) {
    return declaration.resolve({ imodelAccess, target });
  }

  const joinPath: JoinRelationshipPath = declaration.path.map((step: RelationshipPath[number], i: number) => ({
    ...step,
    sourceAlias: i === 0 ? PRIMARY_CLASS_ALIAS : `s${i - 1}`,
    targetAlias: `s${i}`,
    relationshipAlias: `r${i}`,
    joinType: "inner" as const,
  }));
  const ctx: ResolutionQueryContext = { target, joinPath, schemaProvider: imodelAccess };
  const strategies = ALL_STRATEGIES.filter((s) => s.isApplicable(ctx));
  const queries = await Promise.all(strategies.map(async (s) => s.buildQuery(ctx)));
  const rows = raceQueryExecution({ executor: imodelAccess, queries });
  return lastValueFrom(
    rows.pipe(
      // Each row is one resolved path: [nearEndClasses, step0Rel, step0Target, step1Rel, step1Target, ...].
      // The concrete content-target (near-end) classes are pre-aggregated by the
      // query via `GROUP_CONCAT`. Step target and relationship classes are the concrete classes
      // found in the data, resolved per step.
      map((row) => {
        let colIdx = 0;
        const path = [];
        for (const step of declaration.path) {
          path.push({
            ...step,
            sourceClassName: (colIdx === 0 ? target.primaryClass : row[colIdx]) as EC.FullClassNameDotNotation,
            relationshipName: row[++colIdx] as EC.FullClassNameDotNotation,
            targetClassName: row[++colIdx] as EC.FullClassNameDotNotation,
          });
        }
        return {
          path,
          targetClassNames: toSortedUniqueClassNames((row[0] as string).split(",") as EC.FullClassNameDotNotation[]),
        };
      }),
      toArray(),
    ),
  );
}

/**
 * Resolves the paths declared by external fields providers' related-property `inputs` — the pipeline's
 * own path-only counterpart to a provider's `relatedProperties` declarations, resolved the same way
 * (`resolveDeclarationPaths`) but carrying no provider identity: nothing re-derives these afterward, so
 * they need none of `RelatedPropertiesDeclaration`'s field-shaping members (`properties`,
 * `cardinalityHint`) and never seed nested-anchor expansion.
 */
async function resolveExternalInputPaths({
  imodelAccess,
  target,
  externalFieldsProviders,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  target: ContentTarget;
  externalFieldsProviders: ExternalFieldsProvider[];
}): Promise<ResolvedPath[]> {
  const paths = collectExternalInputPaths(externalFieldsProviders);
  const resolved = await Promise.all(
    paths.map(async (path) => resolveDeclarationPaths({ imodelAccess, target, declaration: { path } })),
  );
  return resolved.flat();
}

/** De-duplicates every related path declared as an input across all external fields providers. */
function collectExternalInputPaths(externalFieldsProviders: ExternalFieldsProvider[]): RelationshipPath[] {
  const byKey = new Map<string, RelationshipPath>();
  for (const provider of externalFieldsProviders) {
    const declarations: ReadonlyArray<InputPropertyDeclaration> = Object.values(provider.inputs ?? {});
    for (const declaration of declarations) {
      if (declaration.path && declaration.path.length > 0) {
        const key = serializeRelationshipPath({ path: declaration.path, includeInstanceFilters: true });
        if (!byKey.has(key)) {
          byKey.set(key, declaration.path);
        }
      }
    }
  }
  return [...byKey.values()];
}

// --- Target resolution ---

// Enumerates the concrete primary classes present under the target's `primaryClass`.
// A leaf class (no derived classes) can only ever resolve to itself, so the scan is skipped
// and `[primaryClass]` is returned. Otherwise the data-driven distinct-class scan runs.
async function resolvePrimaryClasses({
  imodelAccess,
  target,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  target: ContentTarget;
}): Promise<EC.FullClassNameDotNotation[]> {
  const primaryClass = await getClass(imodelAccess, target.primaryClass);
  if (primaryClass.getDerivedClassNames().length === 0) {
    return [target.primaryClass];
  }

  const reader = imodelAccess.createQueryReader(buildPrimaryEnumerationQuery(target), { rowFormat: "Indexes" });
  const classNames: EC.FullClassNameDotNotation[] = [];
  for await (const row of reader) {
    classNames.push(row[0] as EC.FullClassNameDotNotation);
  }
  return toSortedUniqueClassNames(classNames);
}

/** The final, serializable shape of a resolved declaration group (nested or not). */
type ResolvedDeclarationGroupOutput = ContentSource["resolvedDeclarations"][number];

/** A provider declaration resolved directly against a target, paired with its provenance. */
interface BaseGroupResolution {
  providerId: IModelFieldsProvider["id"];
  providerIdx: number;
  declarationIndex: number;
  declaration: RelatedPropertiesDeclaration;
  paths: ResolvedPath[];
}

/**
 * Resolves the base (non-nested) declaration groups for a target directly — one per provider
 * declaration that produced concrete paths. Providers and declarations resolve concurrently; the
 * final sort restores provider/declaration order regardless of async completion timing.
 */
function resolveBaseGroups({
  imodelAccess,
  providers,
  target,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  providers: IModelFieldsProvider[];
  target: ContentTarget;
}): Observable<BaseGroupResolution[]> {
  return from(providers).pipe(
    mergeMap(async (provider, providerIdx) => ({
      provider,
      providerIdx,
      contribution: await provider.getContribution({ imodelAccess, target }),
    })),
    mergeMap(({ provider, providerIdx, contribution }) => {
      if (!contribution?.relatedProperties) {
        return [];
      }
      return from(contribution.relatedProperties).pipe(
        mergeMap(async (declaration, declarationIndex) => ({
          providerId: provider.id,
          providerIdx,
          declarationIndex,
          declaration,
          paths: await resolveDeclarationPaths({ imodelAccess, target, declaration }),
        })),
      );
    }),
    filter((group) => group.paths.length > 0),
    toArray(),
    map((groups) => groups.sort((a, b) => a.providerIdx - b.providerIdx || a.declarationIndex - b.declarationIndex)),
  );
}

/**
 * Combines two optional cardinality hints of segments making up a longer path. The full path's
 * cardinality is the product of its segments, so `"many"` on either side makes the full path
 * `"many"`, while `"one"` requires **both** sides to promise it. When either side is unhinted the
 * result is `undefined` — a `"one"` promise can't be made for a chain containing an unhinted
 * (possibly many) segment, so consumers fall back to schema-multiplicity inspection of the full
 * path, exactly as for a hint-less base declaration (see `ResolvedDeclarationGroup.nested`).
 */
function combineCardinalityHint(
  a: CardinalityHint | undefined,
  b: CardinalityHint | undefined,
): CardinalityHint | undefined {
  if (a === "many" || b === "many") {
    return "many";
  }
  return a === "one" && b === "one" ? "one" : undefined;
}

/**
 * Creates the nested-expansion queue entries for a declaration's resolved paths — one per
 * (resolved path, anchor step). Anchor steps are the ones that fully expose a related instance and can
 * therefore anchor nested content: each resolved path's final step when the declaration omits
 * `properties` (resolved lengths can differ from the declared length when the declaration uses a
 * custom `resolve`, so the final step is derived per resolved path), or every step whose `target`
 * selects all properties, possibly excluding a subset. An `include` selection, `"none"`, and
 * relationship-only steps do not expose the complete instance. `stepIndexOffset` translates a nested
 * declaration's suffix-relative `stepIndex` values into indices of the full path; pass `0` for a
 * direct declaration.
 */
function createNestedQueueEntries(props: {
  declaration: RelatedPropertiesDeclaration;
  paths: ResolvedPath[];
  stepIndexOffset: number;
  appliedPairs: ReadonlySet<string>;
  parentCardinalityHint: CardinalityHint | undefined;
}): NestedQueueEntry[] {
  const { declaration, paths, stepIndexOffset, appliedPairs, parentCardinalityHint } = props;
  const specAnchorIndices = declaration.properties
    ?.filter((spec) => {
      const selection = spec.target?.select;
      return selection === "all" || (typeof selection === "object" && "exclude" in selection);
    })
    .map((spec) => stepIndexOffset + spec.stepIndex);
  const entries: NestedQueueEntry[] = [];
  for (const resolvedPath of paths) {
    const anchorIndices = specAnchorIndices ?? [resolvedPath.path.length - 1];
    for (const anchorIdx of anchorIndices) {
      if (anchorIdx < 0 || anchorIdx >= resolvedPath.path.length) {
        continue;
      }
      entries.push({
        prefixSteps: resolvedPath.path.slice(0, anchorIdx + 1),
        anchorClassName: resolvedPath.path[anchorIdx].targetClassName,
        appliedPairs,
        parentCardinalityHint,
      });
    }
  }
  return entries;
}

/** Keys a `(providerId, anchor class)` pair for the nested-expansion cycle guard and contribution memoization. */
function providerAnchorKey(providerId: string, anchorClassName: string): string {
  return `${providerId}#${anchorClassName}`;
}

/** A pending nested-expansion seed: a concrete prefix ending at an anchor class. */
interface NestedQueueEntry {
  /** Concrete path steps from the original target up to and including the anchor step. */
  prefixSteps: RelationshipPath;
  anchorClassName: EC.FullClassNameDotNotation;
  /** `(providerId, anchorClassName)` pairs already applied earlier on this branch (cycle guard). */
  appliedPairs: ReadonlySet<string>;
  /** Combined cardinality hint of the path up to and including the anchor's producing declaration. */
  parentCardinalityHint: CardinalityHint | undefined;
}

const EMPTY_APPLIED_PAIRS: ReadonlySet<string> = new Set();

/**
 * Expands nested contributions from `applyRecursively` providers over the base declaration
 * groups' anchors, breadth-first. Expansion stops when a nested declaration resolves to no instances
 * or the `(provider, anchor class)` cycle guard detects a repeated branch. Nested declarations are
 * resolved as a full path (`prefixSteps + declaration.path`) from the original target so its instance
 * IDs and filter continue to scope every nested level.
 */
async function resolveNestedGroups({
  imodelAccess,
  target,
  nestedProviders,
  baseGroups,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  target: ContentTarget;
  nestedProviders: IModelFieldsProvider[];
  baseGroups: BaseGroupResolution[];
}): Promise<ResolvedDeclarationGroupOutput[]> {
  if (nestedProviders.length === 0) {
    return [];
  }

  // Memoized per (providerId, anchor class) — many parent paths, even across expansion levels, share
  // the same anchor class.
  const contributionCache = new Map<string, ReturnType<IModelFieldsProvider["getContribution"]>>();
  const getNestedContribution = async (
    provider: IModelFieldsProvider,
    anchorClassName: EC.FullClassNameDotNotation,
  ) => {
    const key = providerAnchorKey(provider.id, anchorClassName);
    let cached = contributionCache.get(key);
    if (!cached) {
      // The synthesized target identifies the anchor class only. Resolving the full path against the
      // original target below preserves its instance IDs and filter.
      cached = provider.getContribution({ imodelAccess, target: { primaryClass: anchorClassName } });
      contributionCache.set(key, cached);
    }
    return cached;
  };

  // Memoized per full (serialized) declared path — distinct branches can re-derive an identical
  // concrete prefix + declared suffix combination.
  const resolutionCache = new Map<string, Promise<ResolvedPath[]>>();
  const resolveFullPath = async (fullPath: RelationshipPath): Promise<ResolvedPath[]> => {
    const key = serializeRelationshipPath({ path: fullPath, includeInstanceFilters: true });
    let cached = resolutionCache.get(key);
    if (!cached) {
      // Resolve from the original target rather than the anchor class so its instance IDs and filter
      // constrain the complete relationship chain.
      cached = resolveDeclarationPaths({ imodelAccess, target, declaration: { path: fullPath } });
      resolutionCache.set(key, cached);
    }
    return cached;
  };

  // Seed the queue from every base group's anchors.
  let queue: NestedQueueEntry[] = baseGroups.flatMap((group) =>
    createNestedQueueEntries({
      declaration: group.declaration,
      paths: group.paths,
      stepIndexOffset: 0,
      appliedPairs: EMPTY_APPLIED_PAIRS,
      parentCardinalityHint: group.declaration.cardinalityHint,
    }),
  );

  // Merged discoveries across all expansion levels, keyed by `(providerId, declarationIndex,
  // anchorClassName, prefixStepCount)` in deterministic (breadth-first, then provider order, then
  // declaration order) first-discovery order. Distinct branches reaching the same anchor class at the
  // same prefix depth merge into one group, de-duplicated by serialized path.
  interface MergedNestedGroup {
    providerId: IModelFieldsProvider["id"];
    declarationIndex: number;
    anchorClassName: EC.FullClassNameDotNotation;
    prefixStepCount: number;
    effectiveCardinalityHint: CardinalityHint | undefined;
    pathsByKey: Map<string, ResolvedPath>;
  }
  const groupsByKey = new Map<string, MergedNestedGroup>();

  // Breadth-first: every entry at the current depth is expanded (all opted-in providers × all their
  // declarations) before the next depth's entries (seeded from this depth's results) are processed.
  // Work within a level runs concurrently (`Promise.all`), but `Promise.all` always resolves to an
  // array in input order regardless of completion timing, so flattening the nested `Promise.all`
  // results (entry order, then provider order, then declaration order) yields the same discovery order
  // on every run — the ordering `resolveTarget` (and its callers) rely on for cacheable sources.
  while (queue.length > 0) {
    const currentLevel = queue;
    queue = [];

    const perEntry = await Promise.all(
      currentLevel.map(async (entry) => {
        const perProvider = await Promise.all(
          nestedProviders.map(async (provider) => {
            const pairKey = providerAnchorKey(provider.id, entry.anchorClassName);
            if (entry.appliedPairs.has(pairKey)) {
              // Cycle guard: this (provider, anchor class) pair already applied earlier on this branch.
              return [];
            }
            const contribution = await getNestedContribution(provider, entry.anchorClassName);
            if (!contribution?.relatedProperties) {
              return [];
            }
            const perDeclaration = await Promise.all(
              contribution.relatedProperties.map(async (declaration, declarationIndex) => {
                // Custom resolvers receive only the synthesized anchor target and cannot constrain
                // results through the concrete prefix from the original target. Their directly resolved
                // paths may still anchor contributions from other providers.
                if (declaration.resolve) {
                  return undefined;
                }
                const fullPath = [...entry.prefixSteps, ...declaration.path];
                const paths = await resolveFullPath(fullPath);
                if (paths.length === 0) {
                  return undefined;
                }
                return { provider, declaration, declarationIndex, paths, pairKey, entry };
              }),
            );
            return perDeclaration.filter((r): r is NonNullable<typeof r> => r !== undefined);
          }),
        );
        return perProvider.flat();
      }),
    );

    for (const { provider, declaration, declarationIndex, paths, pairKey, entry } of perEntry.flat()) {
      const effectiveCardinalityHint = combineCardinalityHint(entry.parentCardinalityHint, declaration.cardinalityHint);
      const groupKey = `${provider.id}#${declarationIndex}#${entry.anchorClassName}#${entry.prefixSteps.length}`;
      let merged = groupsByKey.get(groupKey);
      if (!merged) {
        merged = {
          providerId: provider.id,
          declarationIndex,
          anchorClassName: entry.anchorClassName,
          prefixStepCount: entry.prefixSteps.length,
          effectiveCardinalityHint,
          pathsByKey: new Map(),
        };
        groupsByKey.set(groupKey, merged);
      } else {
        merged.effectiveCardinalityHint = combineCardinalityHint(
          merged.effectiveCardinalityHint,
          effectiveCardinalityHint,
        );
      }
      for (const resolved of paths) {
        const pathKey = serializeRelationshipPath({ path: resolved.path, includeInstanceFilters: true });
        if (!merged.pathsByKey.has(pathKey)) {
          merged.pathsByKey.set(pathKey, resolved);
        }
      }

      // Enqueue this group's own anchors for the next expansion level, extending the branch's
      // applied-pairs guard. No depth limit — expansion stops only when a level yields nothing.
      const nextAppliedPairs = new Set(entry.appliedPairs);
      nextAppliedPairs.add(pairKey);
      queue.push(
        ...createNestedQueueEntries({
          declaration,
          paths,
          stepIndexOffset: entry.prefixSteps.length,
          appliedPairs: nextAppliedPairs,
          parentCardinalityHint: effectiveCardinalityHint,
        }),
      );
    }
  }

  return [...groupsByKey.values()].map((merged) => ({
    providerId: merged.providerId,
    declarationIndex: merged.declarationIndex,
    paths: [...merged.pathsByKey.values()],
    nested: {
      anchorClassName: merged.anchorClassName,
      prefixStepCount: merged.prefixStepCount,
      ...(merged.effectiveCardinalityHint !== undefined
        ? { effectiveCardinalityHint: merged.effectiveCardinalityHint }
        : {}),
    },
  }));
}

function resolveTarget({
  imodelAccess,
  providers,
  externalFieldsProviders,
  target,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  providers: IModelFieldsProvider[];
  externalFieldsProviders: ExternalFieldsProvider[];
  target: ContentTarget;
}): Observable<ContentSource> {
  const resolvedPrimaryClasses = from(resolvePrimaryClasses({ imodelAccess, target }));
  const nestedProviders = providers.filter((provider) => provider.applyRecursively === true);
  const resolvedDeclarations = resolveBaseGroups({ imodelAccess, providers, target }).pipe(
    mergeMap(async (baseGroups): Promise<ResolvedDeclarationGroupOutput[]> => {
      const nestedGroups = await resolveNestedGroups({ imodelAccess, target, nestedProviders, baseGroups });
      // Base groups first (provider then declaration order), followed by nested groups in their
      // breadth-first discovery order (shallower anchors first) — see `ContentSource.resolvedDeclarations`.
      return [
        ...baseGroups.map(({ providerId, declarationIndex, paths }) => ({ providerId, declarationIndex, paths })),
        ...nestedGroups,
      ];
    }),
  );
  const externalInputPaths = from(resolveExternalInputPaths({ imodelAccess, target, externalFieldsProviders }));
  return forkJoin({ target: of(target), resolvedPrimaryClasses, resolvedDeclarations, externalInputPaths });
}

// --- Overlap detection ---

/**
 * Yields every pair of sources that could share an instance, each pair once, in `(i, j)` order.
 *
 * `resolvedPrimaryClasses` holds the *concrete* class of every instance a target reaches (it is
 * enumerated with `GROUP BY ECClassId`, so a target on `bis.Element` lists `bis.PhysicalObject`, never
 * `bis.Element` itself). An instance has exactly one concrete class, so two targets can only share an
 * instance when they resolved the same class name — no hierarchy lookup is needed. Indexing sources by
 * class name therefore finds candidates in time linear in the number of sources rather than scanning
 * every pair.
 */
function* iterateCandidatePairs(sources: readonly ContentSource[]): Generator<[i: number, j: number]> {
  const sourcesByClass = new Map<EC.FullClassNameDotNotation, number[]>();
  for (const [index, source] of sources.entries()) {
    for (const className of source.resolvedPrimaryClasses) {
      getOrCreate({ map: sourcesByClass, key: className, createFunc: () => [] }).push(index);
    }
  }
  // Two sources may share more than one class; check each such pair only once. Indices were pushed in
  // ascending source order, so `indices[a] < indices[b]` already holds.
  const seen = new Set<string>();
  for (const indices of sourcesByClass.values()) {
    for (let a = 0; a < indices.length; ++a) {
      for (let b = a + 1; b < indices.length; ++b) {
        const key = `${indices[a]},${indices[b]}`;
        if (!seen.has(key)) {
          seen.add(key);
          yield [indices[a], indices[b]];
        }
      }
    }
  }
}

// One instance of `a`'s primary class that also satisfies `b`'s scope, if any. Anchored at `a` so
// the outer scan can reuse `a`'s own instance-id join / filter; `b`'s scope is checked via a
// subquery, built at a distinct alias so both targets' `instanceIds` joins/bindings can coexist.
function buildOverlapQuery(a: ContentTarget, b: ContentTarget): ECSqlQueryDef {
  /** The distinct alias used for the "other" target's scope in an overlap-check query's inner subquery. */
  const OVERLAP_OTHER_ALIAS = `${ECSQL_PREFIX}other`;

  const outerFilter = buildTargetFilter(a);
  const innerFilter = buildTargetFilter(b, OVERLAP_OTHER_ALIAS);
  const ecsql = `
    SELECT [${PRIMARY_CLASS_ALIAS}].[ECInstanceId]
    FROM ${ECSql.createClassSelector(a.primaryClass)} [${PRIMARY_CLASS_ALIAS}]
    ${outerFilter.joins?.join("\n") ?? ""}
    WHERE [${PRIMARY_CLASS_ALIAS}].[ECInstanceId] IN (
      SELECT [${OVERLAP_OTHER_ALIAS}].[ECInstanceId]
      FROM ${ECSql.createClassSelector(b.primaryClass)} [${OVERLAP_OTHER_ALIAS}]
      ${innerFilter.joins?.join("\n") ?? ""}
      ${innerFilter.where ? `WHERE ${innerFilter.where}` : ""}
    )
      ${outerFilter.where ? ` AND ${outerFilter.where}` : ""}
    LIMIT 1
  `;
  const bindings = { ...outerFilter.bindings, ...innerFilter.bindings };
  return { ecsql, ...(Object.keys(bindings).length > 0 ? { bindings } : {}) };
}

/**
 * Emits an instance id shared by `a` and `b`'s scopes, or nothing when their scopes are disjoint.
 * Cheap tiers avoid a query where the answer follows from the targets' shapes alone: both scoped
 * by `instanceIds` intersect in JS; either target scoped by neither `instanceIds` nor
 * `instanceFilter` covers every instance of the (already known to intersect) shared class, so any
 * id the other target's `instanceIds` names is shared too. Anything else — e.g. `instanceFilter` on
 * one or both sides, or neither side naming concrete ids — needs a query to know for sure.
 *
 * Returned as an `Observable` rather than a `Promise` so `assertNoOverlappingSources` can race every
 * candidate pair and, on unsubscribing after the first hit, cancel every other pair's still-running
 * query via `finalize`.
 */
function findOverlappingInstanceId({
  imodelAccess,
  a,
  b,
}: {
  imodelAccess: ECSqlQueryExecutor;
  a: ContentTarget;
  b: ContentTarget;
}): Observable<Id64String> {
  if (a.instanceIds && b.instanceIds) {
    const bIds = new Set(b.instanceIds);
    const sharedId = a.instanceIds.find((id) => bIds.has(id));
    return sharedId !== undefined ? of(sharedId) : EMPTY;
  }
  const aCoversAll = !a.instanceIds && !a.instanceFilter;
  const bCoversAll = !b.instanceIds && !b.instanceFilter;
  if (aCoversAll && b.instanceIds) {
    return of(b.instanceIds[0]);
  }
  if (bCoversAll && a.instanceIds) {
    return of(a.instanceIds[0]);
  }

  const reader = imodelAccess.createQueryReader(buildOverlapQuery(a, b), { rowFormat: "Indexes" });
  return from(reader).pipe(
    map((row) => row[0] as Id64String),
    finalize(() => void reader.return?.(undefined)),
  );
}

/**
 * Throws when two resolved sources' targets can reach the same instance. Silently letting it
 * through would either emit the instance twice (unsorted paging) or throw later from
 * `mergeGroupValues` on a duplicated direct selector (sorted paging) — and de-duplicating would
 * drop one source's related properties for that instance. Only pairs that resolved a common concrete
 * class are checked (see `iterateCandidatePairs`); their checks run concurrently up to
 * `QUERY_CONCURRENCY`, and `take(1)` stops at the first confirmed overlap, cancelling the rest.
 */
async function assertNoOverlappingSources({
  imodelAccess,
  sources,
}: {
  imodelAccess: ECSqlQueryExecutor;
  sources: ContentSource[];
}): Promise<void> {
  const overlap = await lastValueFrom(
    from(iterateCandidatePairs(sources)).pipe(
      mergeMap(
        ([i, j]) =>
          findOverlappingInstanceId({ imodelAccess, a: sources[i].target, b: sources[j].target }).pipe(
            map((overlapId) => ({ i, j, overlapId })),
          ),
        QUERY_CONCURRENCY,
      ),
      take(1),
    ),
    { defaultValue: undefined },
  );
  if (overlap) {
    throw new Error(
      `Content targets #${overlap.i} (${sources[overlap.i].target.primaryClass}) and #${overlap.j} (${sources[overlap.j].target.primaryClass}) overlap: instance ${overlap.overlapId} is in both. Merge the targets or make their scopes disjoint.`,
    );
  }
}

// --- Public entry point ---

export async function resolveContentSourcesImpl(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  targets: ContentTarget[];
  imodelFieldsProviders: IModelFieldsProvider[];
  externalFieldsProviders: ExternalFieldsProvider[];
}): Promise<ContentSource[]> {
  if (props.targets.length === 0) {
    return [];
  }

  return lastValueFrom(
    from(props.targets).pipe(
      mergeMap((target, idx) =>
        resolveTarget({
          imodelAccess: props.imodelAccess,
          providers: props.imodelFieldsProviders,
          externalFieldsProviders: props.externalFieldsProviders,
          target,
        }).pipe(map((source) => ({ source, idx }))),
      ),
      toArray(),
      map((items) => {
        items.sort((a, b) => a.idx - b.idx);
        return items.map(({ source }) => source);
      }),
      mergeMap(async (sources) => {
        await assertNoOverlappingSources({ imodelAccess: props.imodelAccess, sources });
        return sources;
      }),
    ),
  );
}
