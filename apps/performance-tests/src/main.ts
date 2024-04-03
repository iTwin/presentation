/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { createLogger } from "@itwin/presentation-core-interop";
import { setLogger } from "@itwin/presentation-hierarchies";
import { Datasets } from "./util/Datasets";

before(async () => {
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Error);
  setLogger(createLogger(Logger));
  await IModelHost.startup({
    profileName: "presentation-performance-tests",
  });
  await Datasets.initialize("./datasets");
});

after(async () => {
  await IModelHost.shutdown();
});
