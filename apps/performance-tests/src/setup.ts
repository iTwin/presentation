/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll } from "vitest";
import { IModelHost } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { setLogger } from "@itwin/presentation-hierarchies";
import { Datasets } from "./util/Datasets.js";
import { LOGGER } from "./util/Logging.js";

beforeAll(async () => {
  setLogger(LOGGER);

  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel("i18n", LogLevel.Error);
  Logger.setLevel("SQLite", LogLevel.Error);

  await IModelHost.startup({
    profileName: "presentation-performance-tests",
  });
  await Datasets.initialize("./datasets");
}, 60000);

afterAll(async () => {
  await IModelHost.shutdown();
});
