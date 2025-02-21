# @itwin/unified-selection

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The purpose of the `@itwin/unified-selection` package and unified selection in general is to act as a single source of truth of what is selected in an [iTwin.js](https://www.itwinjs.org/) application.

## Concepts

The API consists of a few very basic concepts:

- A `Selectable` is something that can be selected and is associated with an [EC](https://www.itwinjs.org/bis/ec/) instance. There are 2 types of selectables:

  - `SelectableInstanceKey` uniquely identifies a single EC instance through a full class name and [ECInstanceId](https://www.itwinjs.org/learning/ecsql/#ecinstanceid-and-ecclassid).
  - `CustomSelectable` is identified by an arbitrary `identifier` string and knows how to get any number of `SelectableInstanceKey` associated with it.

- `Selectables` is a container for multiple `Selectable` instances. The container is structured in a way that allows to quickly find specific selectables by their identifier.

- `SelectionStorage` is an interface that manages `Selectables` for different [iModels](https://www.itwinjs.org/learning/imodels/). It allows:

  - Changing the selection (add, remove, replace, clear).
  - Get active selection.
  - Listen to selection changes.

  The package delivers the `createStorage()` function to create an instance of `SelectionStorage`. Consumers are also expected to call `SelectionStorage.clearStorage` whenever an iModel is closed to free up memory.

## Usage example

```ts
// Create a global selection store (generally, somewhere in main.ts or similar). This store
// must be shared across all the application's components to ensure unified selection experience.
import { createStorage } from "@itwin/unified-selection";
const unifiedSelection = createStorage();

// The store should to be cleaned up when iModels are closed to free up memory, e.g.:
import { IModelConnection } from "@itwin/core-frontend";
import { createIModelKey } from "@itwin/presentation-core-interop";
IModelConnection.onClose.addListener((imodel) => {
  unifiedSelection.clearStorage({ imodelKey: createIModelKey(imodel) });
});

// A demo selection listener logs selection changes to the console:
import { Selectables } from "@itwin/unified-selection";
unifiedSelection.selectionChangeEvent.addListener(({ imodelKey, source, changeType, selectables }) => {
  const suffix = `in ${imodelKey} iModel from ${source} component`;
  const numSelectables = Selectables.size(selectables);
  switch (changeType) {
    case "add":
      console.log(`Added ${numSelectables} items to selection ${suffix}.`);
      break;
    case "remove":
      console.log(`Removed ${numSelectables} items from selection ${suffix}.`);
      break;
    case "replace":
      console.log(`Replaced selection with ${numSelectables} items ${suffix}.`);
      break;
    case "clear":
      console.log(`Cleared selection ${suffix}.`);
      break;
  }
});

// An interactive component that allows selecting elements, representing something in an iModel, may want to
// add that something to unified selection:
MyComponent.onECInstanceSelected((imodel: IModelConnection, key: { className: string; id: Id64String }) => {
  unifiedSelection.addToSelection({ imodelKey: createIModelKey(imodel), source: "MyComponent", selectables: [key] });
});
```

## Learning

Are you migrating from `SelectionManager` in `@itwin/presentation-frontend`? Check out our [Migrating from `SelectionManager`](./learning/MigrationGuide.md) learning page!

Below is a list of learning material related integrating unified selection into your components:

- General topics:
  - [Selection levels](./learning/SelectionLevels.md)
  - [Selection scopes](./learning/SelectionScopes.md)
  - [Hilite sets](./learning/HiliteSets.md)
  - [Caveats](./learning/Caveats.md)
- Integrating with iTwin.js components:
  - [Viewport / iModel](./learning/SyncWithIModelConnection.md)
  - [Tree](./learning/SyncWithTree.md)
  - [Property grid](./learning/SyncWithPropertyGrid.md)
  - [Table](./learning/SyncWithTable.md)

Do you think something is missing in the above list? Let us know by [creating an issue](https://github.com/iTwin/presentation/issues/new?assignees=&labels=documentation%2C+presentation&projects=&template=learning-material-request.md&title=)!
