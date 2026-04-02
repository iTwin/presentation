/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Defines a type for a logging function.
 * @public
 */
export type LogFunction = (category: string, message: string) => void;

/**
 * Defines logging severities.
 * @public
 */
export type LogLevel = "error" | "warning" | "info" | "trace";

/**
 * An interface for a logger used by presentation packages.
 * @public
 */
export interface ILogger {
  isEnabled: (category: string, level: LogLevel) => boolean;
  logError: LogFunction;
  logWarning: LogFunction;
  logInfo: LogFunction;
  logTrace: LogFunction;
}

/**
 * A logger implementation that does nothing.
 * @public
 */
/* c8 ignore next 7 */
export const NOOP_LOGGER: ILogger = {
  isEnabled: () => false,
  logError: () => {},
  logWarning: () => {},
  logInfo: () => {},
  logTrace: () => {},
};
