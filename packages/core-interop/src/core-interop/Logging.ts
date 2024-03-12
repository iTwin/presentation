/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Logger as CoreLogger, LogLevel as CoreLogLevel } from "@itwin/core-bentley";
import { ILogger, LogLevel } from "@itwin/presentation-hierarchy-builder";

/**
 * Create an `ILogger` that uses [Logger]($core-bentley) API to log messages.
 * @beta
 */
export function createLogger(): ILogger {
  return {
    isEnabled: (category, level) => CoreLogger.isEnabled(category, getCoreLogLevel(level)),
    logError: (category, msg) => CoreLogger.logError(category, msg),
    logWarning: (category, msg) => CoreLogger.logWarning(category, msg),
    logInfo: (category, msg) => CoreLogger.logInfo(category, msg),
    logTrace: (category, msg) => CoreLogger.logTrace(category, msg),
  };
}

function getCoreLogLevel(level: LogLevel): CoreLogLevel {
  switch (level) {
    case "error":
      return CoreLogLevel.Error;
    case "warning":
      return CoreLogLevel.Warning;
    case "info":
      return CoreLogLevel.Info;
    case "trace":
      return CoreLogLevel.Trace;
  }
}
