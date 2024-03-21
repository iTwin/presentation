/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { MonoTypeOperatorFunction, ReplaySubject, share } from "rxjs";

/**
 * This is doing exactly the same as the standard `shareReplay` from `rxjs`, except that
 * source is not retried on error.
 *
 * @internal
 */
export function shareReplayWithErrors<T>(): MonoTypeOperatorFunction<T> {
  return share<T>({
    connector: () => new ReplaySubject(),
    resetOnError: false,
    resetOnComplete: false,
    resetOnRefCountZero: false,
  });
}
