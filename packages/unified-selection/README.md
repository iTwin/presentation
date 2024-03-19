# @itwin/unified-selection

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/unified-selection` package provides API for managing [unified selection](https://www.itwinjs.org/presentation/unified-selection/).

## Basic concepts

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

## Basic usage

```ts
// create a global selection store (generally, somewhere in main.ts or similar)
import { createStore } from "@itwin/unified-selection";
const unifiedSelection = createStore();

// the store should to be cleaned up when iModels are closed to free up memory, e.g.:
import { IModelConnection } from "@itwin/core-frontend";
IModelConnection.onClose.addListener((iModel) => {
    unifiedSelection.clearStorage(iModel.key);
});

// add a demo selection listener
import { Selectables } from "@itwin/unified-selection";
unifiedSelection.selectionChangeEvent.addListener(({ iModelKey, source, changeType, selectables }) => {
    const suffix = `in ${iModelKey} iModel from ${source} component`;
    const numSelectables = Selectables.size(selectables);
    switch (changeType) {
        case "add":
            console.log(`Added ${numSelectables} items to selection ${suffix}.`);
            break;
        case "remove":
            console.log(`Removed ${numSelectables} items from selection ${suffix}.`);
            break;
        case "replace":
            console.log(`Selected ${numSelectables} items ${suffix}.`);
            break;
        case "clear":
            console.log(`Cleared selection ${suffix}.`);
            break;
    }
});

// in some component
MyComponent.onECInstanceSelected((key: { className: string, id: Id64String }) => {
    unifiedSelection.addToSelection("MyComponent", [key], 0);
});
```

## Details

### Selection levels

By default, whenever a component changes unified selection, that happens at 0th (top) selection level. And similarly, whenever a component requests current selection from the storage, by default the top selection level is used. However, there are cases when we want to have multiple levels of selection.

For example, let's say there're 3 components: *A*, *B* and *C*:

- *Component A* shows a list of elements and allows selecting them.
- *Component B* shows a list of elements selected in *Component A* and allows selecting them individually. Selecting an individual element should not change selection in *Component A* or content in *Component B* itself.
- *Component C* shows properties of elements selected either in *Component A* or *Component B*.

The behavior described above can't be achieved using just one level of selection, because as soon as selection is made in *Component B*, that selection would get represented in *Component A*, and *Component B* would change what it's displaying to the individual element.

That can be fixed by introducing another selection level, but before the components can be configured, here are a few key facts about selection levels:

- Higher level selection has lower index. So top level selection is 0, lower level is 1, and so on.
- Changing higher level selection clears all lower level selections.
- Lower level selection doesn't have to be a sub-set of higher level selection.

With that in mind, the above components *A*, *B* and *C* can be configured as follows:

- *Component A* only cares about top level selection. Whenever something is selected in the component, unified selection is updated at the top level. Similarly, whenever unified selection changes, the component only reacts if that happened at the top level.
- *Component B* reloads its content if the selection changes at the top level. Row selection is handled using lower level, so selecting a row doesn't affect *Component A's* selection or *Component B's* content.
- *Component C* reloads its content no matter the selection level.
