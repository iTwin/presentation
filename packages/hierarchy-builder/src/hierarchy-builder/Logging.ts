/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

/** @beta */
export type LogFunction = (category: string, message: string) => void;

/**
 * An interface for a logger used by this package.
 * @beta
 */
export interface ILogger {
  logError: LogFunction;
  logWarning: LogFunction;
  logInfo: LogFunction;
  logTrace: LogFunction;
}

/** A logger implementation that simply outputs all logs to console. */
const CONSOLE_LOGGER: ILogger = {
  logError: (cat, msg) => console.error(`[${cat}] ${msg}`),
  logWarning: (cat, msg) => console.warn(`[${cat}] ${msg}`),
  logInfo: (cat, msg) => console.info(`[${cat}] ${msg}`),
  logTrace: (cat, msg) => console.log(`[${cat}] ${msg}`),
};

// eslint-disable-next-line @typescript-eslint/naming-convention
let g_logger: ILogger = CONSOLE_LOGGER;

/**
 * Set logger to use in this package. By default the package uses console logger.
 * @beta
 */
export function setLogger(logger: ILogger | undefined) {
  g_logger = logger ?? CONSOLE_LOGGER;
}

/**
 * Get logger used by this package.
 * @see [[setLogger]]
 * @beta
 */
export function getLogger(): ILogger {
  return g_logger;
}
