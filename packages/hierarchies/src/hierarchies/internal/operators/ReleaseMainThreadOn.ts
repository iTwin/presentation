/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { bufferCount, concatAll, concatMap, Observable } from "rxjs";
import { LOGGING_NAMESPACE as commonLoggingNamespace } from "../Common";
import { doLog } from "../LoggingUtils";

const LOGGING_NAMESPACE = `${commonLoggingNamespace}.ReleaseMainThread`;

/**
 * Releases the main thread for other timers to use.
 * @internal
 */
export const releaseMainThread = async () => {
  doLog({ category: LOGGING_NAMESPACE, message: () => "Releasing main thread" });
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/**
 * Emits a certain amount of values, then releases the main thread for other timers to use.
 * @internal
 */
export function releaseMainThreadOn<T>(elementCount: number) {
  return (obs: Observable<T>): Observable<T> => {
    return obs.pipe(
      bufferCount(elementCount),
      concatMap(async (x) => {
        await releaseMainThread();
        return x;
      }),
      concatAll(),
    );
  };
}
