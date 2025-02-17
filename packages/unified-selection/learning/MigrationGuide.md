# Migrating from `@itwin/presentation-frontend` unified selection API

The unified selection system has been part of `@itwin/presentation-frontend` for a long time, providing a way for apps to have a single source of truth of what's selected. The implementation has a few drawbacks that we improved in the new `@itwin/unified-selection` package:

- The unified selection API was tied to hierarchies' APIs (e.g. allowed selecting a "node key"). The new system handles this in a much more generic fashion, allowing selection of basically anything.

- The system relied on specific RPC calls to produce result for certain requests. The new system handles everything using standard query APIs, so it's much more flexible.

- All the unified selection APIs were tightly coupled together and relied on static initialization. The new system is more modular and allows using individual parts of functionality without requiring others.

- The new system is not tied to a "frontend" and can be used anywhere.

The below sections provide examples of how to migrate from the old system to the new one.

## Higher level components

Before the deprecation, we made sure that migration is as smooth as possible by updating all our higher level components to support the new system as well as stay compatible with the old one.

1. All components that we own are compatible with the new system as the first class citizen.

   The [Tree](./SyncWithTree.md), [Table](./SyncWithTable.md) and [Property grid](./SyncWithPropertyGrid.md) components simply got a new `selectionStorage` prop, which tells them to use the new system (click on the links for specific APIs). For Table and Property grid components, the new prop is optional to keep them backwards compatible - in that case they continue working with the deprecated API.

   The [viewWithUnifiedSelection](https://www.itwinjs.org/reference/presentation-components/viewport/viewwithunifiedselection/) HOC was deprecated in favor of the `enableUnifiedSelectionSyncWithIModel` provided by this package. The API is quite a bit different, but it's more clear about what it does and is more flexible in how it can be used. See the [SyncWithIModelConnection](./SyncWithIModelConnection.md) learning page for more information and example for using in a React app.

2. Existing components, that haven't migrated to the new system, continue working as expected.

   This was achieved by enhancing the deprecated [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) to take `SelectionStorage` from this package. That allows making the `SelectionStorage` object the single source of truth of what's selected in an application, even for components using the deprecated API.

   The only change application developers need to do is to initialize the `Presentation` frontend with the `SelectionStorage` object:

   <!-- [[include: [Presentation.UnifiedSelection.LegacySelectionManagerSelectionSync.Imports, Presentation.LegacySelectionManagerSelectionSync.Example], ts]] -->
   <!-- BEGIN EXTRACTION -->

   ```ts
   import { createStorage } from "@itwin/unified-selection";
   import { Presentation } from "@itwin/presentation-frontend";

   const selectionStorage = createStorage();

   // Initialize Presentation with our selection storage, to make sure that any components, using `Presentation.selection`,
   // use the same underlying selection store.
   await Presentation.initialize({
     selection: {
       selectionStorage,
     },
   });
   ```

   <!-- END EXTRACTION -->

## Managing unified selection directly

The old system has a [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) class, whose singleton instance could be accessed through a call to `Presentation.selection` on the frontend. The instance acted both - as an entry point to hilite and selection scope APIS, and as a selection storage with all its modification and listening APIs.

The new system has a more modular approach. The hilite and selection scope APIs are now separate (see [Computing selection based on selection scope](#computing-selection-based-on-selection-scope) and [Computing hilite set](#computing-hilite-set) sections), and the selection management APIs are very similar and are located on the `SelectionStorage` type.

An example of [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) API usage:

```ts
// on application startup, the Presentation API requires initialization
await Presentation.initialize({
  selection: {
    // may provide props for the singleton SelectionManager instance here
  },
});

// then, components can start listening to selection changes
Presentation.selection.selectionChange.addListener((args) => {
  // handle selection changes
});

// ...or get the current selection
const selection: Readonly<KeySet> = Presentation.selection.getSelection(iModelConnection);

// ...or modify the selection
const onButtonClick = () => {
  Presentation.selection.addToSelection("My button", iModelConnection, new KeySet([elementToAdd]));
};
```

A similar example using the new `SelectionStorage` API:

```ts
// on application startup, create a new instance of `SelectionStorage` - it's application's responsibility to
// manage its lifecycle
const unifiedSelectionStorage = createStorage();
IModelConnection.onClose.addListener((iModelConnection) => {
  unifiedSelectionStorage.clearStorage({ imodelKey: createIModelKey(iModelConnection) });
});

// then, components can start listening to selection changes
unifiedSelectionStorage.selectionChangeEvent.addListener((args) => {
  // handle selection changes
});

// ...or get the current selection
const selection: Selectables = unifiedSelectionStorage.getSelection({ imodelKey: createIModelKey(iModelConnection) });

// ...or modify the selection
const onButtonClick = () => {
  unifiedSelectionStorage.addToSelection({
    source: "My button",
    imodelKey: createIModelKey(iModelConnection),
    selectables: [elementToAdd],
  });
};
```

## Computing selection based on selection scope

As mentioned in the [Managing unified selection directly](#managing-unified-selection-directly) section, the [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) was an entry point to selection scopes' functionality. So you'd do something like this:

```ts
const selection: KeySet = await Presentation.selection.scopes.computeSelection(iModelConnection, elementIds, { id: "element", ancestorLevel: 1 });
```

In the new system, the `computeSelection` is a top-level function:

```ts
const selection: AsyncIterableIterator<SelectableInstanceKey> = computeSelection({
  queryExecutor: createECSqlQueryExecutor(imodel),
  elementIds,
  scope: { id: "element", ancestorLevel: 1 },
});
```

## Computing hilite set

There are two situations where hilite set computation is needed:

1. For the "active" selection. This is a more common case, where the result is cached upon request and invalidated when the selection changes.

   In the old system, you'd do something like this:

   ```ts
   const hiliteSet: AsyncIterableIterator<HiliteSet> = Presentation.selection.getHiliteSetIterator(iModelConnection);
   ```

   In the new system, a hilite set provider has to be created. The provider holds the cached result and can be shared across components to avoid excessive requests.

   ```ts
   using provider = createCachingHiliteSetProvider({
     // this is called to get iModel access based on the iModel key
     imodelProvider: (imodelKey) => getIModelAccessByKey(imodelKey),
     selectionStorage,
   });
   const hiliteSet: AsyncIterableIterator<HiliteSet> = provider.getHiliteSet({ imodelKey: createIModelKey(imodel) });
   ```

2. For arbitrary elements / selectables.

   In the old system, you'd do something like this:

   ```ts
   const provider = HiliteSetProvider.create({
     imodel: iModelConnection,
   });
   const hiliteSet: AsyncIterableIterator<HiliteSet> = provider.getHiliteSetIterator(new KeySet(selectables));
   ```

   The new system is very similar:

   ```ts
   const provider = createHiliteSetProvider({
     imodelAccess: {
       ...createECSchemaProvider(imodelSchemaContext),
       ...createECSqlQueryExecutor(imodel),
     },
   });
   const hiliteSet: AsyncIterableIterator<HiliteSet> = provider.getHiliteSet({ selectables });
   ```
