/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filter, finalize, forkJoin, from, lastValueFrom, map, mergeMap, of, race, toArray } from "rxjs";
import { ECSql, getClass } from "@itwin/presentation-shared";
import { PRIMARY_CLASS_ALIAS } from "./InternalUtils.js";
import { serializeRelationshipPath, toSortedUniqueClassNames } from "./model/Utils.js";
import { buildTargetFilter } from "./query/TargetFilter.js";

import type { Observable } from "rxjs";
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
  target,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  providers: IModelFieldsProvider[];
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
  return forkJoin({ target: of(target), resolvedPrimaryClasses, resolvedDeclarations });
}

// --- Public entry point ---

export async function resolveContentSourcesImpl(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  targets: ContentTarget[];
  imodelFieldsProviders: IModelFieldsProvider[];
}): Promise<ContentSource[]> {
  if (props.targets.length === 0) {
    return [];
  }

  return lastValueFrom(
    from(props.targets).pipe(
      mergeMap((target, idx) =>
        resolveTarget({ imodelAccess: props.imodelAccess, providers: props.imodelFieldsProviders, target }).pipe(
          map((source) => ({ source, idx })),
        ),
      ),
      toArray(),
      map((items) => {
        items.sort((a, b) => a.idx - b.idx);
        return items.map(({ source }) => source);
      }),
    ),
  );
}
