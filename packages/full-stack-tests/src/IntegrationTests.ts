/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import Backend from "i18next-http-backend";
import * as path from "path";
import { Guid, Logger, LogLevel } from "@itwin/core-bentley";
import { IModelApp, IModelAppOptions, NoRenderApp } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { TestBrowserAuthorizationClient, TestUsers, TestUtility } from "@itwin/oidc-signin-tool";
import {
  HierarchyCacheMode, Presentation as PresentationBackend, PresentationBackendNativeLoggerCategory, PresentationProps as PresentationBackendProps,
} from "@itwin/presentation-backend";
import { PresentationProps as PresentationFrontendProps } from "@itwin/presentation-frontend";
import { initialize as initializePresentation, PresentationTestingInitProps, terminate as terminatePresentation } from "@itwin/presentation-testing";

/** Loads the provided `.env` file into process.env */
function loadEnv(envFile: string) {
  if (!fs.existsSync(envFile))
    return;

  const dotenv = require("dotenv"); // eslint-disable-line @typescript-eslint/no-var-requires
  const dotenvExpand = require("dotenv-expand"); // eslint-disable-line @typescript-eslint/no-var-requires
  const envResult = dotenv.config({ path: envFile });
  if (envResult.error) {
    throw envResult.error;
  }

  dotenvExpand(envResult);
}

loadEnv(path.join(__dirname, "..", ".env"));

class IntegrationTestsApp extends NoRenderApp {
  public static override async startup(opts?: IModelAppOptions): Promise<void> {
    await NoRenderApp.startup(opts);
    await IModelApp.localization.changeLanguage("en-PSEUDO");
  }
}

async function initializeCommon(props: { backendTimeout?: number, useClientServices?: boolean  }) {
  // init logging
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel("i18n", LogLevel.Error);
  Logger.setLevel("SQLite", LogLevel.Error);
  Logger.setLevel(PresentationBackendNativeLoggerCategory.ECObjects, LogLevel.Warning);

  const libDir = path.resolve("lib");
  const hierarchiesCacheDir = path.join(libDir, "cache");
  if (!fs.existsSync(hierarchiesCacheDir))
    fs.mkdirSync(hierarchiesCacheDir);

  const backendInitProps: PresentationBackendProps = {
    id: `test-${Guid.createValue()}`,
    requestTimeout: props.backendTimeout ?? 0,
    workerThreadsCount: 1,
    caching: {
      hierarchies: {
        mode: HierarchyCacheMode.Disk,
        directory: hierarchiesCacheDir,
      },
    },
  };
  const frontendInitProps: PresentationFrontendProps = {
    presentation: {
      activeLocale: "en-PSEUDO",
    },
  };

  const frontendAppOptions: IModelAppOptions = {
    authorizationClient: props.useClientServices
      ? TestUtility.getAuthorizationClient(TestUsers.regular)
      : undefined,
    localization: testLocalization,
  };

  if (props.useClientServices)
    await (frontendAppOptions.authorizationClient! as TestBrowserAuthorizationClient).signIn();

  const presentationTestingInitProps: PresentationTestingInitProps = {
    backendProps: backendInitProps,
    backendHostProps: { cacheDir: path.join(__dirname, ".cache") },
    frontendProps: frontendInitProps,
    frontendApp: IntegrationTestsApp,
    frontendAppOptions,
  };

  await initializePresentation(presentationTestingInitProps);
}

export async function initialize(backendTimeout: number = 0) {
  await initializeCommon({ backendTimeout });
}

export async function initializeWithClientServices() {
  await initializeCommon({ useClientServices: true });
}

export async function terminate() {
  await terminatePresentation();
}

export async function resetBackend() {
  const props = PresentationBackend.initProps;
  PresentationBackend.terminate();
  PresentationBackend.initialize(props);
}

const testLocalization = new ITwinLocalization({
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
      const request = new Backend().options.request?.bind(this as void);

      if (url.startsWith(fileProtocol)) {
        try {
          const data = fs.readFileSync(url.replace(fileProtocol, ""), "utf8");
          callback(null, { status: 200, data });
        } catch (error) {
          callback(error, { status: 500, data: "" });
        }
      } else {
        request!(options, url, payload, callback);
      }
    },
  },
});
