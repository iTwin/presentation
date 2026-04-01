/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import Backend from "i18next-http-backend";
import * as path from "path";
import { IModelHost } from "@itwin/core-backend";
import { Guid, Logger, LogLevel } from "@itwin/core-bentley";
import { IModelReadRpcInterface, RpcConfiguration, RpcDefaultConfiguration, RpcInterfaceDefinition } from "@itwin/core-common";
import { IModelApp, IModelAppOptions, NoRenderApp } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { HierarchyCacheMode, Presentation as PresentationBackend, PresentationBackendNativeLoggerCategory } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation as PresentationFrontend, PresentationProps as PresentationFrontendProps } from "@itwin/presentation-frontend";
import { setTestOutputDir } from "./FilenameUtils.js";

class IntegrationTestsApp extends NoRenderApp {
  public static override async startup(opts?: IModelAppOptions): Promise<void> {
    await NoRenderApp.startup(opts);
    await IModelApp.localization.changeLanguage("en-PSEUDO");
  }
}

function initializeRpcInterfaces(interfaces: RpcInterfaceDefinition[]) {
  const config = class extends RpcDefaultConfiguration {
    public override interfaces: any = () => interfaces;
  };

  for (const definition of interfaces) {
    // eslint-disable-next-line @itwin/no-internal
    RpcConfiguration.assign(definition, () => config);
  }

  const instance = RpcConfiguration.obtain(config);

  try {
    RpcConfiguration.initializeInterfaces(instance);
  } catch {
    // this may fail with "Error: RPC interface "xxx" is already initialized." because
    // multiple different tests want to set up rpc interfaces
  }
}

let isInitialized = false;

export async function initialize(props?: { backendTimeout?: number }) {
  if (isInitialized) {
    return;
  }

  // init logging
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel("i18n", LogLevel.Error);
  Logger.setLevel("SQLite", LogLevel.Error);
  Logger.setLevel(PresentationBackendNativeLoggerCategory.ECObjects, LogLevel.Warning);

  const backendInitProps = {
    id: `test-${Guid.createValue()}`,
    requestTimeout: props?.backendTimeout ?? 0,
    workerThreadsCount: 1,
    caching: {
      hierarchies: {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        mode: HierarchyCacheMode.Memory,
      },
    },
  };
  const frontendInitProps: PresentationFrontendProps = {
    presentation: {
      activeLocale: "en-PSEUDO",
    },
  };

  const frontendAppOptions: IModelAppOptions = {
    localization: createTestLocalization(),
  };

  // set up rpc interfaces
  initializeRpcInterfaces([IModelReadRpcInterface, PresentationRpcInterface, ECSchemaRpcInterface]);

  // init backend
  await IModelHost.startup({
    cacheDir: path.join(import.meta.dirname, "..", "build", ".cache", `${process.pid}`),
  });
  PresentationBackend.initialize(backendInitProps);

  // init frontend
  await IntegrationTestsApp.startup(frontendAppOptions);
  await PresentationFrontend.initialize(frontendInitProps);
  setTestOutputDir(undefined);

  // eslint-disable-next-line @itwin/no-internal
  ECSchemaRpcImpl.register();

  isInitialized = true;
}

export async function terminate() {
  if (!isInitialized) {
    return;
  }

  PresentationBackend.terminate();
  await IModelHost.shutdown();

  PresentationFrontend.terminate();
  await IModelApp.shutdown();

  isInitialized = false;
}

export async function resetBackend() {
  const props = PresentationBackend.initProps;
  PresentationBackend.terminate();
  PresentationBackend.initialize(props);
}

function createTestLocalization(): ITwinLocalization {
  return new ITwinLocalization({
    urlTemplate: `file://${path.join(path.resolve("build/public/locales"), "{{lng}}/{{ns}}.json").replace(/\\/g, "/")}`,
    initOptions: {
      preload: ["test"],
    },
    backendHttpOptions: {
      request: (options, url, payload, callback) => {
        /**
         * A few reasons why we need to modify this request fn:
         * - The above urlTemplate uses the file:// protocol
         * - Node v18's fetch implementation does not support file://
         * - i18n-http-backend uses fetch if it defined globally
         */
        const fileProtocol = "file://";

        if (url.startsWith(fileProtocol)) {
          try {
            const data = fs.readFileSync(url.replace(fileProtocol, ""), "utf8");
            callback(null, { status: 200, data });
          } catch (error) {
            callback(error, { status: 500, data: "" });
          }
        } else {
          // TODO: remove the type assertion when we drop support for itwinjs-core 4.x. It's
          // currently needed for 4.x regression tests to pass, because in 4.x `resp` is nullable.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          new Backend().options.request!(options, url, payload, (err, resp) => callback(err, resp!));
        }
      },
    },
  });
}
