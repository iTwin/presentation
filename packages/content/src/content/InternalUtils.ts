/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Prefix applied to internally generated ECSQL binding names
 * to avoid collisions with consumer-supplied filter bindings.
 *
 * @internal
 */
export const ECSQL_PREFIX = "pres_";

/**
 * Runs `fn` over every item in parallel and concatenates the resulting arrays into a single
 * flat array (preserving input order). A concise replacement for `(await Promise.all(...)).flat()`.
 *
 * @internal
 */
export async function collectInParallel<TItem, TResult>(
  items: readonly TItem[],
  fn: (item: TItem) => Promise<TResult[]>,
): Promise<TResult[]> {
  return (await Promise.all(items.map(fn))).flat();
}

/**
 * Produces a stable JSON representation with recursively sorted object keys, so key order does not
 * affect the result. Useful for hashing or structural equality comparisons of plain data.
 *
 * @internal
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
