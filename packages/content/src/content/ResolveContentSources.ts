/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filter, finalize, forkJoin, from, lastValueFrom, map, mergeMap, of, race, toArray } from "rxjs";
import { ECSql, getClass, normalizeFullClassName } from "@itwin/presentation-shared";
import { ECSQL_PREFIX } from "./InternalUtils.js";
import { toSortedUniqueClassNames } from "./model/Utils.js";

import type { Observable } from "rxjs";
import type {
  EC,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  Props,
  RelationshipPath,
} from "@itwin/presentation-shared";
import type { ContentSource, ContentTarget, ResolvedPath } from "./ContentTarget.js";
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

function buildTargetFilter(target: ContentTarget): {
  joins?: string;
  where?: string;
  bindings?: Record<string, ECSqlBinding>;
} {
  const clauses: string[] = [];
  const bindings: Record<string, ECSqlBinding> = {};
  let joins: string | undefined;

  if (target.instanceIds) {
    const idSetAlias = `${ECSQL_PREFIX}instanceIds`;
    joins = `JOIN IdSet(:${idSetAlias}) [${idSetAlias}] ON [${idSetAlias}].id = [this].ECInstanceId`;
    bindings[idSetAlias] = { type: "idset", value: target.instanceIds };
  }

  if (target.instanceFilter) {
    const alias = target.instanceFilter.primaryClassAlias ?? "this";
    const aliasPattern = new RegExp(`(?:\\[${alias}\\]|\\b${alias})\\.`, "g");
    const expression = target.instanceFilter.expression.replace(aliasPattern, "[this].");
    clauses.push(expression);
    if (target.instanceFilter.bindings) {
      Object.assign(bindings, target.instanceFilter.bindings);
    }
  }

  return {
    ...(joins ? { joins } : undefined),
    ...(clauses.length > 0 ? { where: clauses.join(" AND ") } : undefined),
    ...(Object.keys(bindings).length > 0 ? { bindings } : undefined),
  };
}

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
  relationshipClassIdSelectors: string[];
  targetClassIdSelectors: string[];
}> {
  const info = await ECSql.createRelationshipPathJoinInfo({ schemaProvider, path });
  const joinClause = ECSql.createRelationshipPathJoinClause(info);
  return {
    ...joinClause,
    relationshipClassIdSelectors: info.steps.map((step) => step.relationshipClassIdSelector),
    targetClassIdSelectors: info.steps.map((step) => step.targetClassIdSelector),
  };
}

// Distinct-class scan of the primary itself: enumerates the concrete classes that actually
// have instances in scope (honoring the target's instance IDs / filter). A plain class
// selector is polymorphic, so this naturally spans the selected base and all its subclasses.
function buildPrimaryEnumerationQuery(target: ContentTarget): ECSqlQueryDef {
  const targetFilter = buildTargetFilter(target);
  const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
  const ecsql = `
    SELECT ec_classname([this].[ECClassId], 's.c')
    FROM ${ECSql.createClassSelector(target.primaryClass)} [this]
    ${targetFilter.joins ?? ""}
    ${whereClause}
    GROUP BY [this].[ECClassId]
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
    const {
      joins,
      bindings: joinBindings,
      relationshipClassIdSelectors,
      targetClassIdSelectors,
    } = await resolveJoin(schemaProvider, joinPath);
    const targetFilter = buildTargetFilter(target);
    const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
    const allBindings = { ...joinBindings, ...targetFilter.bindings };
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([this].[ECClassId], 's.c')), ${buildClassNameColumns(targetClassIdSelectors)}, ${buildClassNameColumns(relationshipClassIdSelectors)}
      FROM ${ECSql.createClassSelector(target.primaryClass)} [this]
      ${joins} ${targetFilter.joins ?? ""}
      ${whereClause}
      GROUP BY ${buildClassIdColumns(targetClassIdSelectors)}, ${buildClassIdColumns(relationshipClassIdSelectors)}
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
      {
        joins: firstStepJoins,
        bindings: firstStepBindings,
        relationshipClassIdSelectors: firstStepRelSelectors,
        targetClassIdSelectors: firstStepTargetSelectors,
      },
      {
        joins: remainingJoins,
        bindings: remainingBindings,
        relationshipClassIdSelectors: remainingRelSelectors,
        targetClassIdSelectors: remainingTargetSelectors,
      },
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

    const firstStepRelSelector = firstStepRelSelectors[0];
    const targetClassIdSelectors = [...firstStepTargetSelectors, ...remainingTargetSelectors];

    const instanceFilterClauses = targetFilter.where ? `WHERE ${targetFilter.where}` : "";

    // The inner scan is anchored at the (large) source, but only ever yields a small set of
    // DISTINCT (first-hop class, near-end class) id pairs. Joining that derived table keeps the
    // outer scan anchored at the first hop while still projecting the concrete near-end class.
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([reachable].[NearEndClassId], 's.c')), ${buildClassNameColumns(targetClassIdSelectors)}, ec_classname([reachable].[FirstStepRelClassId], 's.c'), ${buildClassNameColumns(remainingRelSelectors)}
      FROM ${ECSql.createClassSelector(firstHopTarget)} [${firstHopAlias}]
      ${remainingJoins}
      INNER JOIN (
        SELECT [${firstHopAlias}].[ECClassId] [FirstHopClassId], [this].[ECClassId] [NearEndClassId], ${firstStepRelSelector} [FirstStepRelClassId]
        FROM ${ECSql.createClassSelector(target.primaryClass)} [this]
        ${firstStepJoins} ${targetFilter.joins ?? ""}
        ${instanceFilterClauses}
        GROUP BY [${firstHopAlias}].[ECClassId], [this].[ECClassId], ${firstStepRelSelector}
      ) [reachable] ON [reachable].[FirstHopClassId] = [${firstHopAlias}].[ECClassId]
      GROUP BY ${buildClassIdColumns(targetClassIdSelectors)}, [reachable].[FirstStepRelClassId], ${buildClassIdColumns(remainingRelSelectors)}
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
    const {
      joins,
      bindings: joinBindings,
      relationshipClassIdSelectors,
      targetClassIdSelectors,
    } = await resolveJoin(schemaProvider, joinPath);
    const crossJoins = joins.replaceAll(/\bINNER\s+JOIN\b/gi, "CROSS JOIN");
    const targetFilter = buildTargetFilter(target);
    const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
    const allBindings = { ...joinBindings, ...targetFilter.bindings };
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([this].[ECClassId], 's.c')), ${buildClassNameColumns(targetClassIdSelectors)}, ${buildClassNameColumns(relationshipClassIdSelectors)}
      FROM ${ECSql.createClassSelector(target.primaryClass)} [this]
      ${crossJoins} ${targetFilter.joins ?? ""}
      ${whereClause}
      GROUP BY ${buildClassIdColumns(targetClassIdSelectors)}, ${buildClassIdColumns(relationshipClassIdSelectors)}
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
    sourceAlias: i === 0 ? "this" : `s${i - 1}`,
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
      // Each row is one resolved path: [nearEndClasses, step0Target, step1Target, ..., step0Rel,
      // step1Rel, ...]. The concrete content-target (near-end) classes are pre-aggregated by the
      // query via `GROUP_CONCAT`. Step target and relationship classes are the concrete classes
      // found in the data, resolved per step.
      map((row) => {
        const stepCount = declaration.path.length;
        return {
          path: declaration.path.map((step: RelationshipPath[number], i: number) => ({
            ...step,
            sourceClassName: (i === 0 ? target.primaryClass : row[i]) as EC.FullClassName,
            targetClassName: row[i + 1] as EC.FullClassName,
            relationshipName: row[stepCount + 1 + i] as EC.FullClassName,
          })),
          targetClassNames: toSortedUniqueClassNames((row[0] as string).split(",") as EC.FullClassName[]),
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
  const derivedClasses = await primaryClass.getDerivedClasses();
  if (derivedClasses.length === 0) {
    return [normalizeFullClassName(target.primaryClass)];
  }

  const reader = imodelAccess.createQueryReader(buildPrimaryEnumerationQuery(target), { rowFormat: "Indexes" });
  const classNames: EC.FullClassNameDotNotation[] = [];
  for await (const row of reader) {
    classNames.push(row[0] as EC.FullClassNameDotNotation);
  }
  return toSortedUniqueClassNames(classNames);
}

function resolveTarget({
  imodelAccess,
  providers,
  target,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector;
  providers: IModelFieldsProvider[];
  target: ContentTarget;
}): Observable<ContentSource> {
  const resolvedPrimaryClasses = from(resolvePrimaryClasses({ imodelAccess, target }));
  const resolvedDeclarations = from(providers).pipe(
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
        mergeMap(async (declaration, declIdx) => ({
          providerIdx,
          providerId: provider.id,
          declarationIndex: declIdx,
          paths: await resolveDeclarationPaths({ imodelAccess, target, declaration }),
        })),
      );
    }),
    filter(({ paths }) => paths.length > 0),
    toArray(),
    map((res) => {
      res.sort((a, b) => a.providerIdx - b.providerIdx || a.declarationIndex - b.declarationIndex);
      return res.map(({ providerId, declarationIndex, paths }) => ({ providerId, declarationIndex, paths }));
    }),
  );
  return forkJoin({ target: of(target), resolvedPrimaryClasses, resolvedDeclarations });
}

// --- Public entry point ---

export async function resolveContentSourcesImpl(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector;
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
