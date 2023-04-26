/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */
/* eslint-disable @itwin/no-internal */

import cluster from "cluster";
import * as path from "path";
import { IModelDb, IModelHost, IModelJsFs, SnapshotDb } from "@itwin/core-backend";
import { IModelStatus, Logger, LogLevel } from "@itwin/core-bentley";
import { BentleyCloudRpcManager, IModelError, IModelReadRpcInterface, RpcConfiguration, SnapshotIModelRpcInterface } from "@itwin/core-common";
import { IModelJsExpressServer } from "@itwin/express-server";
import { HierarchyCacheMode, Presentation } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";

const processCount = process.env.PROCESS_COUNT ? Number.parseInt(process.env.PROCESS_COUNT, 10) : 1;
const shareCaches = !!process.env.SHARE_CACHES;
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3001;

cluster.schedulingPolicy = cluster.SCHED_RR;

if (processCount > 1 && cluster.isPrimary) {
  console.log(`[${process.pid}] Master is running, starting ${processCount} workers...`);
  for (let i = 0; i < processCount; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker) => {
    console.log(`[${process.pid}] Worker ${worker.process.pid} died`);
  });
  console.log(`[${process.pid}] All workers started.`);
} else {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  initBackend();
}

async function initBackend() {
  console.log(`[${process.pid}] Web backend for presentation-load-tests-backend starting...`);

  // initialize logging
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);

  RpcConfiguration.developmentMode = true;

  // initialize IModelHost
  await IModelHost.startup({
    profileName: `presentation-load-tests-backend-${process.pid}`,
  });

  // initialize Presentation backend
  let hierarchyCacheDir = path.join(process.cwd(), "temp", "hierarchy-caches");
  if (!shareCaches) {
    hierarchyCacheDir = path.join(hierarchyCacheDir, process.pid.toString());
  }
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

  // tell BentleyCloudRpcManager which RPC interfaces to handle
  const rpcConfig = BentleyCloudRpcManager.initializeImpl({ info: { title: "presentation-load-tests-backend", version: "v1.0" } }, [
    IModelReadRpcInterface,
    SnapshotIModelRpcInterface,
    PresentationRpcInterface,
  ]);

  // create a basic express web server
  const server = new IModelJsExpressServer(rpcConfig.protocol);
  await server.initialize(port);

  // ensure each worker can open a snapshot without specifically asking that from the frontend
  applySnapshotOpenHack();

  console.log(`[${process.pid}] Web backend for presentation-load-tests-backend listening on port ${port}`);
}

function applySnapshotOpenHack() {
  let isOpeningSnapshot = false;
  const originalFindByKey = IModelDb.tryFindByKey.bind(IModelDb);
  IModelDb.tryFindByKey = (key) => {
    const result = originalFindByKey(key);
    if (isOpeningSnapshot || result) {
      return result;
    }
    return SnapshotDb.openFile(key, { key });
  };

  const originalOpenDgnDb = IModelDb.openDgnDb.bind(IModelDb);
  IModelDb.openDgnDb = (file, openMode, upgradeOptions, props) => {
    isOpeningSnapshot = true;
    try {
      file.key = file.path;
      return originalOpenDgnDb(file, openMode, upgradeOptions, props);
    } catch (e) {
      if (e instanceof IModelError && e.errorNumber === IModelStatus.AlreadyOpen) {
        return IModelDb.findByKey(file.key!).nativeDb;
      }
      throw e;
    } finally {
      isOpeningSnapshot = false;
    }
  };
}
