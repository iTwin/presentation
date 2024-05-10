/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import { setLogger } from "@itwin/presentation-hierarchies";
import { Datasets } from "./util/Datasets";
import { LOGGER } from "./util/Logging";

before(async () => {
  setLogger(LOGGER);
  await IModelHost.startup({
    profileName: "presentation-performance-tests",
  });
  await Datasets.initialize("./datasets");
});

after(async () => {
  await IModelHost.shutdown();
});
