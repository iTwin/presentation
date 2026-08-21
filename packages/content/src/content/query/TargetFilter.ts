/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSQL_PREFIX, PRIMARY_CLASS_ALIAS, substituteExpressionAlias } from "../InternalUtils.js";

import type { ECSqlBinding } from "@itwin/presentation-shared";
import type { ContentTarget } from "../ContentTarget.js";

/** @internal */
export const TARGET_FILTER_JOIN_ALIAS = `${ECSQL_PREFIX}TargetInstanceIds`;

/** @internal */
export function buildTargetFilter(target: ContentTarget): {
  joins?: string[];
  where?: string;
  bindings?: Record<string, ECSqlBinding>;
} {
  const bindings: Record<string, ECSqlBinding> = {};
  let where: string | undefined;
  const joins: string[] = [];

  if (target.instanceIds) {
    joins.push(
      `JOIN IdSet(:${TARGET_FILTER_JOIN_ALIAS}) [${TARGET_FILTER_JOIN_ALIAS}] ON [${TARGET_FILTER_JOIN_ALIAS}].[id] = [${PRIMARY_CLASS_ALIAS}].[ECInstanceId]`,
    );
    bindings[TARGET_FILTER_JOIN_ALIAS] = { type: "idset", value: target.instanceIds };
  }

  if (target.instanceFilter) {
    const alias = target.instanceFilter.primaryClassAlias ?? PRIMARY_CLASS_ALIAS;
    const expression = substituteExpressionAlias({
      expression: target.instanceFilter.expression,
      fromAlias: alias,
      toAlias: PRIMARY_CLASS_ALIAS,
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
