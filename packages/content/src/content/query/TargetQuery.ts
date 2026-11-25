/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSql } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, mergeBindings, PRIMARY_CLASS_ALIAS, substituteExpressionAlias } from "../InternalUtils.js";

import type { EC, ECSqlBinding } from "@itwin/presentation-shared";
import type { ContentTarget } from "../ContentTarget.js";

export const TARGET_FILTER_JOIN_ALIAS = `${ECSQL_PREFIX}TargetInstanceIds`;

interface BuildTargetQueryPartsOptions {
  /** Class to select from. Defaults to `target.primaryClass`; source resolution may select a narrower class. */
  primaryClassName?: EC.FullClassNameDotNotation;
  /** Whether to include subclasses. Defaults to true. */
  polymorphic?: boolean;
  /** Alias of the primary class in the query. */
  primaryAlias?: string;
}

/**
 * Builds separate FROM, JOIN and filter fragments for a target-scoped query.
 *
 * `primaryAlias` defaults to {@link PRIMARY_CLASS_ALIAS} — the alias used everywhere else in
 * generated queries. Pass a different alias when the target is scoped to a different alias in the
 * same query (e.g. the inner scope of a two-target overlap check); the ID-set alias and binding
 * name are suffixed with it so two calls in one query never collide.
 */
export function buildTargetQueryParts(
  target: ContentTarget,
  options: BuildTargetQueryPartsOptions = {},
): { from: string; joins: string[]; where?: string; bindings?: Record<string, ECSqlBinding> } {
  const primaryAlias = options.primaryAlias ?? PRIMARY_CLASS_ALIAS;
  const classSelector = ECSql.createClassSelector(options.primaryClassName ?? target.primaryClass);
  const primaryClassSelectClause = `${options.polymorphic === false ? "ONLY " : ""}${classSelector} [${primaryAlias}]`;

  const bindings: Record<string, ECSqlBinding> = {};
  let from = `FROM ${primaryClassSelectClause}`;
  const joins: string[] = [];
  let where: string | undefined;
  const joinAlias =
    primaryAlias === PRIMARY_CLASS_ALIAS ? TARGET_FILTER_JOIN_ALIAS : `${TARGET_FILTER_JOIN_ALIAS}_${primaryAlias}`;

  if (target.instanceIds) {
    from = `FROM IdSet(:${joinAlias}) [${joinAlias}]`;
    // CROSS JOIN keeps IdSet first so SQLite looks up selected IDs instead of scanning the class.
    joins.push(`CROSS JOIN ${primaryClassSelectClause} ON [${primaryAlias}].[ECInstanceId] = [${joinAlias}].[id]`);
    mergeBindings(bindings, { [joinAlias]: { type: "idset", value: target.instanceIds } });
  }

  if (target.instanceFilter) {
    const alias = target.instanceFilter.primaryClassAlias ?? PRIMARY_CLASS_ALIAS;
    const expression = substituteExpressionAlias({
      expression: target.instanceFilter.expression,
      fromAlias: alias,
      toAlias: primaryAlias,
    });
    where = expression;
    mergeBindings(bindings, target.instanceFilter.bindings);
  }

  return {
    from,
    joins,
    ...(where ? { where } : undefined),
    ...(Object.keys(bindings).length > 0 ? { bindings } : undefined),
  };
}
