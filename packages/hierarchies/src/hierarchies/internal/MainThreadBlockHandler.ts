/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LOGGING_NAMESPACE as commonLoggingNamespace } from "./Common";
import { doLog } from "./LoggingUtils";

const LOGGING_NAMESPACE = `${commonLoggingNamespace}.MainThreadBlockHandler`;

/** @internal */
export const DEFAULT_MAIN_THREAD_RELEASE_THRESHOLD = 20;

/** @internal */
export class MainThreadBlockHandler {
  private _lastReleaseTime = performance.now();
  constructor(private _mainThreadReleaseThreshold = DEFAULT_MAIN_THREAD_RELEASE_THRESHOLD) {}

  /**
   * Releases the main thread for other timers to use.
   */
  public static async releaseMainThread() {
    doLog({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ () => "Releasing main thread" });
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Releases the main thread if sufficient time has elapsed.
   */
  public releaseMainThreadIfTimeElapsed(): Promise<void> | undefined {
    const currentTime = performance.now();
    if (currentTime - this._lastReleaseTime < this._mainThreadReleaseThreshold) {
      return undefined;
    }

    this._lastReleaseTime = currentTime;
    return MainThreadBlockHandler.releaseMainThread();
  }
}
