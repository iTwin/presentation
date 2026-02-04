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

   The [viewWithUnifiedSelection](https://www.itwinjs.org/reference/presentation-components/viewport/viewwithunifiedselection/) HOC was deprecated in favor of the `enableUnifiedSelectionSyncWithIModel` provided by this package. The API is quite a bit different, but it's more clear about what it does and is more flexible in how it can be used. See the [iModel selection synchronization with unified selection](./SyncWithIModelConnection.md) learning page for more information and example for using it in a React app. **Warning:** the two approaches - `enableUnifiedSelectionSyncWithIModel` function and the deprecated `viewWithUnifiedSelection` HOC - are not compatible with each other and may result in unexpected selection changes. If you use the `enableUnifiedSelectionSyncWithIModel` function, you should NOT use the HOC.

2. Existing components, that haven't migrated to the new system, continue working as expected.

   This was achieved by enhancing the deprecated [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) to take `SelectionStorage` from this package. That allows making the `SelectionStorage` object the single source of truth of what's selected in an application, even for components using the deprecated API.

   The only change application developers need to do is to initialize the `Presentation` frontend with the `SelectionStorage` object:

   <!-- [[include: [Presentation.UnifiedSelection.LegacySelectionManagerSelectionSync.Imports, Presentation.LegacySelectionManagerSelectionSync.Example], ts]] -->
   <!-- BEGIN EXTRACTION -->

   ```ts
   import { Presentation } from "@itwin/presentation-frontend";
   import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
   import { createStorage, enableUnifiedSelectionSyncWithIModel, Selectables, SelectionStorage } from "@itwin/unified-selection";

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

The new system has a more modular approach. The hilite and selection scope APIs are now separate (see [Selection scopes](#selection-scopes) and [Hilite sets](#hilite-sets) sections), and the selection management APIs are very similar and are located on the `SelectionStorage` type.

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

## Selection scopes

There are several situations where application components need to interact with selection scopes' APIs:

- Get available selection scopes list.
- Get / set the active selection scope.
- Compute selection based on picked elements and selection scope.

The following sections provide examples of how to migrate from the old system to the new one for each of these use cases.

### Getting available selection scopes

The old system provided a way to get a hardcoded list of available selection scopes by making a call to [SelectionScopesManager.getSelectionScopes](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionscopesmanager/getselectionscopes/). This call resulted in a trip to the backend and the result was hard to predict to consumers - for example, a new scope may become available unexpectedly, without consumers' consent.

```ts
const scopes: SelectionScope[] = await Presentation.selection.scopes.getSelectionScopes(iModelConnection);
```

The new system doesn't define a list of available scopes for the consumers. Instead, it defines a `SelectionScope` type to describe a selection scope, and consumers are free to define the scopes they want to use. In fact, the new system doesn't care about such list of scopes at all - it only cares about the "active" selection scope.

### Get / set the active selection scope

Similar to the above, the old system provided a way to get / set the active selection scope through the [SelectionScopesManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionscopesmanager/) and, more specifically, its `activeScope` property:

```ts
const activeScope = Presentation.selection.scopes.activeScope;
```

There is no such global "active" selection scope in the new system and in case consumers even need this - maintaining it is now their responsibility. Some applications may not care about selection scopes and simply pass some default scope straight to `enableUnifiedSelectionSyncWithIModel`. Some may not even need unified selection sync.

### Computing selection based on selection scope

In some rare cases, consumers need to compute selection based on the picked elements and an arbitrary selection scope. To achieve that in the old system, you'd do something like this:

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

### AppUI integration

It may not be obvious how everything fits together in a real-world, [AppUI](https://www.itwinjs.org/reference/appui-react/)-driven iTwin.js application. This is mostly due to very obscure dependencies between components in AppUI and legacy Presentation packages. Hopefully, the new system makes things easier to understand and integrate.

The setup in the old system consisted of the following steps:

```ts
// 1. Call this when iModel connection is opened:
async function initializeSelectionScopes(imodel: IModelConnection) {
  const availableScopes = await Presentation.selection.scopes.getSelectionScopes(imodel);
  UiFramework.dispatchActionToStore(
    SessionStateActionId.SetAvailableSelectionScopes,
    availableScopes
  );
}

// 2. Sync AppUI's active selection scope to Presentation's `SelectionScopesManager` - call this when initializing the app:
async function syncActiveSelectionScope() {
  Presentation.selection.scopes.activeScope = UiFramework.getActiveSelectionScope();
  SyncUiEventDispatcher.onSyncUiEvent.addListener((args: UiSyncEventArgs) => {
    if (args.eventIds.has(SessionStateActionId.SetSelectionScope)) {
      Presentation.selection.scopes.activeScope = UiFramework.getActiveSelectionScope();
    }
  });
}

// 3. Render `<SelectionScopeField />` AppUI component in status bar by returning it from a `UiItemsProvider`:
class MyStatusbarItemsProvider implements UiItemsProvider {
  public provideStatusBarItems(): StatusBarItem[] {
    return [
      StatusBarItemUtilities.createCustomItem(
        "SelectionScope",
        StatusBarSection.Right,
        30,
        <SelectionScopeField />,
      ),
    ];
  }
}
// The `<SelectionScopeField />` component, when rendered without props, uses deprecated Redux store APIs to access available
// selection scopes (set in step #1), and maintain the active selection scope and update it in Redux store, making the value
// accessible through the deprecated `UiFramework.getActiveSelectionScope()` function (see step #2).

// 4. Finally, the consumer has to wrap `ViewportComponent` with the deprecated `viewWithUnifiedSelection` React HOC to create
// a unified selection-enabled viewport component, which uses `Presentation.selection.scopes.activeScope` to compute selection
// when users pick elements in the viewport.
const UnifiedSelectionViewport = viewWithUnifiedSelection(ViewportComponent);
function MyViewport(props: { imodel: IModelConnection; initialViewState: ViewState }) {
  return <UnifiedSelectionViewport imodel={props.imodel} viewState={props.initialViewState} />;
}
```

The recommended setup in the new system is to rely on React context to do the job:

```ts
// 1. Define a React context to set up available scopes and maintain the active scope:
const availableScopes: { [id: string]: { label: string; def: SelectionScope } } = {
  element: {
    label: "Element",
    def: { id: "element" },
  },
  assembly: {
    label: "Assembly",
    def: { id: "element", ancestorLevel: 1 },
  },
};
const selectionScopesContext = React.createContext<{
  availableScopes: typeof availableScopes,
  activeScope: { id: string; def: SelectionScope; }
  onScopeChange: (scopeId: string) => void;
}>({
  availableScopes: { element: { label: "Element", def: "element" } },
  activeScope: { id: "element", def: "element" },
  onScopeChange: () => {},
});
export function SelectionScopesContextProvider({ children }: React.PropsWithChildren<{}>) {
  const [activeScope, setActiveScope] = React.useState<{ id: string; def: SelectionScope }>({ id: "element", def: availableScopes["element"].def });
  const onScopeChange = React.useCallback(
    (scopeId: string) => {
      setActiveScope({ id: scopeId, def: availableScopes[scopeId].def });
    },
    []
  );
  return (
    <selectionScopesContext.Provider value={{ availableScopes, activeScope, onScopeChange }}>
      {children}
    </selectionScopesContext.Provider>
  );
}
export function useSelectionScopesContext() {
  return React.useContext(selectionScopesContext);
}

// 2. Provide the context to AppUI components by wrapping `<ConfigurableUiContent />` with our `SelectionScopesContextProvider`:
function MyApp() {
  // ... possibly some initialization logic here
  return (
    <SelectionScopesContextProvider>
      <ConfigurableUiContent />
    </SelectionScopesContextProvider>
  );
}

// 3. Render `<SelectionScopeField />` that uses the above context:
import { SelectionScopeField as AppUiSelectionScopeField } from "@itwin/appui-react";
function SelectionScopeField() {
  const ctx = useSelectionScopesContext();
  const selectionScopes = React.useMemo(
    () => Object.entries(ctx.availableScopes).map(([id, { label }]) => ({ id, label })),
    [],
  );
  return (
    <AppUiSelectionScopeField
      selectionScopes={selectionScopes}
      activeScope={ctx.activeScope.id}
      onChange={ctx.onScopeChange}
    />
  );
}
// Then, just provide the field to AppUI system as usual.

// 4. Enable unified selection synchronization in the top-level iModel-driven component:
function MyIModelComponent({ imodel, selectionStorage }: { imodel: IModelConnection; selectionStorage: SelectionStorage }) {
  const ctx = useSelectionScopesContext();
  const activeScope = ctx.activeScope.def;
  const activeScopeRef = React.useRef<SelectionScope>(activeScope);
  React.useEffect(() => {
    activeScopeRef.current = activeScope;
  }, [activeScope]);
  React.useEffect(
    // warning: ensure the viewport is rendered without the `viewWithUnifiedSelection` HOC when switching to `enableUnifiedSelectionSyncWithIModel`
    () => enableUnifiedSelectionSyncWithIModel({
      imodelAccess: createIModelAccess(imodel),
      selectionStorage,
      activeScopeProvider: () => activeScopeRef.current,
    }),
    [imodel, selectionStorage],
  );

  // ... render the rest of the component
}
```

While it may seem that the new approach is more verbose, it's actually more flexible and easier to understand. The new system doesn't rely on global state and doesn't require any specific APIs to be called in a specific order. It's also more clear about what's happening and what's being passed around.

## Hilite sets

There are two situations where hilite set computation is needed:

- For the "active" selection.
- For arbitrary elements / selectables.

The following sections provide examples of how to migrate from the old system to the new one for each of these use cases.

### Getting hilite set for the "active" selection

This is a more common case, where the result is cached upon request and invalidated when the selection changes.

In the old system, you'd do something like this:

```ts
const hiliteSet: AsyncIterableIterator<HiliteSet> = Presentation.selection.getHiliteSetIterator(iModelConnection);
```

In the new system, a hilite set provider has to be created. The provider holds the cached result and can be shared across components to avoid excessive requests.

```ts
using provider = createIModelHiliteSetProvider({
  // this is called to get iModel access based on the iModel key
  imodelProvider: (imodelKey) => getIModelAccessByKey(imodelKey),
  selectionStorage,
});
const hiliteSet: AsyncIterableIterator<HiliteSet> = provider.getHiliteSet({ imodelKey: createIModelKey(imodel) });
```

### Getting hilite set for arbitrary elements / selectables

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
