/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ElectronHost } from "@itwin/core-electron/lib/cjs/ElectronBackend.js";
import { SampleIpcHandler } from "../SampleIpcHandler.js";

import type { IModelHostOptions } from "@itwin/core-backend";
import type { RpcInterfaceDefinition } from "@itwin/core-common";
import type { ElectronHostOptions } from "@itwin/core-electron/lib/cjs/ElectronBackend.js";

/**
 * Initializes Electron backend
 */
export async function initialize(rpcInterfaces: RpcInterfaceDefinition[]) {
  // __PUBLISH_EXTRACT_START__ Presentation.Backend.Electron.RpcInterface

  const electronHost: ElectronHostOptions = {
    rpcInterfaces,
    developmentServer: process.env.NODE_ENV === "development",
    ipcHandlers: [SampleIpcHandler],
  };
  const iModelHost: IModelHostOptions = {};

  await ElectronHost.startup({ electronHost, iModelHost });
  await ElectronHost.openMainWindow();

  // __PUBLISH_EXTRACT_END__
}
