/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSQL_PREFIX } from "../InternalUtils.js";

import type { ECSqlBinding } from "@itwin/presentation-shared";
import type { ContentTarget } from "../ContentTarget.js";

/** @internal */
export const TARGET_FILTER_JOIN_ALIAS = `${ECSQL_PREFIX}TargetInstanceIds`;

/** @internal */
export function buildTargetFilter(target: ContentTarget): {
  joins?: string;
  where?: string;
  bindings?: Record<string, ECSqlBinding>;
} {
  const clauses: string[] = [];
  const bindings: Record<string, ECSqlBinding> = {};
  let joins: string | undefined;

  if (target.instanceIds) {
    joins = `JOIN IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}] ON [${TARGET_FILTER_JOIN_ALIAS}].id = [this].ECInstanceId`;
    bindings[TARGET_FILTER_JOIN_ALIAS] = { type: "idset", value: target.instanceIds };
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
