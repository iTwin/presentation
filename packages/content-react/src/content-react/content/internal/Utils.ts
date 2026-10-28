/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Structural equality for plain data: primitives, `Date`s, arrays and plain objects.
 * Object keys holding `undefined` are treated the same as missing keys.
 */
export function deepEqual(lhs: unknown, rhs: unknown): boolean {
  if (lhs === rhs) {
    return true;
  }
  if (lhs instanceof Date || rhs instanceof Date) {
    return lhs instanceof Date && rhs instanceof Date && lhs.getTime() === rhs.getTime();
  }
  if (typeof lhs !== "object" || typeof rhs !== "object" || lhs === null || rhs === null) {
    return false;
  }
  if (Array.isArray(lhs) || Array.isArray(rhs)) {
    return (
      Array.isArray(lhs) &&
      Array.isArray(rhs) &&
      lhs.length === rhs.length &&
      lhs.every((element, index) => deepEqual(element, rhs[index]))
    );
  }
  const lhsRecord = lhs as Record<string, unknown>;
  const rhsRecord = rhs as Record<string, unknown>;
  const keys = new Set([...Object.keys(lhsRecord), ...Object.keys(rhsRecord)]);
  for (const key of keys) {
    if (!deepEqual(lhsRecord[key], rhsRecord[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Runs `load`, throwing the signal's reason if it's aborted before `load` starts or by the time it completes.
 * Use for loaders that don't accept an abort signal themselves.
 */
export async function abortable<T>(load: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  signal?.throwIfAborted();
  const result = await load();
  signal?.throwIfAborted();
  return result;
}

/**
 * Yields items of the given iterable, throwing the signal's reason as soon as it's aborted.
 * Stops reading the source iterable when aborted.
 */
export async function* abortableIterable<T>(
  items: AsyncIterable<T>,
  signal: AbortSignal | undefined,
): AsyncIterable<T> {
  signal?.throwIfAborted();
  for await (const item of items) {
    signal?.throwIfAborted();
    yield item;
  }
}
