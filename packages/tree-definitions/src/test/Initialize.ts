/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import { RpcManager } from "@itwin/core-common";
import { IModelApp, NoRenderApp } from "@itwin/core-frontend";
import { Presentation as PresentationBackend } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation as PresentationFrontend } from "@itwin/presentation-frontend";

export async function initializeITwinJs() {
  // Initialize the native backend runtime required to create test databases and execute ECSQL queries.
  await IModelHost.startup({ cacheDir: `./lib/test/output/${process.pid}/`, profileName: "tree-definitions-tests" });
  // The filter builder uses Presentation content descriptors to determine filterable properties.
  // Enable in-process RPC so hierarchy-level filtering tests can request those descriptors.
  RpcManager.initializeInterface(PresentationRpcInterface);
  // Register the backend implementation of Presentation requests.
  PresentationBackend.initialize();
  // Start frontend services without rendering, before initializing Presentation.
  await NoRenderApp.startup();
  // Provide Presentation.presentation for content-descriptor requests.
  await PresentationFrontend.initialize();
}

export async function terminateITwinJs() {
  PresentationFrontend.terminate();
  await IModelApp.shutdown();
  await IModelHost.shutdown();
}
