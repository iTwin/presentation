/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSQL_PREFIX, PRIMARY_CLASS_ALIAS, substituteExpressionAlias } from "../InternalUtils.js";

import type { ECSqlBinding } from "@itwin/presentation-shared";
import type { ContentTarget } from "../ContentTarget.js";

export const TARGET_FILTER_JOIN_ALIAS = `${ECSQL_PREFIX}TargetInstanceIds`;

/**
 * Builds the target's `instanceIds` / `instanceFilter` join, where clause and bindings.
 *
 * `primaryAlias` defaults to {@link PRIMARY_CLASS_ALIAS} — the alias used everywhere else in
 * generated queries. Pass a different alias when the target is scoped to a different alias in the
 * same query (e.g. the inner scope of a two-target overlap check); the join's own alias and binding
 * name are suffixed with it so two calls in one query never collide.
 */
export function buildTargetFilter(
  target: ContentTarget,
  primaryAlias: string = PRIMARY_CLASS_ALIAS,
): { joins?: string[]; where?: string; bindings?: Record<string, ECSqlBinding> } {
  const bindings: Record<string, ECSqlBinding> = {};
  let where: string | undefined;
  const joins: string[] = [];
  const joinAlias =
    primaryAlias === PRIMARY_CLASS_ALIAS ? TARGET_FILTER_JOIN_ALIAS : `${TARGET_FILTER_JOIN_ALIAS}_${primaryAlias}`;

  if (target.instanceIds) {
    joins.push(`JOIN IdSet(:${joinAlias}) [${joinAlias}] ON [${joinAlias}].[id] = [${primaryAlias}].[ECInstanceId]`);
    bindings[joinAlias] = { type: "idset", value: target.instanceIds };
  }

  if (target.instanceFilter) {
    const alias = target.instanceFilter.primaryClassAlias ?? PRIMARY_CLASS_ALIAS;
    const expression = substituteExpressionAlias({
      expression: target.instanceFilter.expression,
      fromAlias: alias,
      toAlias: primaryAlias,
    });
    where = expression;
    if (target.instanceFilter.bindings) {
      Object.assign(bindings, target.instanceFilter.bindings);
    }
  }

  return {
    ...(joins.length > 0 ? { joins } : undefined),
    ...(where ? { where } : undefined),
    ...(Object.keys(bindings).length > 0 ? { bindings } : undefined),
  };
}
