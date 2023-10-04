/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Logger } from "@itwin/core-bentley";
import { ILogger } from "@itwin/presentation-hierarchy-builder";

/**
 * Create an `ILogger` that uses [Logger]($core-bentley) API to log messages.
 * @beta
 */
export function createLogger(): ILogger {
  return {
    logError: (category, msg) => Logger.logError(category, msg),
    logWarning: (category, msg) => Logger.logWarning(category, msg),
    logInfo: (category, msg) => Logger.logInfo(category, msg),
    logTrace: (category, msg) => Logger.logTrace(category, msg),
  };
}
