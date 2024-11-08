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
IModelConnection.onClose.addListener((imodel) => {
  unifiedSelection.clearStorage(imodel.key);
});

// add a demo selection listener
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

// in some component
MyComponent.onECInstanceSelected((imodel: IModelConnection, key: { className: string; id: Id64String }) => {
  unifiedSelection.addToSelection({ imodelKey: imodel.key, source: "MyComponent", selectables: [key] });
});
```

## Details

### Selection levels

By default, whenever a component changes unified selection, that happens at 0th (top) selection level. And similarly, whenever a component requests current selection from the storage, by default the top selection level is used. However, there are cases when we want to have multiple levels of selection.

For example, let's say there're 3 components: _A_, _B_ and _C_:

- _Component A_ shows a list of elements and allows selecting them.
- _Component B_ shows a list of elements selected in _Component A_ and allows selecting them individually. Selecting an individual element should not change selection in _Component A_ or content in _Component B_ itself.
- _Component C_ shows properties of elements selected either in _Component A_ or _Component B_.

The behavior described above can't be achieved using just one level of selection, because as soon as selection is made in _Component B_, that selection would get represented in _Component A_, and _Component B_ would change what it's displaying to the individual element.

That can be fixed by introducing another selection level, but before the components can be configured, here are a few key facts about selection levels:

- Higher level selection has lower index. So top level selection is 0, lower level is 1, and so on.
- Changing higher level selection clears all lower level selections.
- Lower level selection doesn't have to be a sub-set of higher level selection.

With that in mind, the above components _A_, _B_ and _C_ can be configured as follows:

- _Component A_ only cares about top level selection. Whenever something is selected in the component, unified selection is updated at the top level. Similarly, whenever unified selection changes, the component only reacts if that happened at the top level.
- _Component B_ reloads its content if the selection changes at the top level. Row selection is handled using lower level, so selecting a row doesn't affect _Component A's_ selection or _Component B's_ content.
- _Component C_ reloads its content no matter the selection level.

### Hilite sets

> **Note:** hilite = highlight

`@itwin/core-frontend` contains a concept called the [HiliteSet](https://www.itwinjs.org/reference/core-frontend/selectionset/hiliteset/). This concept is tightly related to unified selection, because, generally, we want selected elements to be highlighted in the application's graphics views. The `HiliteSet` object contains IDs of 3 types of elements: [GeometricModel](https://www.itwinjs.org/reference/core-backend/models/geometricmodel/), [SubCategory](https://www.itwinjs.org/reference/core-backend/imodels/subcategory/) and [GeometricElement](https://www.itwinjs.org/reference/core-backend/elements/geometricelement/). On the other hand, the unified selection API allows selecting other kinds of elements too, so IDs of these elements need to be mapped to the supported ones. The rules are as follows:

- for `BisCore.Subject` return IDs of all geometric models that are recursively under that Subject,
- for `BisCore.Model` just return its ID,
- for `BisCore.PhysicalPartition` just return ID of a model that models it,
- for `BisCore.Category` return IDs of all its _SubCategories_,
- for `BisCore.SubCategory` just return its ID,
- for `BisCore.GeometricElement` return ID of its own and all its child elements recursively.

So for example when unified selection contains a Subject, the hilite set for it will contain all models under that Subject, it's child Subjects, their child Subjects, etc. Given such hilite set, the viewport component hilites all elements in those models.

The `@itwin/unified-selection` package delivers APIs for creating a `HiliteSet` or retrieving it for _current_ selection in a `SelectionStorage`:

```ts
// Components may want to get a hilite set for arbitrary set of Selectables - use `createHiliteSetProvider` for that.
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor, createECSchemaProvider } from "@itwin/presentation-core-interop";
import { createHiliteSetProvider } from "@itwin/unified-selection";
const hiliteProvider = createHiliteSetProvider({
  imodelAccess: {
    ...createECSchemaProvider(imodel),
    ...createECSqlQueryExecutor(imodel),
  },
});
const hiliteSet = await hiliteProvider.getHiliteSet({ selectables });

// Some others may want to get a hilite set for _current_ selection in storage - use `createCachingHiliteSetProvider` for that. It's
// recommended to keep a single instance of this provider per application as it caches hilite sets per each iModel's selection.
import { createCachingHiliteSetProvider } from "@itwin/unified-selection";
const selectionHiliteProvider = createCachingHiliteSetProvider({
  selectionStorage,
  imodelProvider: (imodelKey: string) => getIModelByKey(imodelKey),
});
const selectionHiliteSet = await selectionHiliteProvider.getHiliteSet({ imodel.key });
// The caching provider registers a selection change listener and should be disposed, in case its lifetime
// is shorter than that of `SelectionStorage`, to unregister the listener.
selectionHiliteProvider.dispose();
```

### Selection scopes

Selection scopes allow decoupling of what gets picked and what gets selected. Without selection scopes, whenever a user picks an element in the viewport, its ID goes straight into unified selection storage. With selection scopes we can modify that and add something different. The input to the selection scopes' processor is a query executor, element IDs, and the scope to apply, and the output is an iterator of `SelectableInstanceKey`. We get the input when the user picks some elements in the viewport, run that through the selection scope processor and put the output into unified selection storage.

Here are the scopes we support at the moment:

- `element` - return key of selected element.
- `category` - return key of geometric element's category.
- `model` - return key of element's model.
- `functional` - return key of element's related functional element. For `BisCore.GeometricElement3d` the related functional element is found using the `Functional.PhysicalElementFulfillsFunction` relationship. For `BisCore.GeometricElement2d` the nearest functional element is searched for using the `Functional.DrawingGraphicRepresentsFunctionalElement` relationship - if the given element has a related functional element, it will be returned, otherwise the element's parent will be checked and if it also does not have a related functional, then the parent of the parent will be checked until no more ancestors can be traversed or a functional element is found. Regardless whether it is an `BisCore.GeometricElement2d` or `BisCore.GeometricElement3d` if no functional element is found then the element itself will be returned.

The `@itwin/unified-selection` package delivers a `computeSelection` function for computing which elements should be added into unified selection storage based on the given element ID's and a specified selection scope:

```ts
import { computeSelection } from "@itwin/unified-selection";
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
const queryExecutor = createECSqlQueryExecutor(imodel);
const selection = computeSelection({ queryExecutor, elementIds, scope: "element" });
```

`element` and `functional` scopes additionally allow selecting assembly elements by specifying the `ancestorLevel` property in the selection scope argument of `computeSelection` function. The `ancestorLevel` property specifies how far "up" we should walk to find the target element. When not specified or `0`, the target element matches the request element. When set to `1`, the target element matches the direct parent element. When `2`, the target element is the parent of the parent element, and so on. In all situations when this is `> 0`, we're not walking further than the last existing element, for example, when `ancestorLevel = 1` (direct parent element is requested), but the request element doesn't have a parent, the request element is returned as the result. A negative value would result in the top-most element to be returned.

For the `functional` scope, the `ancestorLevel` property is used as follows: if an element is a `BisCore.GeometricElement3d` element, its ancestor is selected based on the given `ancestorLevel` the same as with non-functional elements, and then the resulting element's related functional element will be returned (using the `Functional.PhysicalElementFulfillsFunction` relationship), or if it does not have one, then the resulting element will be returned. For `BisCore.GeometricElement2d` elements, the nearest related functional element is found in the same way it is done when the `ancestorLevel` property is not provided, and then the ancestor of that element is returned (based on the provided value of `ancestorLevel`).

```ts
import { computeSelection } from "@itwin/unified-selection";
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
const queryExecutor = createECSqlQueryExecutor(imodel);
// Returns the parent element, or the element itself if it does not have a parent, for each element specified in `elementIds` argument.
const selection = computeSelection({ queryExecutor, elementIds, scope: { id: "element", ancestorLevel: 1 } });
```

## iModel selection synchronization with unified selection

The `@itwin/unified-selection` package delivers a `enableUnifiedSelectionSyncWithIModel` function to enable selection synchronization between an iModel and a `SelectionStorage`. When called, it returns a cleanup function that should be used to disable the synchronization. There should only be one active synchronization between a single iModel and a `SelectionStorage` at a given time. For example, this function could be used inside a `useEffect` hook in a component that holds an iModel:

```ts
import { createECSqlQueryExecutor, createECSchemaProvider } from "@itwin/presentation-core-interop";
useEffect(() => {
  return enableUnifiedSelectionSyncWithIModel({
    imodelAccess: {
      ...createECSqlQueryExecutor(imodel),
      ...createECSchemaProvider(imodel),
      key: imodel.key,
      hiliteSet: imodel.hilited,
      selectionSet: imodel.selectionSet,
    },
    selectionStorage,
    activeScopeProvider: () => "element",
  });
}, [imodel]);
```
