/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import Backend from "i18next-http-backend";
import * as path from "path";
import { Guid, Logger, LogLevel } from "@itwin/core-bentley";
import { IModelReadRpcInterface, SnapshotIModelRpcInterface } from "@itwin/core-common";
import { IModelApp, IModelAppOptions, NoRenderApp } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import {
  HierarchyCacheMode,
  Presentation as PresentationBackend,
  PresentationBackendNativeLoggerCategory,
  PresentationProps as PresentationBackendProps,
} from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { PresentationProps as PresentationFrontendProps } from "@itwin/presentation-frontend";
import { initialize as initializePresentation, PresentationTestingInitProps, terminate as terminatePresentation } from "@itwin/presentation-testing";

class IntegrationTestsApp extends NoRenderApp {
  public static override async startup(opts?: IModelAppOptions): Promise<void> {
    await NoRenderApp.startup(opts);
    await IModelApp.localization.changeLanguage("en-PSEUDO");
  }
}

export async function initialize(props?: { backendTimeout?: number }) {
  // init logging
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel("i18n", LogLevel.Error);
  Logger.setLevel("SQLite", LogLevel.Error);
  Logger.setLevel(PresentationBackendNativeLoggerCategory.ECObjects, LogLevel.Warning);

  const backendInitProps: PresentationBackendProps = {
    id: `test-${Guid.createValue()}`,
    requestTimeout: props?.backendTimeout ?? 0,
    workerThreadsCount: 1,
    caching: {
      hierarchies: {
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

  const presentationTestingInitProps: PresentationTestingInitProps = {
    rpcs: [SnapshotIModelRpcInterface, IModelReadRpcInterface, PresentationRpcInterface, ECSchemaRpcInterface],
    backendProps: backendInitProps,
    backendHostProps: { cacheDir: path.join(import.meta.dirname, ".cache", `${process.pid}`) },
    frontendProps: frontendInitProps,
    frontendApp: IntegrationTestsApp,
    frontendAppOptions,
  };

  await initializePresentation(presentationTestingInitProps);

  // eslint-disable-next-line @itwin/no-internal
  ECSchemaRpcImpl.register();
}

export async function terminate() {
  await terminatePresentation();
}

export async function resetBackend() {
  const props = PresentationBackend.initProps;
  PresentationBackend.terminate();
  PresentationBackend.initialize(props);
}

function createTestLocalization(): ITwinLocalization {
  return new ITwinLocalization({
    urlTemplate: `file://${path.join(path.resolve("lib/public/locales"), "{{lng}}/{{ns}}.json").replace(/\\/g, "/")}`,
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
          new Backend().options.request!(options, url, payload, callback);
        }
      },
    },
  });
}
