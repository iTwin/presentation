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

type JoinRelationshipPath = Props<typeof ECSql.createRelationshipPathJoinClause>["path"];

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

function buildClassNameColumns(path: JoinRelationshipPath): string {
  return path
    .map((step: JoinRelationshipPath[number]) => `ec_classname([${step.targetAlias}].[ECClassId], 's.c')`)
    .join(", ");
}

// The `ECClassId` columns behind `buildClassNameColumns` — used for `GROUP BY`. Grouping on the
// raw indexed `ECClassId` lets the engine use its index, unlike `DISTINCT` on the computed
// `ec_classname(...)` string.
function buildClassIdColumns(path: JoinRelationshipPath): string {
  return path.map((step: JoinRelationshipPath[number]) => `[${step.targetAlias}].[ECClassId]`).join(", ");
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
    const { joins, bindings: joinBindings } = await ECSql.createRelationshipPathJoinClause({
      schemaProvider,
      path: joinPath,
    });
    const targetFilter = buildTargetFilter(target);
    const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
    const allBindings = { ...joinBindings, ...targetFilter.bindings };
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([this].[ECClassId], 's.c')), ${buildClassNameColumns(joinPath)}
      FROM ${ECSql.createClassSelector(target.primaryClass)} [this]
      ${joins} ${targetFilter.joins ?? ""}
      ${whereClause}
      GROUP BY ${buildClassIdColumns(joinPath)}
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
      { joins: firstStepJoins, bindings: firstStepBindings },
      { joins: remainingJoins, bindings: remainingBindings },
    ] = await Promise.all([
      // First step joins (for the subquery anchoring at source)
      ECSql.createRelationshipPathJoinClause({ schemaProvider, path: [joinPath[0]] }),
      // Remaining step joins (for the outer query anchored at first hop's target)
      ECSql.createRelationshipPathJoinClause({ schemaProvider, path: joinPath.slice(1) }),
    ]);

    // Anchor at first hop's target class
    const firstStep = joinPath[0];
    const firstHopTarget = firstStep.targetClassName;
    const firstHopAlias = firstStep.targetAlias;

    const instanceFilterClauses = targetFilter.where ? `WHERE ${targetFilter.where}` : "";

    // The inner scan is anchored at the (large) source, but only ever yields a small set of
    // DISTINCT (first-hop class, near-end class) id pairs. Joining that derived table keeps the
    // outer scan anchored at the first hop while still projecting the concrete near-end class.
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([reachable].[NearEndClassId], 's.c')), ${buildClassNameColumns(joinPath)}
      FROM ${ECSql.createClassSelector(firstHopTarget)} [${firstHopAlias}]
      ${remainingJoins}
      INNER JOIN (
        SELECT [${firstHopAlias}].[ECClassId] [FirstHopClassId], [this].[ECClassId] [NearEndClassId]
        FROM ${ECSql.createClassSelector(target.primaryClass)} [this]
        ${firstStepJoins} ${targetFilter.joins ?? ""}
        ${instanceFilterClauses}
        GROUP BY [${firstHopAlias}].[ECClassId], [this].[ECClassId]
      ) [reachable] ON [reachable].[FirstHopClassId] = [${firstHopAlias}].[ECClassId]
      GROUP BY ${buildClassIdColumns(joinPath)}
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
    const { joins, bindings: joinBindings } = await ECSql.createRelationshipPathJoinClause({
      schemaProvider,
      path: joinPath,
    });
    const crossJoins = joins.replaceAll(/\bINNER\s+JOIN\b/gi, "CROSS JOIN");
    const targetFilter = buildTargetFilter(target);
    const whereClause = targetFilter.where ? `WHERE ${targetFilter.where}` : "";
    const allBindings = { ...joinBindings, ...targetFilter.bindings };
    const ecsql = `
      SELECT GROUP_CONCAT(DISTINCT ec_classname([this].[ECClassId], 's.c')), ${buildClassNameColumns(joinPath)}
      FROM ${ECSql.createClassSelector(target.primaryClass)} [this]
      ${crossJoins} ${targetFilter.joins ?? ""}
      ${whereClause}
      GROUP BY ${buildClassIdColumns(joinPath)}
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
      // Each row is one resolved path: [nearEndClasses, step0Target, step1Target, ...]. The concrete
      // content-target (near-end) classes are pre-aggregated by the query via `GROUP_CONCAT`.
      map((row) => ({
        path: declaration.path.map((step: RelationshipPath[number], i: number) => ({
          ...step,
          sourceClassName: (i === 0 ? target.primaryClass : row[i]) as EC.FullClassName,
          targetClassName: row[i + 1] as EC.FullClassName,
        })),
        targetClassNames: toSortedUniqueClassNames((row[0] as string).split(",") as EC.FullClassName[]),
      })),
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
  fieldsProviders: IModelFieldsProvider[];
}): Promise<ContentSource[]> {
  if (props.targets.length === 0 || props.fieldsProviders.length === 0) {
    return props.targets.map((target) => ({ target, resolvedPrimaryClasses: [], resolvedDeclarations: [] }));
  }

  return lastValueFrom(
    from(props.targets).pipe(
      mergeMap((target, idx) =>
        resolveTarget({ imodelAccess: props.imodelAccess, providers: props.fieldsProviders, target }).pipe(
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
