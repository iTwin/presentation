/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wraps an async iterable so that `for await` over it stops as soon as `signal` aborts, even while a
 * value is still pending.
 *
 * A plain `for await` only gets control between values, so an abort during a slow value takes effect
 * only once that value arrives. It also awaits `return()` when the loop exits early, and an async
 * generator suspended on a pending value queues that `return()` behind it, stalling the caller. This
 * wrapper races each `next()` against the signal and releases the inner iterator without awaiting it.
 */
export function abortable<T>(iterable: AsyncIterable<T>, signal: AbortSignal | undefined): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const inner = iterable[Symbol.asyncIterator]();
      const release = () => void inner.return?.();
      return {
        async next() {
          try {
            return await withAbort(inner.next(), signal);
          } catch (e) {
            // `for await` doesn't call `return()` when `next()` rejects, so release the inner iterator here.
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

/** Rejects as soon as `signal` aborts, rather than waiting for `promise` to settle first. */
async function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) {
    return promise;
  }
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        onAbort = () =>
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new Error(`Operation was aborted: ${String(signal.reason)}`, { cause: signal.reason }),
          );
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}
