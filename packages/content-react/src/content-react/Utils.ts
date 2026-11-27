/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runs `load`, rejecting with the signal's reason as soon as the signal is aborted, without waiting for `load` to
 * complete. Use for loaders that don't accept an abort signal themselves: their work keeps running, but its result is
 * dropped.
 */
export async function abortable<T>(load: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  return withAbort(load, signal);
}

/**
 * Yields items of the given iterable, rejecting with the signal's reason as soon as the signal is aborted, even
 * while an item is still being read.
 *
 * A plain `for await` only gets control between items, and awaits the source's `return()` when the loop exits early,
 * which an async generator suspended on a pending item queues behind that item. So this wrapper races every read
 * against the signal, and releases the source without waiting for it.
 */
export function abortableIterable<T>(items: AsyncIterable<T>, signal: AbortSignal | undefined): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const source = items[Symbol.asyncIterator]();
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          // Nobody waits for the release, so ignore its errors rather than leaving them unhandled.
          source.return?.().catch(() => {});
        }
      };
      return {
        async next() {
          try {
            return await withAbort(async () => source.next(), signal);
          } catch (e) {
            // `for await` doesn't call `return()` when `next()` rejects, so release the source here.
            release();
            throw e;
          }
        },
        async return() {
          release();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/**
 * Starts `start` unless the signal is already aborted, and settles like the started promise, but rejects with the
 * signal's reason as soon as the signal is aborted, including when `start` itself aborts it.
 */
async function withAbort<T>(start: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) {
    return start();
  }
  signal.throwIfAborted();
  const promise = start();
  let removeAbortListener: (() => void) | undefined;
  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        const onAbort = () => reject(signal.reason);
        // `start` may have aborted the signal, in which case the `abort` event has already been raised.
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      }),
    ]);
    // The signal may have been aborted after `promise` settled, but before this continuation ran.
    signal.throwIfAborted();
    return result;
  } finally {
    removeAbortListener?.();
  }
}
