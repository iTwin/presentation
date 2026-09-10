/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { mergeBindings } from "../InternalUtils.js";

import type { ECSql, ECSqlBinding } from "@itwin/presentation-shared";
import type { ResolvedPath } from "../ContentTarget.js";

/**
 * Maximum number of tables SQLite allows to participate in a single JOIN. When the merged
 * relationship-path joins of a query would exceed this, the base-query builder splits them across
 * multiple sub-queries.
 *
 * @internal
 */
export const SQLITE_MAX_JOIN_TABLES = 64;

/**
 * Maximum number of `UNION ALL` terms SQLite allows in a compound SELECT (`SQLITE_MAX_COMPOUND_SELECT`).
 * Larger unions are nested into groups of derived tables — the terms are counted per compound statement,
 * and a subquery starts a new one.
 *
 * @internal
 */
export const SQLITE_MAX_COMPOUND_SELECT_TERMS = 500;

/**
 * Number of items the content loader fetches per page. The loader pages itself with a keyset cursor
 * and a `LIMIT` of this size so the frontend query executor never has to page (and OFFSET) our queries
 * internally: each query it runs already fits in one page, bounding time-to-first-value.
 *
 * @internal
 */
export const PAGE_SIZE = 1000;

/** The resolved, render-ready join structure `ECSql.createRelationshipPathJoinInfo` produces for a path. */
export type RelationshipPathJoinInfo = Awaited<ReturnType<typeof ECSql.createRelationshipPathJoinInfo>>;

/**
 * A resolved relationship path paired with the join info the caller resolved for it.
 */
type ResolvedPathWithJoinInfo = ResolvedPath & { joinInfo: RelationshipPathJoinInfo };

/**
 * Counts how many tables a resolved relationship-path join info contributes to the SQLite JOIN
 * budget. This is not `info.joins.length`: an outer link-table entry (`relationship-select`) wraps a
 * subquery that itself joins the relationship + target, so it counts as two tables. A single step's
 * info therefore spans 1 to 3 tables (nav property → 1, inner link-table → 2, outer link-table → 3).
 *
 * @internal
 */
export function countJoinTables(info: RelationshipPathJoinInfo): number {
  return info.steps
    .flatMap((step) => step.joins)
    .reduce((count, join) => count + 1 + (join.joinTarget.kind === "relationship-select" ? 1 : 0), 0);
}

/**
 * Concatenates several resolved path join infos into one, dropping duplicate join entries that share a
 * prefix (identified by `targetClassIdSelector`, which is stable across paths whenever aliases were
 * assigned per unique prefix — see `assignPrefixAliases`) so a shared step is emitted exactly once.
 *
 * @internal
 */
export function mergeJoinInfos(infos: readonly RelationshipPathJoinInfo[]): RelationshipPathJoinInfo {
  const seenTargets = new Set<string>();
  const steps: RelationshipPathJoinInfo["steps"] = [];
  const bindings: Record<string, ECSqlBinding> = {};
  for (const info of infos) {
    for (const step of info.steps) {
      // A step's `targetClassIdSelector` encodes its target alias, which is stable across paths (thanks
      // to `assignPrefixAliases`), so it identifies a shared-prefix step and lets it be emitted once.
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
 * A running SQLite JOIN-table budget accumulator, seeded with `reservedTables` (tables already consumed
 * outside whatever infos get added — the primary `FROM`, target filter, and query-filterer joins).
 *
 * @internal
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
 *
 * @internal
 */
export function createJoinBudget(props: { reservedTables: number; budget?: number }): JoinBudget {
  const limit = props.budget ?? SQLITE_MAX_JOIN_TABLES;
  let merged: RelationshipPathJoinInfo = { steps: [] };
  const costOf = (info: RelationshipPathJoinInfo): number =>
    countJoinTables(mergeJoinInfos([merged, info])) - countJoinTables(merged);
  const remaining = (): number => limit - props.reservedTables - countJoinTables(merged);
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
 * target filter, and query-filterer joins). `budget` defaults to {@link SQLITE_MAX_JOIN_TABLES}.
 *
 * Paths are packed in the given order. A single path whose own cost exceeds the available budget still
 * gets its own group (a path cannot be split).
 *
 * @internal
 */
export function partitionPathsByJoinBudget(props: {
  paths: readonly ResolvedPathWithJoinInfo[];
  reservedTables: number;
  budget?: number;
}): ResolvedPathWithJoinInfo[][] {
  const groups: ResolvedPathWithJoinInfo[][] = [];
  let index = 0;
  while (index < props.paths.length) {
    const budget = createJoinBudget({ reservedTables: props.reservedTables, budget: props.budget });
    const group = [props.paths[index]];
    // A path cannot be split, so the first path of a group is always force-attempted; if it alone
    // overflows the budget, `tryAdd` fails, the group closes with just that one path, and a fresh
    // budget starts the next group instead of carrying its (rejected, so never-merged) cost forward.
    const firstFits = budget.tryAdd(props.paths[index].joinInfo);
    ++index;
    if (firstFits) {
      while (index < props.paths.length && budget.tryAdd(props.paths[index].joinInfo)) {
        group.push(props.paths[index]);
        ++index;
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Packs the longest path prefix that fits `budget` and routes the rest to `overflow`, mutating `budget`
 * in place as paths are added — so a caller can keep packing more paths (e.g. selected columns after
 * sort/filter paths) against the same running budget without recomputing reserved tables.
 *
 * @internal
 */
export function packPathsWithinBudget(props: { paths: readonly ResolvedPathWithJoinInfo[]; budget: JoinBudget }): {
  fitting: ResolvedPathWithJoinInfo[];
  overflow: ResolvedPathWithJoinInfo[];
} {
  const fitting: ResolvedPathWithJoinInfo[] = [];
  for (const [index, path] of props.paths.entries()) {
    if (!props.budget.tryAdd(path.joinInfo)) {
      return { fitting, overflow: [...props.paths.slice(index)] };
    }
    fitting.push(path);
  }
  return { fitting, overflow: [] };
}
