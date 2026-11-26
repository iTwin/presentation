/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { mergeBindings } from "../InternalUtils.js";

import type { EC, ECSql, ECSchemaProvider, ECSqlBinding } from "@itwin/presentation-shared";
import type { ResolvedPath } from "../ContentTarget.js";

/**
 * Maximum number of tables SQLite allows to participate in a single JOIN. When the merged
 * relationship-path joins of a query would exceed this, the base-query builder splits them across
 * multiple sub-queries.
 */
export const SQLITE_MAX_JOIN_TABLES = 64;

/**
 * Maximum number of `UNION ALL` terms SQLite allows in a compound SELECT (`SQLITE_MAX_COMPOUND_SELECT`).
 * Larger unions are nested into groups of derived tables — the terms are counted per compound statement,
 * and a subquery starts a new one.
 */
export const SQLITE_MAX_COMPOUND_SELECT_TERMS = 500;

/**
 * Number of items the content loader fetches per page. The loader pages itself with a keyset cursor
 * and a `LIMIT` of this size so the frontend query executor never has to page (and OFFSET) our queries
 * internally: each query it runs already fits in one page, bounding time-to-first-value.
 */
export const PAGE_SIZE = 1000;

/** The resolved, render-ready join structure `ECSql.createRelationshipPathJoinInfo` produces for a path. */
export type RelationshipPathJoinInfo = Awaited<ReturnType<typeof ECSql.createRelationshipPathJoinInfo>>;

/**
 * A resolved relationship path paired with the join info the caller resolved for it.
 */
type ResolvedPathWithJoinInfo = ResolvedPath & { joinInfo: RelationshipPathJoinInfo };

/*
 * Per-class table estimates. One ECClass in an ECSQL query can expand to several SQLite table references:
 * the hierarchy's base table, a joined table (`JoinedTablePerDirectSubclass` mapping), an `_Overflow`
 * table once shared columns run out, and `ec_cache_ClassHierarchy` for polymorphic class checks. How many
 * of them a query joins depends on what it selects or filters, so the budget assumes the worst case.
 *
 * The numbers come from `EXPLAIN QUERY PLAN` on the native SQL of `SELECT *` queries against subclasses
 * with 150 properties (enough to spill into overflow tables), one for each mapping kind below:
 * - `BisCore.Element` subclass: 4 tables (`bis_Element`, joined table, overflow, class-hierarchy cache).
 * - `BisCore.ElementAspect` and `BisCore.Model` subclasses: 3 tables. BIS maps these hierarchies to a
 *   single table per hierarchy, so there's no joined table.
 * - Link-table relationship with subclasses: 2 tables (link table, class-hierarchy cache).
 * - Plain ECDb class mapped with `TablePerHierarchy` + `JoinedTablePerDirectSubclass` + `ShareColumns`:
 *   4 tables for a polymorphic query on a subclass that has subclasses of its own (base table, joined
 *   table, overflow, class-hierarchy cache), same count as an element.
 *
 * Any other entity class may use a joined-table mapping, so it gets the full 4-table estimate.
 */

/** Estimated SQLite tables for an entity class that may use a joined-table mapping, e.g. a `BisCore.Element` subclass. */
export const MAX_TABLES_PER_ENTITY_CLASS = 4;

/** Estimated SQLite tables for a `BisCore.ElementAspect` or `BisCore.Model` subclass, which have no joined table. */
export const MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS = 3;

/** Estimated SQLite tables for a link-table relationship. */
export const MAX_TABLES_PER_LINK_TABLE_RELATIONSHIP = 2;

const ASPECT_OR_MODEL_BASE_CLASSES: EC.FullClassNameDotNotation[] = ["BisCore.ElementAspect", "BisCore.Model"];

/**
 * Maps each entity class to its estimated SQLite table count: {@link MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS}
 * for aspects and models, {@link MAX_TABLES_PER_ENTITY_CLASS} for every other class.
 */
export async function resolveClassTableCounts(props: {
  schemaProvider: Pick<ECSchemaProvider, "classDerivesFrom">;
  classNames: ReadonlySet<EC.FullClassNameDotNotation>;
}): Promise<ReadonlyMap<string, number>> {
  const entries = await Promise.all(
    [...props.classNames].map(
      async (className) =>
        [
          className,
          (await isAspectOrModelClass(props.schemaProvider, className))
            ? MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS
            : MAX_TABLES_PER_ENTITY_CLASS,
        ] as const,
    ),
  );
  return new Map(entries);
}

async function isAspectOrModelClass(
  schemaProvider: Pick<ECSchemaProvider, "classDerivesFrom">,
  className: EC.FullClassNameDotNotation,
): Promise<boolean> {
  for (const baseClassName of ASPECT_OR_MODEL_BASE_CLASSES) {
    if (await schemaProvider.classDerivesFrom(className, baseClassName)) {
      return true;
    }
  }
  return false;
}

/**
 * Counts how many tables a resolved relationship-path join info contributes to the SQLite JOIN
 * budget. Entity classes use their resolved table count, defaulting to {@link MAX_TABLES_PER_ENTITY_CLASS};
 * link-table relationships use {@link MAX_TABLES_PER_LINK_TABLE_RELATIONSHIP}. A step therefore costs
 * `T` (navigation property), `R + T` (inner link-table) or `R + 2T` (outer link-table).
 */
function countJoinTables(info: RelationshipPathJoinInfo, classTableCounts?: ReadonlyMap<string, number>): number {
  const classTableCount = (className: string) => classTableCounts?.get(className) ?? MAX_TABLES_PER_ENTITY_CLASS;
  return info.steps.reduce(
    (count, step) =>
      count +
      step.joins.reduce((stepCount, join, i) => {
        if (join.joinTarget.kind === "relationship-select") {
          return (
            stepCount + MAX_TABLES_PER_LINK_TABLE_RELATIONSHIP + classTableCount(join.joinTarget.innerTarget.className)
          );
        }
        const isLinkTableRelationship = step.joins.length > 1 && i === 0;
        return (
          stepCount +
          (isLinkTableRelationship
            ? MAX_TABLES_PER_LINK_TABLE_RELATIONSHIP
            : classTableCount(join.joinTarget.className))
        );
      }, 0),
    0,
  );
}

function mergeJoinInfoSteps(infos: readonly RelationshipPathJoinInfo[]): RelationshipPathJoinInfo["steps"] {
  const seenTargets = new Set<string>();
  const steps: RelationshipPathJoinInfo["steps"] = [];
  for (const info of infos) {
    for (const step of info.steps) {
      if (!seenTargets.has(step.targetClassIdSelector)) {
        seenTargets.add(step.targetClassIdSelector);
        steps.push(step);
      }
    }
  }
  return steps;
}

/**
 * Concatenates several resolved path join infos into one, dropping duplicate join entries that share a
 * prefix (identified by `targetClassIdSelector`, which is stable across paths whenever aliases were
 * assigned per unique prefix — see `assignPrefixAliases`) so a shared step is emitted exactly once.
 */
export function mergeJoinInfos(infos: readonly RelationshipPathJoinInfo[]): RelationshipPathJoinInfo {
  const steps = mergeJoinInfoSteps(infos);
  const bindings: Record<string, ECSqlBinding> = {};
  for (const info of infos) {
    // Shared-prefix steps contribute identical bindings; keep an identical duplicate but reject a name
    // reused with a different value.
    mergeBindings(bindings, info.bindings);
  }
  return { steps, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
}

/**
 * A running SQLite JOIN-table budget accumulator, seeded with `reservedTables` (tables already consumed
 * outside whatever infos get added — the primary `FROM` and target filter).
 *
 * Packing logic (`packPathsWithinBudget`, `partitionPathsByJoinBudget`) only ever calls `tryAdd`;
 * `costOf`/`remaining` are exposed so the budget's arithmetic — prefix-sharing dedup, reserved-tables
 * accounting — can be unit-tested directly instead of inferred from packing outcomes.
 */
export interface JoinBudget {
  /** Tables `info` would newly contribute if it were added. */
  costOf(info: RelationshipPathJoinInfo): number;
  /** Adds `info` if its incremental cost fits the remaining budget; returns whether it was added. */
  tryAdd(info: RelationshipPathJoinInfo): boolean;
  /** Tables left in the budget. */
  remaining(): number;
}

/**
 * Creates a {@link JoinBudget}. Every `tryAdd` merges the new info into a running merged join info (see
 * {@link mergeJoinInfos}), so a path sharing a prefix with one already added costs only its own unshared
 * suffix — not its full, independently-counted cost. `budget` defaults to {@link SQLITE_MAX_JOIN_TABLES}.
 */
export function createJoinBudget(props: {
  reservedTables: number;
  budget?: number;
  classTableCounts?: ReadonlyMap<string, number>;
}): JoinBudget {
  const limit = props.budget ?? SQLITE_MAX_JOIN_TABLES;
  const classTableCounts = props.classTableCounts;
  let merged: RelationshipPathJoinInfo = { steps: [] };
  const costOf = (info: RelationshipPathJoinInfo): number =>
    countJoinTables({ steps: mergeJoinInfoSteps([merged, info]) }, classTableCounts) -
    countJoinTables(merged, classTableCounts);
  const remaining = (): number => limit - props.reservedTables - countJoinTables(merged, classTableCounts);
  return {
    costOf,
    remaining,
    tryAdd(info) {
      const cost = costOf(info);
      if (cost > remaining()) {
        return false;
      }
      merged = mergeJoinInfos([merged, info]);
      return true;
    },
  };
}

/**
 * Greedily packs relationship paths into groups whose combined join count fits the table budget left
 * after `reservedTables`. Each path carries the join info the caller already resolved for it (via
 * `ECSql.createRelationshipPathJoinInfo`), so the schema is not re-read here and the same infos render
 * the JOIN clauses. A fresh {@link JoinBudget} seeds each group, so shared-prefix cost is deduped within
 * a group but not across groups (each group renders its joins independently).
 *
 * `reservedTables` accounts for tables already consumed outside the packed paths (the primary `FROM`,
 * target filter). `budget` defaults to {@link SQLITE_MAX_JOIN_TABLES}.
 *
 * Paths are packed in the given order. Throws when a single path exceeds the available budget because
 * it cannot be split into valid queries.
 */
export function partitionPathsByJoinBudget(props: {
  paths: readonly ResolvedPathWithJoinInfo[];
  reservedTables: number;
  budget?: number;
  classTableCounts?: ReadonlyMap<string, number>;
}): ResolvedPathWithJoinInfo[][] {
  const groups: ResolvedPathWithJoinInfo[][] = [];
  let index = 0;
  while (index < props.paths.length) {
    const budget = createJoinBudget({
      reservedTables: props.reservedTables,
      budget: props.budget,
      classTableCounts: props.classTableCounts,
    });
    const group = [props.paths[index]];
    if (!budget.tryAdd(props.paths[index].joinInfo)) {
      throw new Error("A relationship path exceeds the SQLite JOIN-table limit.");
    }
    ++index;
    while (index < props.paths.length && budget.tryAdd(props.paths[index].joinInfo)) {
      group.push(props.paths[index]);
      ++index;
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Packs the longest path prefix that fits `budget` and routes the rest to `overflow`, mutating `budget`
 * in place as paths are added — so a caller can keep packing more paths (e.g. selected columns after
 * sort/filter paths) against the same running budget without recomputing reserved tables.
 */
export function packPathsWithinBudget(props: { paths: readonly ResolvedPathWithJoinInfo[]; budget: JoinBudget }): {
  fitting: ResolvedPathWithJoinInfo[];
  overflow: ResolvedPathWithJoinInfo[];
} {
  const fitting: ResolvedPathWithJoinInfo[] = [];
  for (const [index, path] of props.paths.entries()) {
    if (!props.budget.tryAdd(path.joinInfo)) {
      return { fitting, overflow: props.paths.slice(index) };
    }
    fitting.push(path);
  }
  return { fitting, overflow: [] };
}
