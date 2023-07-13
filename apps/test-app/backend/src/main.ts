/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./SampleRpcImpl"; // just to get the RPC implementation registered
import { app as electron } from "electron";
import * as path from "path";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { RpcInterfaceDefinition } from "@itwin/core-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
// __PUBLISH_EXTRACT_START__ Presentation.Backend.Initialization.Imports
import { Presentation, PresentationProps } from "@itwin/presentation-backend";
// __PUBLISH_EXTRACT_END__
// eslint-disable-next-line no-duplicate-imports
import { PresentationBackendLoggerCategory, PresentationBackendNativeLoggerCategory } from "@itwin/presentation-backend";
// __PUBLISH_EXTRACT_START__ Presentation.Backend.Initialization.OpenTelemetry.Imports
import { exportDiagnostics } from "@itwin/presentation-opentelemetry";
import { context } from "@opentelemetry/api";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Backend.Initialization.OpenTelemetry.SdkImports
import { Resource } from "@opentelemetry/resources";
import * as opentelemetry from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
// __PUBLISH_EXTRACT_END__
import { rpcInterfaces } from "@test-app/common";

void (async () => {
  // initialize logging
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel(PresentationBackendNativeLoggerCategory.ECObjects, LogLevel.Warning);
  Logger.setLevel(PresentationBackendNativeLoggerCategory.ECPresentation, LogLevel.Info);
  Logger.setLevel(PresentationBackendLoggerCategory.Package, LogLevel.Info);

  // get platform-specific initialization function
  let init: (_rpcs: RpcInterfaceDefinition[]) => void;
  if (electron) {
    init = (await import("./electron/ElectronMain")).default;
  } else {
    init = (await import("./web/BackendServer")).default;
  }
  // do initialize
  init(rpcInterfaces);
  // eslint-disable-next-line @itwin/no-internal
  ECSchemaRpcImpl.register();

  // __PUBLISH_EXTRACT_START__ Presentation.Backend.Initialization.OpenTelemetry.SdkSetup
  // configure the OpenTelemetry data exporting to the console
  const telemetry = new opentelemetry.NodeSDK({
    traceExporter: new ConsoleSpanExporter(),
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "presentation-test-app",
    }),
  });
  telemetry.start();
  process.on("SIGTERM", () => {
    telemetry.shutdown().finally(() => process.exit(0));
  });
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ Presentation.Backend.Initialization.Props
  // set up props for the presentation backend
  const presentationBackendProps: PresentationProps = {
    rulesetDirectories: [path.join("assets", "presentation_rules")],
  };
  // __PUBLISH_EXTRACT_END__

  // props that we don't want to show in documentation set up example
  presentationBackendProps.workerThreadsCount = 1;
  presentationBackendProps.useMmap = true;
  presentationBackendProps.updatesPollInterval = 20;

  // __PUBLISH_EXTRACT_START__ Presentation.Backend.Initialization.OpenTelemetry.Props
  presentationBackendProps.diagnostics = {
    // requesting performance metrics
    perf: {
      // only capture spans that take more than 50 ms
      minimumDuration: 50,
    },
    // a function to capture current context - it's passed to the `handler` function as the second argument
    requestContextSupplier: () => context.active(),
    // the handler function is called after every request made through the `Presentation` APIs
    handler: (diagnostics, ctx) => {
      // call `exportDiagnostics` from the `@itwin/presentation-opentelemetry` package to parse diagnostics
      // data and export it through OpenTelemetry
      exportDiagnostics(diagnostics, ctx);
    },
  };
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ Presentation.Backend.Initialization
  // initialize presentation backend
  Presentation.initialize(presentationBackendProps);
  // __PUBLISH_EXTRACT_END__

  console.log(`Process ID: ${process.pid}`); // eslint-disable-line no-console
})();
