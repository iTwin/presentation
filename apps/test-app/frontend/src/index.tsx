/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./index.css";
import { StrictMode } from "react";
import { render } from "react-dom";
import { UiComponents } from "@itwin/components-react";
import { Logger, LogLevel, ProcessDetector } from "@itwin/core-bentley";
import { BentleyCloudRpcManager } from "@itwin/core-common";
import { ElectronApp } from "@itwin/core-electron/lib/cjs/ElectronFrontend";
import { IModelApp, IModelAppOptions } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
// __PUBLISH_EXTRACT_START__ Presentation.Frontend.Imports
import { createFavoritePropertiesStorage, DefaultFavoritePropertiesStorageTypes, Presentation } from "@itwin/presentation-frontend";
// __PUBLISH_EXTRACT_END__
import { rpcInterfaces } from "@test-app/common";
import App from "./components/app/App";

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
  readyPromises.push(UiComponents.initialize(IModelApp.localization));
  await Promise.all(readyPromises);
}

async function initializePresentation() {
  // __PUBLISH_EXTRACT_START__ Presentation.Frontend.Initialization
  await Presentation.initialize({
    presentation: {
      // specify locale for localizing presentation data, it can be changed afterwards
      activeLocale: IModelApp.localization.getLanguageList()[0],

      // specify the preferred unit system
      activeUnitSystem: "metric",
    },
    favorites: {
      storage: createFavoritePropertiesStorage(DefaultFavoritePropertiesStorageTypes.UserPreferencesStorage),
    },
  });
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ Presentation.Frontend.SetSelectionScope
  Presentation.selection.scopes.activeScope = "top-assembly";
  // __PUBLISH_EXTRACT_END__
}

void (async () => {
  await initializeApp();

  const rootElement = document.getElementById("root");
  render(
    <StrictMode>
      <App />
    </StrictMode>,
    rootElement,
  );
})();
