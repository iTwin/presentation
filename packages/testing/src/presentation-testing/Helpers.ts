/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Helpers
 */

import { join } from "path";
import * as rimraf from "rimraf";
import { IModelHost, IModelHostOptions } from "@itwin/core-backend";
import { Guid, Logger, LogLevel } from "@itwin/core-bentley";
import { IModelReadRpcInterface, RpcConfiguration, RpcDefaultConfiguration, RpcInterfaceDefinition } from "@itwin/core-common";
import { IModelApp, IModelAppOptions, NoRenderApp } from "@itwin/core-frontend";
import {
  HierarchyCacheMode,
  Presentation as PresentationBackend,
  PresentationBackendNativeLoggerCategory,
  PresentationManagerProps as PresentationBackendProps,
} from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation as PresentationFrontend, PresentationProps as PresentationFrontendProps } from "@itwin/presentation-frontend";
import { getTestOutputDir, setTestOutputDir } from "./FilenameUtils.js";

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
    /* c8 ignore start */
  } catch {
    // this may fail with "Error: RPC interface "xxx" is already initialized." because
    // multiple different tests want to set up rpc interfaces
  }
  /* c8 ignore end */
}

let isInitialized = false;

export { HierarchyCacheMode, PresentationBackendProps };

/** @public */
export interface PresentationTestingInitProps {
  /**
   * RPC interfaces to enable. Defaults to `[IModelReadRpcInterface, PresentationRpcInterface]`.
   *
   * Note: Implementations for these interfaces are **not** automatically registered on the backend - that has to be done manually.
   */
  rpcs?: RpcInterfaceDefinition[];
  /** Properties for backend initialization */
  backendProps?: PresentationBackendProps;
  /** Properties for `IModelHost` */
  backendHostProps?: IModelHostOptions;
  /** Properties for frontend initialization */
  frontendProps?: PresentationFrontendProps;
  /** IModelApp implementation */
  frontendApp?: { startup: (opts?: IModelAppOptions) => Promise<void> };
  /** `IModelApp` options */
  frontendAppOptions?: IModelAppOptions;
  /** Custom test output directory. Defaults to temporary directory provided by the OS. */
  testOutputDir?: string;
}

/**
 * Initialize the framework for presentation testing. The function sets up backend,
 * frontend and RPC communication between them.
 *
 * @see `terminate`
 *
 * @public
 */
export const initialize = async (props?: PresentationTestingInitProps) => {
  if (isInitialized) {
    return;
  }

  if (!props) {
    props = {};
  }

  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel("i18n", LogLevel.Error);
  Logger.setLevel("SQLite", LogLevel.Error);
  Logger.setLevel(PresentationBackendNativeLoggerCategory.ECObjects, LogLevel.Warning);

  // set up rpc interfaces

  initializeRpcInterfaces(props.rpcs ?? [IModelReadRpcInterface, PresentationRpcInterface]);

  // init backend
  // make sure backend gets assigned an id which puts its resources into a unique directory
  props.backendProps = props.backendProps ?? {};
  // eslint-disable-next-line @itwin/no-internal
  if (!props.backendProps.id) {
    props.backendProps.id = `test-${Guid.createValue()}`; // eslint-disable-line @itwin/no-internal
  }
  await IModelHost.startup({
    cacheDir: join(getTestOutputDir(), ".cache", `${process.pid}`),
    ...props.backendHostProps,
  });
  PresentationBackend.initialize(props.backendProps);

  // init frontend
  if (!props.frontendApp) {
    props.frontendApp = NoRenderApp;
  }
  await props.frontendApp.startup(props.frontendAppOptions);
  const defaultFrontendProps: PresentationFrontendProps = {
    presentation: {
      activeLocale: IModelApp.localization.getLanguageList()[0],
    },
  };
  await PresentationFrontend.initialize({ ...defaultFrontendProps, ...props.frontendProps });
  setTestOutputDir(props.testOutputDir);

  isInitialized = true;
};

/**
 * Undoes the setup made by `initialize`.
 * @param frontendApp IModelApp implementation
 *
 * @see `initialize`
 *
 * @public
 */
export const terminate = async (frontendApp = IModelApp) => {
  if (!isInitialized) {
    return;
  }

  // store directory that needs to be cleaned-up
  let hierarchiesCacheDirectory: string | undefined;
  const hierarchiesCacheConfig = PresentationBackend.initProps?.caching?.hierarchies;
  if (hierarchiesCacheConfig?.mode === HierarchyCacheMode.Disk) {
    hierarchiesCacheDirectory = hierarchiesCacheConfig?.directory;
  } else if (hierarchiesCacheConfig?.mode === HierarchyCacheMode.Hybrid) {
    hierarchiesCacheDirectory = hierarchiesCacheConfig?.disk?.directory;
  }

  // terminate backend
  PresentationBackend.terminate();
  await IModelHost.shutdown();
  if (hierarchiesCacheDirectory) {
    rimraf.sync(hierarchiesCacheDirectory);
  }

  // terminate frontend
  PresentationFrontend.terminate();
  await frontendApp.shutdown();

  isInitialized = false;
};

/** @internal */
export function safeDispose(disposable: {} | { [Symbol.dispose]: () => void } | { dispose: () => void }) {
  if ("dispose" in disposable) {
    disposable.dispose();
  } else if (Symbol.dispose in disposable) {
    disposable[Symbol.dispose]();
  }
}
