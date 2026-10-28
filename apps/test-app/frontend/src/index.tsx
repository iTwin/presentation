/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./index.css";
// Need this because of https://github.com/microsoft/TypeScript/issues/60556
import "@itwin/presentation-shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UiFramework } from "@itwin/appui-react";
import { Logger, LogLevel, ProcessDetector } from "@itwin/core-bentley";
import { BentleyCloudRpcManager } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
// __PUBLISH_EXTRACT_START__ Presentation.Frontend.Imports
import {
  createFavoritePropertiesStorage,
  DefaultFavoritePropertiesStorageTypes,
  Presentation,
} from "@itwin/presentation-frontend";
// __PUBLISH_EXTRACT_END__
import { LOCALIZATION_NAMESPACES } from "@itwin/presentation-hierarchies-react";
import { rpcInterfaces } from "@test-app/common";
import { MyAppFrontend } from "./frontendApi/MyAppFrontend";
import { App } from "./components/app/App";

import type { IModelAppOptions } from "@itwin/core-frontend";

// initialize logging
Logger.initializeToConsole();
Logger.setLevelDefault(LogLevel.Warning);

async function initializeApp() {
  const iModelAppOpts: IModelAppOptions = { localization: new ITwinLocalization({ initOptions: { lng: "en" } }) };

  if (isElectronAppFrontend()) {
    const { ElectronApp } = await import("@itwin/core-electron/lib/cjs/ElectronFrontend");
    await ElectronApp.startup({
      iModelApp: {
        ...iModelAppOpts,
        // oxlint-disable-next-line @typescript-eslint/no-deprecated
        rpcInterfaces, // docs say we shouldn't use this but the alternative doesn't work...
      },
    });
  } else if (ProcessDetector.isBrowserProcess) {
    // __PUBLISH_EXTRACT_START__ Presentation.Frontend.IModelAppStartup
    await IModelApp.startup(iModelAppOpts);
    // __PUBLISH_EXTRACT_END__
    const rpcParams = { info: { title: "presentation-test-app", version: "v1.0" }, uriPrefix: "http://localhost:3001" };
    // __PUBLISH_EXTRACT_START__ Presentation.Frontend.RpcInterface.Options
    BentleyCloudRpcManager.initializeClient(rpcParams, rpcInterfaces);
    // __PUBLISH_EXTRACT_END__
  }
  await Promise.all([
    IModelApp.localization.registerNamespace("Sample"),
    ...LOCALIZATION_NAMESPACES.map(async (namespace) => IModelApp.localization.registerNamespace(namespace)),
    initializePresentation(),
    UiFramework.initialize(),
    IModelApp.quantityFormatter.setActiveUnitSystem("metric"),
  ]);
}

/**
 * Whether the app runs as the frontend of its Electron app. Browsers built on Electron (e.g. the VS Code integrated
 * browser) also report "Electron" in their user agent, so check for the API exposed by the app's preload script too.
 */
function isElectronAppFrontend() {
  return ProcessDetector.isElectronAppFrontend && "itwinjs" in window;
}

async function initializePresentation() {
  /* oxlint-disable @typescript-eslint/no-deprecated */
  // __PUBLISH_EXTRACT_START__ Presentation.Frontend.Initialization
  await Presentation.initialize({
    presentation: {
      // specify locale for localizing presentation data, it can be changed afterwards
      activeLocale: IModelApp.localization.getLanguageList()[0],
    },
    favorites: {
      storage: createFavoritePropertiesStorage(DefaultFavoritePropertiesStorageTypes.UserPreferencesStorage),
    },
    selection: {
      // tell @itwin/presentation-frontend to use our selection storage - this enables interop with
      // unified selection storage used in this app
      selectionStorage: MyAppFrontend.selectionStorage,
    },
  });
  // __PUBLISH_EXTRACT_END__
  /* oxlint-enable @typescript-eslint/no-deprecated */

  // clear selection storage when iModel is closed
  IModelConnection.onClose.addListener((imodel) => {
    MyAppFrontend.selectionStorage.clearStorage({ imodelKey: imodel.key });
  });
}

void (async () => {
  await initializeApp();

  const root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
