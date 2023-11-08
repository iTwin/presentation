/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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

/** A logger implementation does nothing. */
// istanbul ignore next
const NOOP_LOGGER: ILogger = {
  logError: () => {},
  logWarning: () => {},
  logInfo: () => {},
  logTrace: () => {},
};

// eslint-disable-next-line @typescript-eslint/naming-convention
let g_logger: ILogger = NOOP_LOGGER;

/**
 * Set logger to use by this package. By default the package uses a no-op logger.
 * @beta
 */
export function setLogger(logger: ILogger | undefined) {
  g_logger = logger ?? /* istanbul ignore next */ NOOP_LOGGER;
}

/**
 * Get logger used by this package.
 * @see [[setLogger]]
 * @beta
 */
export function getLogger(): ILogger {
  return g_logger;
}
