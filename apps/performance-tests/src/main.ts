/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import { setLogger } from "@itwin/presentation-hierarchies";
import { LogLevel } from "@itwin/presentation-shared";
import { Datasets } from "./util/Datasets";

before(async () => {
  setLogger({
    isEnabled: (_category: string, level: LogLevel) => {
      return level === "error";
    },
    logError: (category: string, message: string) => console.log(createLogMessage("error", category, message)),
    logWarning: (category: string, message: string) => console.log(createLogMessage("warning", category, message)),
    logInfo: (category: string, message: string) => console.log(createLogMessage("info", category, message)),
    logTrace: (category: string, message: string) => console.log(createLogMessage("trace", category, message)),
  });
  await IModelHost.startup({
    profileName: "presentation-performance-tests",
  });
  await Datasets.initialize("./datasets");
});

after(async () => {
  await IModelHost.shutdown();
});

function createLogMessage(severity: LogLevel, category: string, message: string) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
  return `[${timeStr}] ${severity.toUpperCase().padEnd(7)} | ${category} | ${message}`;
}
