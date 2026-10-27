/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  dematerialize,
  filter,
  from,
  lastValueFrom,
  map,
  materialize,
  mergeMap,
  of,
  ReplaySubject,
  takeUntil,
  tap,
  toArray,
} from "rxjs";

/** Stops starting work on failure or abort, but drains running promises before rejecting. */
export async function mapConcurrently<TItem, TResult>({
  items,
  concurrency,
  callback,
  signal,
}: {
  items: readonly TItem[];
  concurrency: number;
  callback: (item: TItem) => Promise<TResult>;
  signal?: AbortSignal;
}): Promise<TResult[]> {
  signal?.throwIfAborted();
  const stop = new ReplaySubject<void>(1);
  return lastValueFrom(
    from(items).pipe(
      mergeMap(
        (item, index) =>
          of(item).pipe(
            // Gate callbacks before mergeMap so stopping doesn't unsubscribe from running promises.
            takeUntil(stop),
            mergeMap(async (value) => {
              signal?.throwIfAborted();
              return callback(value);
            }),
            materialize(),
            filter((notification) => notification.kind !== "C"),
            tap((notification) => {
              if (notification.kind === "E") {
                stop.next();
              }
            }),
            map((notification) => ({ index, notification })),
          ),
        concurrency,
      ),
      toArray(),
      mergeMap((outcomes) => {
        signal?.throwIfAborted();
        const failure = outcomes.find(({ notification }) => notification.kind === "E");
        return from(failure ? [failure] : outcomes.sort((a, b) => a.index - b.index));
      }),
      map(({ notification }) => notification),
      dematerialize(),
      toArray(),
    ),
  );
}
