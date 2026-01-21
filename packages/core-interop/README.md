# @itwin/presentation-core-interop

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-core-interop` package acts as a layer between [`itwinjs-core` packages](https://www.itwinjs.org/reference/) and `presentation` packages:

- `@itwin/presentation-hierarchies`
- `@itwin/unified-selection`

Having this interop layer helps us evolve both sides without affecting one another in a major way.

## API

### `createIModelKey`

Attempts to create a unique identifier for the given iModel. In majority of cases that's going to be the `key` property, but if it's not set (e.g. when using [BlankConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/blankconnection/)) - `name` property is used instead. Finally, if both are empty - the function will throw an error.

Example:

<!-- [[include: [Presentation.CoreInterop.CreateIModelKey.Imports, Presentation.CoreInterop.CreateIModelKey.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { createIModelKey } from "@itwin/presentation-core-interop";

IModelConnection.onOpen.addListener((imodel: IModelConnection) => {
  const key = createIModelKey(imodel);
  console.log(`IModel opened: "${key}"`);
});
```

<!-- END EXTRACTION -->

### `createECSqlQueryExecutor`

Maps an iModel in the form of `itwinjs-core` [IModelDb](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/) or [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/) to an instance of `ECSqlQueryExecutor`, used in `@itwin/presentation-hierarchies` and `@itwin/unified-selection` packages.

Example:

<!-- [[include: [Presentation.CoreInterop.CreateECSqlQueryExecutor.Imports, Presentation.CoreInterop.CreateECSqlQueryExecutor.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";

const imodel: IModelConnection = getIModelConnection();
const executor = createECSqlQueryExecutor(imodel);
for await (const row of executor.createQueryReader({ ecsql: MY_QUERY })) {
  console.log(row);
}
```

<!-- END EXTRACTION -->

### `createECSchemaProvider`

Maps an instance of `itwinjs-core` [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/) class to an instance of `ECSchemaProvider`, used in `@itwin/presentation-hierarchies` and `@itwin/unified-selection` packages.

Example:

<!-- [[include: [Presentation.CoreInterop.CreateECSchemaProvider.Imports, Presentation.CoreInterop.CreateECSchemaProvider.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { createECSchemaProvider } from "@itwin/presentation-core-interop";

const imodel: IModelConnection = getIModelConnection();
const schemaProvider = createECSchemaProvider(imodel.schemaContext);
// the created schema provider may be used in `@itwin/presentation-hierarchies` or `@itwin/unified-selection` packages
```

<!-- END EXTRACTION -->

### `createValueFormatter`

Creates an instance of `IPrimitiveValueFormatter` that knows how to format primitive property values using their units' information. That information is retrieved from an iModel through `itwinjs-core` [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/).

Example:

<!-- [[include: [Presentation.CoreInterop.CreateValueFormatter.Imports, Presentation.CoreInterop.CreateValueFormatter.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { createValueFormatter } from "@itwin/presentation-core-interop";

const imodel: IModelConnection = getIModelConnection();
const metricFormatter = createValueFormatter({ schemaContext: imodel.schemaContext, unitSystem: "metric" });
const imperialFormatter = createValueFormatter({ schemaContext: imodel.schemaContext, unitSystem: "imperial" });

// Define the raw value to be formatted
const value = 1.234;

// Define the `KindOfQuantity` to use for formatting:
// <KindOfQuantity
//   typeName="FlowRate"
//   displayLabel="Flow Rate"
//   persistenceUnit="u:CUB_M_PER_SEC"
//   relativeError="1e-05"
//   presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]"
// />
const koqName = `${KOQ_SCHEMA_NAME}.FlowRate`;

// Not passing `koqName` formats the value without units using the default formatter:
expect(await metricFormatter({ type: "Double", value })).to.eq("1.23");

// Metric formatter formats the value in liters per minute:
expect(await metricFormatter({ type: "Double", value, koqName })).to.eq("74040.0 L/min");

// Imperial formatter formats the value in gallons per minute:
expect(await imperialFormatter({ type: "Double", value, koqName })).to.eq("19559.2988 gal/min");
```

<!-- END EXTRACTION -->

### `registerTxnListeners`

Registers a number of transaction listeners on either the backend [TxnManager](https://www.itwinjs.org/reference/core-backend/imodels/txnmanager/) or the frontend [BriefcaseTxns](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcasetxns/) and calls the given `onChange` function whenever there's a change in an iModel holding the transaction manager.

Example:

<!-- [[include: [Presentation.CoreInterop.RegisterTxnListeners.Imports, Presentation.CoreInterop.RegisterTxnListeners.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BriefcaseDb } from "@itwin/core-backend";
import { registerTxnListeners } from "@itwin/presentation-core-interop";
import { HierarchyProvider } from "@itwin/presentation-hierarchies";

const imodel: BriefcaseDb = getIModel();
const provider: HierarchyProvider & { notifyDataSourceChanged: () => void } = getHierarchyProvider();

// register the listeners
const unregister = registerTxnListeners(imodel.txns, () => {
  // notify provided about the changed data
  provider.notifyDataSourceChanged();
  // the provider is expected to raise `hierarchyChanged` event, which in turn
  // should trigger an update in the UI that uses this provider
});

// clean up on iModel close
imodel.onClosed.addOnce(() => unregister());
```

<!-- END EXTRACTION -->

### `createLogger`

Maps the `itwinjs-core` [Logger](https://www.itwinjs.org/reference/core-bentley/logging/logger/) class to an `ILogger` interface used by Presentation packages.

Example:

<!-- [[include: [Presentation.CoreInterop.CreateLogger.Imports, Presentation.CoreInterop.CreateLogger.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { Logger as CoreLogger } from "@itwin/core-bentley";
import { createLogger as createPresentationLogger } from "@itwin/presentation-core-interop";
import { setLogger as setPresentationLogger } from "@itwin/presentation-hierarchies";

setPresentationLogger(createPresentationLogger(CoreLogger));
```

<!-- END EXTRACTION -->
