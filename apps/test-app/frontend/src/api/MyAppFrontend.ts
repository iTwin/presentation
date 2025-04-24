/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { Guid, Id64Arg, Logger, OpenMode } from "@itwin/core-bentley";
import { ElementProps, IModelConnectionProps, IModelError, ViewQueryParams } from "@itwin/core-common";
import { BriefcaseConnection, IpcApp, SnapshotConnection } from "@itwin/core-frontend";
import { UnitSystemKey } from "@itwin/core-quantity";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.PerformanceTuning.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
// __PUBLISH_EXTRACT_END__
import { createStorage } from "@itwin/unified-selection";
import { PRESENTATION_TEST_APP_IPC_CHANNEL_NAME, SampleIpcInterface, SampleRpcInterface } from "@test-app/common";

const LOCAL_STORAGE_KEY_AppSettings = "presentation-test-app/settings";

export interface MyAppSettings {
  imodelPath?: string;
  rulesetId?: string;
  unitSystem?: UnitSystemKey;
  persistSettings: boolean;
}

export class MyAppFrontend {
  private static _ipcProxy = IpcApp.makeIpcProxy<SampleIpcInterface>(PRESENTATION_TEST_APP_IPC_CHANNEL_NAME);
  private static _selectionStorage = createStorage();

  public static async getSampleImodels(): Promise<string[]> {
    return SampleRpcInterface.getClient().getSampleImodels();
  }

  public static async getAvailableRulesets(): Promise<string[]> {
    return SampleRpcInterface.getClient().getAvailableRulesets();
  }

  public static async openIModel(path: string): Promise<IModelConnection | undefined> {
    let imodel: IModelConnection | undefined;
    if (IpcApp.isValid) {
      Logger.logInfo("presentation", `Trying to open standalone ${path}`);
      imodel = await tryOpenStandalone(path);
    }

    if (!imodel) {
      Logger.logInfo("presentation", `Opening snapshot: ${path}`);
      imodel = IpcApp.isValid ? await SnapshotConnection.openFile(path) : await this.openLocalImodel(path);
      Logger.logInfo("presentation", `Opened snapshot: ${imodel.name}`);
    }

    return imodel;
  }

  public static get selectionStorage() {return this._selectionStorage;}

  public static get settings(): MyAppSettings {
    let strValue = window.localStorage.getItem(LOCAL_STORAGE_KEY_AppSettings);
    if (!strValue) {
      strValue = JSON.stringify({ persist: false });
      window.localStorage.setItem(LOCAL_STORAGE_KEY_AppSettings, strValue);
    }
    return JSON.parse(strValue);
  }

  public static set settings(value: MyAppSettings) {
    window.localStorage.setItem(LOCAL_STORAGE_KEY_AppSettings, JSON.stringify(value));
  }

  public static getClientId(): string {
    /*
    note: generally we'd want to reuse client id between windows and tabs for the same frontend user,
    but for specific case of presentation-test-app it's more suitable to always generate a new client
    id - that makes sure we get a new backend instance with each page refresh and helps for debugging.

    const key = "presentation-test-app/client-id";
    let value = window.localStorage.getItem(key);
    if (!value) {
      value = Guid.createValue();
      window.localStorage.setItem(key, value);
    }
    return value;
    */
    return Guid.createValue();
  }

  public static async getViewDefinitions(imodel: IModelConnection) {
    const viewQueryParams: ViewQueryParams = { wantPrivate: false };
    const viewSpecs = await imodel.views.queryProps(viewQueryParams);
    return viewSpecs
      .filter((spec) => !spec.isPrivate)
      .map((spec) => ({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        id: spec.id!,
        class: spec.classFullName,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        label: spec.userLabel ?? spec.code.value!,
      }));
  }

  public static async updateElement(imodel: IModelConnection, newProps: ElementProps) {
    if (!IpcApp.isValid) {
      throw new Error(`Updating element only supported in 'IpcApp'`);
    }
    return this._ipcProxy.updateElement(imodel.key, newProps);
  }

  public static async deleteElements(imodel: IModelConnection, elementIds: Id64Arg) {
    if (!IpcApp.isValid) {
      throw new Error(`Deleting elements only supported in 'IpcApp'`);
    }
    return this._ipcProxy.deleteElements(imodel.key, elementIds);
  }

  public static getSchemaContext(imodel: IModelConnection) {
    return getSchemaContext(imodel);
  }

  private static async openLocalImodel(path: string) {
    const connectionsProps = await SampleRpcInterface.getClient().getConnectionProps(path);
    const close = async () => {
      await SampleRpcInterface.getClient().closeConnection(path);
    }
    const imodel = new LocalIModelConnection(connectionsProps, close);
    return imodel;
  }
}

// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.PerformanceTuning.CachingSchemaContexts
const schemaContextsCache = new Map<string, SchemaContext>();
function getSchemaContext(imodel: IModelConnection) {
  const context = schemaContextsCache.get(imodel.key);
  if (context) {
    return context;
  }

  const newContext = new SchemaContext();
  newContext.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  schemaContextsCache.set(imodel.key, newContext);

  imodel.onClose.addListener(() => schemaContextsCache.delete(imodel.key));

  return newContext;
}
// __PUBLISH_EXTRACT_END__

async function tryOpenStandalone(path: string) {
  let iModel: IModelConnection | undefined;
  try {
    iModel = await BriefcaseConnection.openStandalone(path, OpenMode.ReadWrite);
    Logger.logInfo("presentation", `Opened standalone: ${iModel.name}`);
  } catch (err: any) {
    if (err instanceof IModelError) {
      Logger.logError("presentation", `Failed to open standalone: ${err.message}`, () => err.getMetaData());
    } else {
      Logger.logError("presentation", `Failed to open standalone.`);
    }
  }
  return iModel;
}

class LocalIModelConnection extends IModelConnection {
  private _isClosed = false;
  constructor(connectionsProps: IModelConnectionProps, private _close: () => Promise<void>) {
    // eslint-disable-next-line @itwin/no-internal
    super(connectionsProps);
  }

  public override get isClosed(): boolean { return this._isClosed }

  public override async close(): Promise<void> {
    this._isClosed = true;
    await this._close();
  }
}
