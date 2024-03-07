/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { IModelHost } from "@itwin/core-backend";
import { loadDataSets } from "./Datasets";

before(async () => {
  await IModelHost.startup({
    profileName: `presentation-performance-tests-${process.pid}`,
  });
  await loadDataSets("./datasets");
});

after(() => {
  IModelHost.shutdown();
});
