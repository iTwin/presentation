/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { spawn } from "child_process";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { IModelReadRpcInterface, IModelTileRpcInterface, SnapshotIModelRpcInterface } from "@itwin/core-common";
import { Presentation } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";

if (process.env.PROCESS_COUNT) {
  const processCount = Number.parseInt(process.env.PROCESS_COUNT, 10) ?? 1;
  void (async () => {
    const processes = [];
    for (let i = 0; i < processCount; ++i) {
      processes.push(spawn("node", [__filename], { env: { ["PORT"]: (3000 + i + 1).toString() } }));
    }
  })();
} else if (process.env.PORT) {
  const port = Number.parseInt(process.env.PORT, 10);
  void (async () => {
    // initialize logging
    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Warning);

    // initialize IModelHost
    const init = (await import("./web/BackendServer")).default;
    await init(port, [IModelReadRpcInterface, IModelTileRpcInterface, SnapshotIModelRpcInterface, PresentationRpcInterface]);

    // initialize presentation backend
    Presentation.initialize({
      workerThreadsCount: 2,
    });

    console.log(`Process ID: ${process.pid}`);
  })();
} else {
  console.error(`Environment should contain either "PROCESS_COUNT" or "PORT"`);
}
