/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel as CoreLogLevel } from "@itwin/core-bentley";
import { ILogger, LogLevel } from "@itwin/presentation-hierarchies";

/**
 * Defines input for `createLogger`. Generally, this is the [Logger](https://www.itwinjs.org/reference/core-bentley/logging/logger/)
 * class from `@itwin/core-bentley` package.
 */
interface ICoreLogger {
  isEnabled(category: string, level: CoreLogLevel): boolean;
  logError(category: string, message: string): void;
  logWarning(category: string, message: string): void;
  logInfo(category: string, message: string): void;
  logTrace(category: string, message: string): void;
}

/**
 * Creates an `ILogger` that uses [Logger](https://www.itwinjs.org/reference/core-bentley/logging/logger/)
 * API to log messages.
 *
 * Usage example:
 *
 * ```ts
 * import { Logger } from "@itwin/core-bentley";
 * import { createLogger } from "@itwin/presentation-core-interop";
 * import { setLogger } from "@itwin/presentation-hierarchies";
 *
 * setLogger(createLogger(Logger));
 * ```
 *
 * @beta
 */
export function createLogger(coreLogger: ICoreLogger): ILogger {
  return {
    isEnabled: (category, level) => coreLogger.isEnabled(category, getCoreLogLevel(level)),
    logError: (category, msg) => coreLogger.logError(category, msg),
    logWarning: (category, msg) => coreLogger.logWarning(category, msg),
    logInfo: (category, msg) => coreLogger.logInfo(category, msg),
    logTrace: (category, msg) => coreLogger.logTrace(category, msg),
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
