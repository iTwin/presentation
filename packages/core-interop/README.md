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

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { createIModelKey } from "@itwin/presentation-core-interop";

IModelConnection.onOpen.addListener((imodel: IModelConnection) => {
  const key = createIModelKey(imodel);
  console.log(`IModel opened: "${key}"`);
});
```

### `createECSqlQueryExecutor`

Maps an iModel in the form of `itwinjs-core` [IModelDb](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/) or [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/) to an instance of `ECSqlQueryExecutor`, used in `@itwin/presentation-hierarchies` and `@itwin/unified-selection` packages.

Example:

```ts
import { IModelDb } from "@itwin/core-backend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";

const imodel: IModelDb = getIModelDb();
const executor = createECSqlQueryExecutor(imodel);
for await (const row of executor.createQueryReader(MY_QUERY)) {
  // TODO: do something with `row`
}
```

### `createECSchemaProvider`

Maps an instance of `itwinjs-core` [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/) class to an instance of `ECSchemaProvider`, used in `@itwin/presentation-hierarchies` and `@itwin/unified-selection` packages.

Example:

```ts
import { SchemaContext } from "@itwin/ecschema-metadata";
import { createECSchemaProvider } from "@itwin/presentation-core-interop";

const schemas = new SchemaContext();
const schemaProvider = createECSchemaProvider(schemas);
// the created schema provider may be used in `@itwin/presentation-hierarchies` or `@itwin/unified-selection` packages
```

### `createValueFormatter`

Creates an instance of `IPrimitiveValueFormatter` that knows how to format primitive property values using their units' information. That information is retrieved from an iModel through `itwinjs-core` [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/).

Example:

```ts
import { SchemaContext } from "@itwin/ecschema-metadata";
import { createValueFormatter } from "@itwin/presentation-core-interop";

const schemaContext = new SchemaContext();
const formatter = createValueFormatter({ schemaContext, unitSystem: "metric" });
const formattedValue = await formatter({ type: "Double", value: 1.234, koqName: "MySchema.LengthKindOfQuantity" });
```

### `registerTxnListeners`

Registers a number of transaction listeners on either the backend [TxnManager](https://www.itwinjs.org/reference/core-backend/imodels/txnmanager/) or the frontend [BriefcaseTxns](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcasetxns/) and calls the given `onChange` function whenever there's a change in an iModel holding the transaction manager.

Example:

```ts
import { BriefcaseDb } from "@itwin/core-backend";
import { registerTxnListeners } from "@itwin/presentation-core-interop";
import { HierarchyProvider } from "@itwin/presentation-hierarchies";

// get iModel and hierarchy provider from arbitrary sources
const db: BriefcaseDb = getIModel();
const provider: HierarchyProvider = getHierarchyProvider();

// register the listeners
const unregister = registerTxnListeners(db.txns, () => {
  // notify provided about the changed data
  provider.notifyDataSourceChanged();
  // TODO: force the components using `provider` to reload
});

// clean up on iModel close
db.onClosed.addOnce(() => unregister());
```

### `createLogger`

Maps the `itwinjs-core` [Logger](https://www.itwinjs.org/reference/core-bentley/logging/logger/) class to an `ILogger` interface used by Presentation packages.

Example:

```ts
import { Logger as CoreLogger } from "@itwin/core-bentley";
import { createLogger as createPresentationLogger } from "@itwin/presentation-core-interop";
import { setLogger as setPresentationLogger } from "@itwin/presentation-hierarchies";

setPresentationLogger(createPresentationLogger(CoreLogger));
```
