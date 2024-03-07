/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { IModelHost, IModelJsFs } from "@itwin/core-backend";
import { HierarchyCacheMode, Presentation } from "@itwin/presentation-backend";
import { loadDataSets } from "./Datasets";

async function initBackend() {
  // initialize IModelHost
  await IModelHost.startup({
    profileName: `presentation-load-tests-backend-${process.pid}`,
  });

  // initialize Presentation backend
  let hierarchyCacheDir = path.join(process.cwd(), "temp", "hierarchy-caches");
  IModelJsFs.recursiveMkDirSync(hierarchyCacheDir);

  Presentation.initialize({
    workerThreadsCount: 2,
    caching: {
      hierarchies: {
        mode: HierarchyCacheMode.Disk,
        directory: hierarchyCacheDir,
      },
    },
  });
}

async function shutdownBackend() {
  IModelHost.shutdown();
}

before(async () => {
  await initBackend();
  await loadDataSets("./datasets");
});

after(async () => {
  await shutdownBackend();
});
