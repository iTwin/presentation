/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { tap } from "rxjs";
import { getLogger, ILogger, LogLevel } from "../Logging";
import { ECSqlQueryDef } from "../queries/ECSqlCore";
import { trimWhitespace } from "../Utils";

/** @internal */
export interface LogMessageProps<TMessageArg = void> {
  category: string;
  severity?: LogLevel;
  message: (arg: TMessageArg) => string;
}

/** @internal */
export function doLog(props: LogMessageProps) {
  const logger = getLogger();
  const severity = props.severity ?? "trace";
  if (!logger.isEnabled(props.category, severity)) {
    return;
  }
  const logFunc = getLogFunc(logger, severity);
  logFunc(props.category, props.message());
}

function getLogFunc(logger: ILogger, severity: LogLevel) {
  switch (severity) {
    case "error":
      return logger.logError.bind(logger);
    case "warning":
      return logger.logWarning.bind(logger);
    case "info":
      return logger.logInfo.bind(logger);
    case "trace":
      return logger.logTrace.bind(logger);
  }
}

/** @internal */
export function log<TMessageArg>(props: LogMessageProps<TMessageArg>) {
  return tap<TMessageArg>((n) => doLog({ ...props, message: () => props.message(n) }));
}

/** @internal */
// istanbul ignore next
export function createQueryLogMessage(query: ECSqlQueryDef): string {
  const ctes = query.ctes?.map((cte) => `    ${trimWhitespace(cte)}`).join(", \n");
  const bindings = query.bindings?.map((b) => JSON.stringify(b.value)).join(", ");
  let output = "{\n";
  if (ctes) {
    output += `  ctes: [ \n${ctes} \n], \n`;
  }
  output += `  ecsql: ${trimWhitespace(query.ecsql)}, \n`;
  if (bindings) {
    output += `  bindings: [${bindings}], \n`;
  }
  output += "}";
  return output;
}
