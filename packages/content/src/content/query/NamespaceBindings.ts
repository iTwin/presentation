/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ECSqlBinding } from "@itwin/presentation-shared";

/**
 * Prefixes declared parameters in one pass, leaving SQL literals, quoted identifiers and comments unchanged.
 */
export function namespaceBindings(props: { sql: string; bindings: Record<string, ECSqlBinding>; prefix: string }): {
  sql: string;
  bindings: Record<string, ECSqlBinding>;
} {
  const names = Object.keys(props.bindings);
  if (names.length === 0) {
    return { sql: props.sql, bindings: {} };
  }

  const parameters = names
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const tokens = new RegExp(
    String.raw`'(?:''|[^'])*'|"(?:""|[^"])*"|\[(?:\]\]|[^\]])*\]|--[^\r\n]*|/\*[\s\S]*?\*/|:(${parameters})(?![A-Za-z0-9_])`,
    "g",
  );

  return {
    sql: props.sql.replace(tokens, (token, name: string | undefined) =>
      name === undefined ? token : `:${props.prefix}${name}`,
    ),
    bindings: Object.fromEntries(names.map((name) => [`${props.prefix}${name}`, props.bindings[name]])),
  };
}
