/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filter, from, lastValueFrom, map, mergeMap, toArray } from "rxjs";
import { ECSql } from "@itwin/presentation-shared";
import { ECSQL_PREFIX } from "./InternalUtils.js";

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
import type { ContentSource, ContentTarget } from "./ContentTarget.js";
import type { IModelFieldsProvider } from "./extensions/IModelFieldsProvider.js";

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
    const expression = target.instanceFilter.expression.replaceAll(`${alias}.`, "[this].");
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
    .map((step: JoinRelationshipPath[number]) => `ec_classname([${step.targetAlias}].ECClassId, 's.c')`)
    .join(", ");
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
      SELECT DISTINCT ${buildClassNameColumns(joinPath)}
      FROM ${target.primaryClass} [this]
      ${joins} ${targetFilter.joins ?? ""}
      ${whereClause}
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

    // First step joins (for the subquery anchoring at source)
    const { joins: firstStepJoins, bindings: firstStepBindings } = await ECSql.createRelationshipPathJoinClause({
      schemaProvider,
      path: [joinPath[0]],
    });

    // Remaining step joins (for the outer query anchored at first hop's target)
    const { joins: remainingJoins, bindings: remainingBindings } = await ECSql.createRelationshipPathJoinClause({
      schemaProvider,
      path: joinPath.slice(1),
    });

    // Anchor at first hop's target class
    const firstStep = joinPath[0];
    const firstHopTarget = firstStep.targetClassName;
    const firstHopAlias = firstStep.targetAlias;

    const instanceFilterClauses = targetFilter.where ? `WHERE ${targetFilter.where}` : "";

    const ecsql = `
      SELECT DISTINCT ${buildClassNameColumns(joinPath)}
      FROM ${firstHopTarget} [${firstHopAlias}]
      ${remainingJoins}
      WHERE [${firstHopAlias}].ECClassId IN (
        SELECT [${firstHopAlias}].ECClassId
        FROM ${target.primaryClass} [this]
        ${firstStepJoins} ${targetFilter.joins ?? ""}
        ${instanceFilterClauses}
      )
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
      SELECT DISTINCT ${buildClassNameColumns(joinPath)}
      FROM ${target.primaryClass} [this]
      ${crossJoins} ${targetFilter.joins ?? ""}
      ${whereClause}
    `;
    return { ecsql, ...(Object.keys(allBindings).length > 0 ? { bindings: allBindings } : {}) };
  },
};

const ALL_STRATEGIES: ResolutionQueryStrategy[] = [originalStrategy, rewriteStrategy, crossJoinStrategy];

// --- Query execution ---

async function raceQueryExecution(executor: ECSqlQueryExecutor, queries: ECSqlQueryDef[]): Promise<ECSqlQueryRow[]> {
  if (queries.length === 1) {
    const result: ECSqlQueryRow[] = [];
    for await (const row of executor.createQueryReader(queries[0])) {
      result.push(row);
    }
    return result;
  }

  const readers = queries.map((query) => executor.createQueryReader(query));

  const { rows, winnerIndex } = await Promise.race(
    readers.map(async (reader, index) => {
      const collected: ECSqlQueryRow[] = [];
      for await (const row of reader) {
        collected.push(row);
      }
      return { rows: collected, winnerIndex: index };
    }),
  );

  // Calling `return()` on the iterator is should cancel the query execution on the backend and free up resources
  for (let i = 0; i < readers.length; i++) {
    if (i !== winnerIndex) {
      void readers[i].return?.(undefined);
    }
  }

  return rows;
}

// --- Result mapping ---

function mapRowsToConcretePaths(
  rows: ECSqlQueryRow[],
  originalPath: RelationshipPath,
  target: ContentTarget,
): RelationshipPath[] {
  return rows.map((row) =>
    originalPath.map((step: RelationshipPath[number], i: number) => ({
      ...step,
      sourceClassName: (i === 0 ? target.primaryClass : row[i - 1]) as EC.FullClassName,
      targetClassName: row[i] as EC.FullClassName,
    })),
  );
}

// --- Declaration resolution ---

async function resolveDeclarationPaths(
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider,
  target: ContentTarget,
  declaration: {
    path: RelationshipPath;
    resolve?: (props: {
      imodelAccess: ECSqlQueryExecutor | ECSchemaProvider;
      target: ContentTarget;
    }) => Promise<RelationshipPath[]>;
  },
): Promise<RelationshipPath[]> {
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

  const applicable = ALL_STRATEGIES.filter((s) => s.isApplicable(ctx));
  const queries = await Promise.all(applicable.map(async (s) => s.buildQuery(ctx)));
  const rows = await raceQueryExecution(imodelAccess, queries);

  return mapRowsToConcretePaths(rows, declaration.path, target);
}

// --- Target resolution ---

function resolveTarget(
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider,
  providers: IModelFieldsProvider[],
  target: ContentTarget,
): Observable<ContentSource> {
  return from(providers).pipe(
    mergeMap(async (provider) => ({
      provider,
      contribution: await provider.getContribution({ imodelAccess, target }),
    })),
    mergeMap(({ provider, contribution }) => {
      if (!contribution?.relatedProperties) {
        return [];
      }
      return from(contribution.relatedProperties).pipe(
        mergeMap(async (declaration, declIdx) => ({
          providerId: provider.id,
          declarationIndex: declIdx,
          paths: await resolveDeclarationPaths(imodelAccess, target, declaration),
        })),
      );
    }),
    filter(({ paths }) => paths.length > 0),
    toArray(),
    map((resolvedDeclarations): ContentSource => ({ target, resolvedDeclarations })),
  );
}

// --- Public entry point ---

export async function resolveContentSources(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  targets: ContentTarget[];
  fieldsProviders: IModelFieldsProvider[];
}): Promise<ContentSource[]> {
  if (props.targets.length === 0 || props.fieldsProviders.length === 0) {
    return props.targets.map((target) => ({ target, resolvedDeclarations: [] }));
  }

  return lastValueFrom(
    from(props.targets).pipe(
      mergeMap((target) => resolveTarget(props.imodelAccess, props.fieldsProviders, target)),
      toArray(),
    ),
  );
}
