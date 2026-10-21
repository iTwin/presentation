/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Transform each item in an async iterable independently.
 *
 * Use cases: formatting raw values into display strings, computing derived values,
 * resolving display labels.
 *
 * @example
 * ```ts
 * const formatted = mapItems(provider.getItems(), (item) => ({
 *   key: item.primaryKey,
 *   values: Object.fromEntries(
 *     fields.map((f) => [f.label, formatValue(item.getValue(f))])
 *   ),
 * }));
 * ```
 *
 * @public
 */
export async function* mapItems<TIn, TOut>(
  items: AsyncIterable<TIn>,
  transform: (item: TIn) => TOut | Promise<TOut>,
): AsyncIterable<TOut> {
  for await (const item of items) {
    yield await transform(item);
  }
}

/**
 * Accumulate across all items in an async iterable to produce a single result.
 *
 * Use cases: merging multi-instance rows into one record with "varies" markers,
 * computing aggregates (min, max, count).
 *
 * @example
 * ```ts
 * const merged = await reduceItems(
 *   provider.getItems(),
 *   (acc, item) => mergeIntoPropertyRecord(acc, item),
 *   createEmptyPropertyRecord(descriptor),
 * );
 * ```
 *
 * @public
 */
export async function reduceItems<TIn, TOut>(
  items: AsyncIterable<TIn>,
  reducer: (accumulator: TOut, item: TIn) => TOut | Promise<TOut>,
  initial: TOut,
): Promise<TOut> {
  let accumulator = initial;
  for await (const item of items) {
    accumulator = await reducer(accumulator, item);
  }
  return accumulator;
}
