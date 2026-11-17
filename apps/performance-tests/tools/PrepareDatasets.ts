/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import { Datasets } from "../src/util/Datasets.js";

await IModelHost.startup({ profileName: "presentation-performance-tests" });
try {
  await Datasets.initialize({ datasetsDirPath: "./datasets" });
} finally {
  await IModelHost.shutdown();
}
