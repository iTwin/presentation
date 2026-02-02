/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { MonoTypeOperatorFunction } from "rxjs";
import { tap } from "rxjs";

/** @internal */
export function tapOnce<T>(observer: () => void): MonoTypeOperatorFunction<T> {
  let first = true;
  return (source) =>
    source.pipe(
      tap(() => {
        if (first) {
          first = false;
          observer();
        }
      }),
    );
}
