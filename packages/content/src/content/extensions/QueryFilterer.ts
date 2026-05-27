/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ECSqlBinding } from "@itwin/presentation-shared";

/**
 * Modifies the built ECSQL query before execution.
 *
 * **Pipeline stage: 3 (query building)**
 *
 * Called once per query when building ECSQL for `getItems`, `getSize`, or
 * `getInstanceKeys`. Injects additional WHERE clauses (and supporting JOINs)
 * without affecting the descriptor or SELECT columns.
 *
 * Use cases:
 * - Spatial filtering (only include elements within a bounding box).
 * - App-specific business logic filters that apply across all content requests.
 *
 * @public
 */
export interface QueryFilterer {
  /**
   * Returns additional query clauses to inject.
   * Called once per query during Stage 3 (query building).
   *
   * @param props.targetAlias - The alias assigned to the target class in the query.
   */
  getFilterClauses(props: { targetAlias: string }): QueryFilterClauses;
}

/**
 * Additional clauses to inject into the content query.
 *
 * @public
 */
export interface QueryFilterClauses {
  /**
   * Additional JOIN clauses to prepend to the FROM clause.
   * Example: `"JOIN bis.SpatialIndex si ON si.ECInstanceId = this.ECInstanceId"`
   */
  joins?: string[];

  /**
   * Additional WHERE conditions (ANDed with existing conditions).
   * Example: `"this.ECInstanceId IN (SELECT SourceId FROM ...)"`
   */
  where?: string[];

  /**
   * Bind values for the injected clauses, keyed by parameter name.
   * Example: `{ "minArea": { type: "double", value: 100 } }` for { where: `this.Area > :minArea` }.
   */
  bindings?: Record<string, ECSqlBinding>;
}

/**
 * Helper to define a query filterer inline.
 *
 * @public
 */
export function defineQueryFilterer(filterer: QueryFilterer): QueryFilterer {
  return filterer;
}
