/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { bufferCount, concatAll, concatMap, Observable } from "rxjs";
import { MainThreadBlockHandler } from "../MainThreadBlockHandler";

/**
 * Emits a certain amount of values, then releases the main thread for other timers to use.
 * @internal
 */
export function releaseMainThreadOnItemsCount<T>(elementCount: number) {
  return (obs: Observable<T>): Observable<T> => {
    return obs.pipe(
      bufferCount(elementCount),
      concatMap(async (x) => {
        await MainThreadBlockHandler.releaseMainThread();
        return x;
      }),
      concatAll(),
    );
  };
}
