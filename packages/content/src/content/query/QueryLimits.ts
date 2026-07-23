/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";

import type { ECSchemaProvider, ECSql, RelationshipPath } from "@itwin/presentation-shared";
import type { CardinalityHint, ResolvedPath } from "../ContentTarget.js";

/**
 * Maximum number of tables SQLite allows to participate in a single JOIN. When the merged
 * relationship-path joins of a query would exceed this, the base-query builder splits them across
 * multiple sub-queries.
 *
 * @internal
 */
export const SQLITE_MAX_JOIN_TABLES = 64;

/**
 * Maximum number of SELECT statements SQLite allows in a compound (UNION-ed) query. Callers that
 * UNION split groups or chunk queries cap the number of terms below this limit.
 *
 * @internal
 */
export const SQLITE_MAX_COMPOUND_SELECT = 500;

/**
 * Splits `terms` into chunks small enough to be UNION-ed into a single compound SQLite query without
 * exceeding {@link SQLITE_MAX_COMPOUND_SELECT}. Each returned chunk has at most `maxPerChunk` terms.
 *
 * @internal
 */
export function chunkCompoundSelects<T>(terms: T[], maxPerChunk: number = SQLITE_MAX_COMPOUND_SELECT): T[][] {
  if (maxPerChunk < 1) {
    throw new Error(`\`maxPerChunk\` must be at least 1, but got ${maxPerChunk}.`);
  }
  const chunks: T[][] = [];
  for (let i = 0; i < terms.length; i += maxPerChunk) {
    chunks.push(terms.slice(i, i + maxPerChunk));
  }
  return chunks;
}

/**
 * A resolved relationship path paired with the join info the caller resolved for it.
 */
type ResolvedPathWithJoinInfo = ResolvedPath & {
  joinInfo: Awaited<ReturnType<typeof ECSql.createRelationshipPathJoinInfo>>;
};

/**
 * Counts how many tables a resolved relationship-path join info contributes to the SQLite JOIN
 * budget. This is not `info.joins.length`: an outer link-table entry (`relationship-select`) wraps a
 * subquery that itself joins the relationship + target, so it counts as two tables. A single step's
 * info therefore spans 1 to 3 tables (nav property → 1, inner link-table → 2, outer link-table → 3).
 *
 * @internal
 */
export function countJoinTables(info: ResolvedPathWithJoinInfo["joinInfo"]): number {
  return info.joins.reduce((count, join) => count + 1 + (join.joinTarget.kind === "relationship-select" ? 1 : 0), 0);
}

/**
 * Greedily packs relationship paths into groups whose combined join count fits the table budget left
 * after `reservedTables`. Each path carries the join info the caller already resolved for it (via
 * `ECSql.createRelationshipPathJoinInfo`), so the schema is not re-read here and the same infos render
 * the JOIN clauses; a path's table cost is {@link countJoinTables} of its info.
 *
 * `reservedTables` accounts for tables already consumed outside the packed paths (the primary `FROM`,
 * target filter, and query-filterer joins). `budget` defaults to {@link SQLITE_MAX_JOIN_TABLES}.
 *
 * Paths are packed in the given order and counted independently — a path sharing a prefix with
 * another still counts its full cost. A single path whose own cost exceeds the available budget still
 * gets its own group (a path cannot be split).
 *
 * @internal
 */
export function partitionPathsByJoinBudget(props: {
  paths: readonly ResolvedPathWithJoinInfo[];
  reservedTables: number;
  budget?: number;
}): ResolvedPathWithJoinInfo[][] {
  const available = (props.budget ?? SQLITE_MAX_JOIN_TABLES) - props.reservedTables;
  const groups: ResolvedPathWithJoinInfo[][] = [];
  let current: { group: ResolvedPathWithJoinInfo[]; cost: number } = { group: [], cost: 0 };

  for (const path of props.paths) {
    const cost = countJoinTables(path.joinInfo);
    if (current.group.length > 0 && current.cost + cost > available) {
      groups.push(current.group);
      current = { group: [], cost: 0 };
    }
    current.group.push(path);
    current.cost += cost;
  }
  if (current.group.length > 0) {
    groups.push(current.group);
  }
  return groups;
}

/**
 * Determines the effective cardinality of a relationship path — whether each target instance reaches
 * at most one related instance (`"one"`) or possibly many (`"many"`).
 *
 * A caller-supplied `cardinalityHint` always wins (schema multiplicity is frequently over-declared as
 * `many` where the data is effectively 1:1). Without a hint, the path is `"many"` when any step's
 * traversed constraint has an upper multiplicity limit greater than one, honoring
 * `relationshipReverse` to pick the constraint the traversal lands on.
 *
 * @internal
 */
export async function classifyPathCardinality(props: {
  schemaProvider: ECSchemaProvider;
  path: RelationshipPath;
  cardinalityHint?: CardinalityHint;
}): Promise<CardinalityHint> {
  if (props.cardinalityHint) {
    return props.cardinalityHint;
  }
  for (const step of props.path) {
    const relationship = await getClass(props.schemaProvider, step.relationshipName);
    if (!relationship.isRelationshipClass()) {
      throw new Error(`Class ${step.relationshipName} is not a relationship class.`);
    }
    // Traversing the relationship in its declared direction lands on the `target` constraint; a
    // reversed step lands on the `source` constraint. The upper multiplicity limit of that landing
    // end says how many related instances a single source instance reaches.
    const landingConstraint = step.relationshipReverse ? relationship.source : relationship.target;
    if (landingConstraint.multiplicity.upperLimit > 1) {
      return "many";
    }
  }
  return "one";
}
