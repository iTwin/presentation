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
