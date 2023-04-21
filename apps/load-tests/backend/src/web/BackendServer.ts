/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import { BentleyCloudRpcManager, RpcConfiguration, RpcInterfaceDefinition } from "@itwin/core-common";
import { IModelJsExpressServer } from "@itwin/express-server";

/**
 * Initializes Web Server backend
 */
export default async function initialize(port: number, rpcInterfaces: RpcInterfaceDefinition[]) {
  RpcConfiguration.developmentMode = true; // eslint-disable-line @itwin/no-internal

  // initialize IModelHost
  await IModelHost.startup();

  // tell BentleyCloudRpcManager which RPC interfaces to handle
  const rpcConfig = BentleyCloudRpcManager.initializeImpl({ info: { title: "presentation-load-tests-backend", version: "v1.0" } }, rpcInterfaces); // eslint-disable-line @itwin/no-internal

  // create a basic express web server
  const server = new IModelJsExpressServer(rpcConfig.protocol); // eslint-disable-line @itwin/no-internal
  await server.initialize(port);

  /* eslint-disable no-console */
  console.log(`Web backend for presentation-test-app listening on port ${port}`);
}
