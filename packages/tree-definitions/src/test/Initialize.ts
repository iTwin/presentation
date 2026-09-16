/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import { IModelReadRpcInterface, RpcConfiguration, RpcDefaultConfiguration } from "@itwin/core-common";
import { IModelApp, NoRenderApp } from "@itwin/core-frontend";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { Presentation as PresentationBackend } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation as PresentationFrontend } from "@itwin/presentation-frontend";

import type { RpcInterfaceDefinition } from "@itwin/core-common";
import type { PresentationManagerProps } from "@itwin/presentation-backend";

// eslint-disable-next-line @typescript-eslint/no-deprecated
export { HierarchyCacheMode } from "@itwin/presentation-backend";

export async function initializeCore(props?: {
  rpcs?: RpcInterfaceDefinition[];
  backendProps?: PresentationManagerProps;
}) {
  await IModelHost.startup({ cacheDir: `./lib/test/output/${process.pid}/`, profileName: "tree-definitions-tests" });
  initializeRpcInterfaces(props?.rpcs ?? [IModelReadRpcInterface, ECSchemaRpcInterface, PresentationRpcInterface]);
  PresentationBackend.initialize(props?.backendProps);
  await NoRenderApp.startup();
  await PresentationFrontend.initialize();
}

export async function terminateCore() {
  PresentationFrontend.terminate();
  await IModelApp.shutdown();
  PresentationBackend.terminate();
  await IModelHost.shutdown();
}

export async function initializeITwinJs() {
  await initializeCore();
  // eslint-disable-next-line @itwin/no-internal
  ECSchemaRpcImpl.register();
}

export async function terminateITwinJs() {
  await terminateCore();
}

function initializeRpcInterfaces(interfaces: RpcInterfaceDefinition[]) {
  const config = class extends RpcDefaultConfiguration {
    public override interfaces: any = () => interfaces;
  };

  for (const definition of interfaces) {
    // eslint-disable-next-line @itwin/no-internal
    RpcConfiguration.assign(definition, /* istanbul ignore next */ () => config);
  }

  const instance = RpcConfiguration.obtain(config);

  try {
    RpcConfiguration.initializeInterfaces(instance);
  } catch {
    // this may fail with "Error: RPC interface "xxx" is already initialized." because
    // multiple different tests want to set up rpc interfaces
  }
}
