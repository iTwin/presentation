/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UiFramework } from "@itwin/appui-react";
import { Logger, LogLevel, ProcessDetector } from "@itwin/core-bentley";
import { BentleyCloudRpcManager } from "@itwin/core-common";
import { ElectronApp } from "@itwin/core-electron/lib/cjs/ElectronFrontend";
import { IModelApp, IModelAppOptions, IModelConnection } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
// Need this because of https://github.com/microsoft/TypeScript/issues/60556
import "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_START__ Presentation.Frontend.Imports
import { createFavoritePropertiesStorage, DefaultFavoritePropertiesStorageTypes, Presentation } from "@itwin/presentation-frontend";
// __PUBLISH_EXTRACT_END__
import { rpcInterfaces } from "@test-app/common";
import { MyAppFrontend } from "./api/MyAppFrontend";
import { App } from "./components/app/App";

// initialize logging
Logger.initializeToConsole();
Logger.setLevelDefault(LogLevel.Warning);

async function initializeApp() {
  const iModelAppOpts: IModelAppOptions = {
    localization: new ITwinLocalization({
      initOptions: { lng: "en" },
    }),
  };

  if (ProcessDetector.isElectronAppFrontend) {
    await ElectronApp.startup({
      iModelApp: {
        ...iModelAppOpts,
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
  const readyPromises = new Array<Promise<void>>();

  const namespacePromise = IModelApp.localization.registerNamespace("Sample");
  if (namespacePromise !== undefined) {
    readyPromises.push(namespacePromise);
  }

  readyPromises.push(initializePresentation());
  readyPromises.push(UiFramework.initialize());
  readyPromises.push(IModelApp.quantityFormatter.setActiveUnitSystem("metric"));
  await Promise.all(readyPromises);
}

async function initializePresentation() {
  // __PUBLISH_EXTRACT_START__ Presentation.Frontend.Initialization
  await Presentation.initialize({
    presentation: {
      // specify locale for localizing presentation data, it can be changed afterwards
      activeLocale: IModelApp.localization.getLanguageList()[0],
      schemaContextProvider: (imodel) => MyAppFrontend.getSchemaContext(imodel),
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

  // __PUBLISH_EXTRACT_START__ Presentation.Frontend.SetSelectionScope
  Presentation.selection.scopes.activeScope = "top-assembly";
  // __PUBLISH_EXTRACT_END__

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
