/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LOGGING_NAMESPACE as CommonLoggingNamespace } from "./Common";
import { doLog } from "./LoggingUtils";

const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.ReleaseMainThread`;

/** @internal */
export async function releaseMainThread() {
  doLog({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ () => "Releasing main thread" });
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** @internal */
export function createMainThreadReleaseOnTimePassedHandler(releaseOnTimePassed = 40) {
  let start = Date.now();
  return (): Promise<void> | undefined => {
    const elapsed = Date.now() - start;
    if (elapsed < releaseOnTimePassed) {
      return undefined;
    }
    return releaseMainThread().then(() => {
      start = Date.now();
    });
  };
}
