/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelHost } from "@itwin/core-backend";
import {
  EmptyLocalization,
  IModelReadRpcInterface,
  RpcConfiguration,
  RpcDefaultConfiguration,
} from "@itwin/core-common";
import { IModelApp, IModelConnection, NoRenderApp } from "@itwin/core-frontend";
import { Presentation as PresentationBackend } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation as PresentationFrontend } from "@itwin/presentation-frontend";

import type { IModelDb } from "@itwin/core-backend";
import type { RpcInterfaceDefinition } from "@itwin/core-common";

/**
 * Configures RPC interfaces the frontend uses to send requests directly to the backend in the same process. Must be
 * called before the backend starts up.
 */
function initializeRpcInterfaces() {
  const interfaces: RpcInterfaceDefinition[] = [IModelReadRpcInterface, PresentationRpcInterface];
  const config = class extends RpcDefaultConfiguration {
    public override interfaces: any = () => interfaces;
  };
  for (const definition of interfaces) {
    // eslint-disable-next-line @itwin/no-internal
    RpcConfiguration.assign(definition, () => config);
  }
  RpcConfiguration.initializeInterfaces(RpcConfiguration.obtain(config));
}

/**
 * Starts the backend and a frontend that sends requests to it directly, in the same process, so that
 * `PresentationPropertyDataProvider` can be used with iModels the backend opens.
 */
export async function startup(): Promise<void> {
  initializeRpcInterfaces();
  await IModelHost.startup({ profileName: "presentation-content-equivalence-tests" });
  PresentationBackend.initialize();
  await NoRenderApp.startup({ localization: new EmptyLocalization() });
  await PresentationFrontend.initialize({ presentation: { activeLocale: "en" } });
}

/** Shuts down everything `startup` started, in reverse order. */
export async function shutdown(): Promise<void> {
  try {
    try {
      PresentationFrontend.terminate();
    } finally {
      await IModelApp.shutdown();
    }
  } finally {
    try {
      PresentationBackend.terminate();
    } finally {
      await IModelHost.shutdown();
    }
  }
}

/** A frontend connection to an iModel the backend in the same process has already opened. Doesn't close it. */
export class InProcessIModelConnection extends IModelConnection {
  readonly #db: IModelDb;

  public constructor(db: IModelDb) {
    // eslint-disable-next-line @itwin/no-internal
    super(db.getConnectionProps());
    this.#db = db;
    IModelConnection.onOpen.raiseEvent(this);
  }

  public override get isClosed(): boolean {
    // eslint-disable-next-line @itwin/no-internal
    return !this.#db.isOpen;
  }

  public override async close(): Promise<void> {
    this.onClose.raiseEvent(this);
    IModelConnection.onClose.raiseEvent(this);
  }
}
