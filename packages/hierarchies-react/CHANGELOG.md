# @itwin/presentation-hierarchies-react

## 1.7.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@1.7.0

## 1.7.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@1.6.1

## 1.7.0

### Minor Changes

- 64e80beaeb87e5797d8238c14fa9cd8dbfcee7c3: Added `abortSignal` to `getFilteredPaths` callback used by `UseTree` hook. This allows to cancel ongoing requests when component is unmounted or new request is started.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@1.6.0

## 1.6.9

### Patch Changes

- [#1000](https://github.com/iTwin/presentation/pull/1000): Made sure `Apply filter` button becomes focused after hierarchy level filter is applied.

## 1.6.8

### Patch Changes

- [#982](https://github.com/iTwin/presentation/pull/982): Update itwinjs-core dependencies to v5.0.0
- Updated dependencies:
  - @itwin/presentation-hierarchies@1.5.1
  - @itwin/presentation-shared@1.2.2
  - @itwin/unified-selection@1.4.2

## 1.6.7

### Patch Changes

- [#974](https://github.com/iTwin/presentation/pull/974): Removed tree node outline on mobile devices.
- Updated dependencies:
  - @itwin/presentation-hierarchies@1.5.0

## 1.6.6

### Patch Changes

- [#944](https://github.com/iTwin/presentation/pull/944): Fixed `extended` selection mode not replacing existing selection when selected node is clicked.

## 1.6.5

### Patch Changes

- [#938](https://github.com/iTwin/presentation/pull/938): Fixed hierarchy level size exceeded message that suggest applying filtering on hierarchy levels that do not support filtering.

## 1.6.4

### Patch Changes

- [#909](https://github.com/iTwin/presentation/pull/909): Do not use `dev` versions of `@itwin/*` packages.
- Updated dependencies:
  - @itwin/unified-selection@1.4.1
  - @itwin/presentation-hierarchies@1.4.2
  - @itwin/presentation-shared@1.2.1

## 1.6.3

### Patch Changes

- Updated dependencies:
  - @itwin/unified-selection@1.4.0

## 1.6.2

### Patch Changes

- [#873](https://github.com/iTwin/presentation/pull/873): Fix hierarchy level size exceeds limit info message wrapping in narrow Tree on Safari browser.
- [#873](https://github.com/iTwin/presentation/pull/873): Do not require two clicks to expand node with filter buttons on touch devices.

## 1.6.1

### Patch Changes

- [#866](https://github.com/iTwin/presentation/pull/866): Updated hierarchy level size exceeded info message styling in narrow tree component to avoid cutting out text.

## 1.6.0

### Minor Changes

- [#841](https://github.com/iTwin/presentation/pull/841): Changed how tree state hooks access unified selection storage.

  - The tree state hooks that hook into unified selection system now accept a `selectionStorage` prop. At the moment the prop is optional, but will be made required in the next major release of the package.
  - The `UnifiedSelectionProvider` React context provider is now deprecated. The context is still used by tree state hooks if the selection storage is not provided through prop.

  Example of how to migrate to the new API:

  ```tsx
  const selectionStorage = createStorage();

  // before
  function MyTreeComponent() {
    // the hook takes selection storage from context, set up by the App component
    const treeState = useUnifiedSelectionTree({ ... });
    // ...
  }
  function App() {
    return (
      <UnifiedSelectionProvider storage={selectionStorage}>
        <MyTreeComponent />
      </UnifiedSelectionProvider>
    );
  }

  // after
  function MyTreeComponent({ selectionStorage }: { selectionStorage: SelectionStorage }) {
    // the hook takes selection storage from props
    const treeState = useUnifiedSelectionTree({ selectionStorage, ... });
    // ...
  }
  function App() {
    return (
      <MyTreeComponent selectionStorage={selectionStorage} />
    );
  }
  ```

### Patch Changes

- Updated dependencies:
  - @itwin/unified-selection@1.3.0

## 1.5.0

### Minor Changes

- [#840](https://github.com/iTwin/presentation/pull/840): Added `filterButtonsVisibility` to `treeNodeRenderer`. Which allows configuring filter buttons visibility for the whole tree.

  - `show-on-hover` - default value, shows filter buttons on node hover or focus.
  - `hide` - hides filter buttons on focus and hover, but will continue to show buttons on nodes in which filter is applied. Reaching hierarchy limit will continue to provide a way to filter nodes.

### Patch Changes

- [#831](https://github.com/iTwin/presentation/pull/831): Clicking on tree node buttons now visually show focus on node.
- [#812](https://github.com/iTwin/presentation/pull/812): Fixed tree state hooks not returning root nodes when hierarchy provider doesn't raise the `onHierarchyChanged` event upon setting a hierarchy filter.

## 1.4.0

### Minor Changes

- [#827](https://github.com/iTwin/presentation/pull/827): Changed `onHierarchyLoadError` callback in `UseTreeProps`, it now accepts error as one of the props arguments.

### Patch Changes

- [#828](https://github.com/iTwin/presentation/pull/828): Polyfill `Symbol.dispose` and `Symbol.asyncDispose` to make sure that code using the upcoming JS recource management API works in all environments.
- Updated dependencies:
  - @itwin/unified-selection@1.2.1
  - @itwin/presentation-hierarchies@1.4.1

## 1.3.0

### Minor Changes

- [#807](https://github.com/iTwin/presentation/pull/807): Added `getNode` function to tree state hooks to allow getting a node by id.

  Example usage:

  ```tsx
  function MyTreeComponentInternal({ imodelAccess }: { imodelAccess: IModelAccess }) {
    const {
      rootNodes,
      getNode,
      expandNode: doExpandNode,
      ...state
    } = useTree({
      // tree props
    });

    // enhance the default `expandNode` handler to log the action to console
    const expandNode = React.useCallback(
      async (nodeId: string, isExpanded: boolean) => {
        const node = getNode(nodeId);
        if (node) {
          console.log(`${isExpanded ? "Expanding" : "Collapsing"} node: ${node.label}`);
        }
        doExpandNode(nodeId, isExpanded);
      },
      [getNode, doExpandNode],
    );

    // render the tree
    if (!rootNodes || !rootNodes.length) {
      return "No data to display";
    }
    return <TreeRenderer {...state} expandNode={expandNode} rootNodes={rootNodes} />;
  }
  ```

- [#802](https://github.com/iTwin/presentation/pull/802): Prefer `Symbol.dispose` over `dispose` for disposable objects.

  The package contained a number of types for disposable objects, that had a requirement of `dispose` method being called on them after they are no longer needed. In conjunction with the `using` utility from `@itwin/core-bentley`, usage of such objects looked like this:

  ```ts
  class MyDisposable() {
    dispose() {
      // do some cleanup
    }
  }
  using(new MyDisposable(), (obj) => {
    // do something with obj, it'll get disposed when the callback returns
  });
  ```

  In version `5.2`, TypeScript [introduced](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management) `Disposable` type and `using` declarations (from the upcoming [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) feature in ECMAScript). Now we're making use of those new utilities in this package (while still supporting the old `dispose` method), which allows using `MyDisposable` from the above snippet like this:

  ```ts
  using obj = new MyDisposable();
  // do something with obj, it'll get disposed when it goes out of scope
  ```

### Patch Changes

- Updated dependencies:
  - @itwin/unified-selection@1.2.0
  - @itwin/presentation-hierarchies@1.4.0

## 1.2.0

### Minor Changes

- [#795](https://github.com/iTwin/presentation/pull/795): Added `size` property to `TreeNodeRenderer` to improve styling of `small` tree.
- [#791](https://github.com/iTwin/presentation/pull/791): Unify hierarchy updates' handling.

  Previously, we'd only raise the `HierarchyProvider.hierarchyChanged` event on data source changes. The tree state hooks would listen to this event and trigger a hierarchy update. However, there are a few other reasons for the hierarchy to change - changing formatter or active hierarchy filter. In those situations the event was not raised, but tree state hooks still had to trigger hierarchy update. So we ended up with a mix of event-driven and manual hierarchy updates.

  With this change we're clearly stating that a hierarchy provider should trigger its `hierarchyChanged` event whenever something happens that causes the hierarchy to change. That means, the event will be raised when formatter or hierarchy filter is set, and tree state hooks can initiate hierarchy reload from a single place - the `hierarchyChanged` event listener.

  To let event listeners know what caused the hierarchy change, the event now has event arguments, which should be set by the hierarchy provider when raising the event. This allows listeners to customize hierarchy reload logic - for example, our tree state hooks always keep existing tree state except when a new hierarchy filter is set, in which case the existing state is discarded.

### Patch Changes

- [#795](https://github.com/iTwin/presentation/pull/795): Fix tree node loading indicator to match other icons size.
- [#786](https://github.com/iTwin/presentation/pull/786): Bump package dependencies.
- [#794](https://github.com/iTwin/presentation/pull/794): Add missing `ref` to the placeholder and error nodes to have correct styling in virtualized small tree.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.0
  - @itwin/presentation-hierarchies@1.3.0
  - @itwin/unified-selection@1.1.2

## 1.1.3

### Patch Changes

- [#780](https://github.com/iTwin/presentation/pull/780): Avoid double tree load when `getFilteredPaths` are provided during first render.

## 1.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/unified-selection@1.1.1

## 1.1.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@1.2.1

## 1.1.0

### Minor Changes

- [#740](https://github.com/iTwin/presentation/pull/740): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

### Patch Changes

- [#758](https://github.com/iTwin/presentation/pull/758): Promote `@beta` APIs to `@public`.
- [#756](https://github.com/iTwin/presentation/pull/756): Added missing `ref` property to `TreeNodeRendererProps` type.
- Updated dependencies:
  - @itwin/presentation-shared@1.1.0
  - @itwin/unified-selection@1.1.0
  - @itwin/presentation-hierarchies@1.2.0

## 1.0.1

### Patch Changes

- [#734](https://github.com/iTwin/presentation/pull/734): Fixed `onHierarchyLimitExceeded` callback of [tree state hooks](./README.md#tree-state-hooks) being called with incorrect `limit` value.
- Updated dependencies:
  - @itwin/unified-selection@1.0.1
  - @itwin/presentation-hierarchies@1.1.0

## 1.0.0

### Major Changes

- [#727](https://github.com/iTwin/presentation/pull/727): 1.0 release.

  The APIs are now considered stable and ready for production use.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@1.0.0
  - @itwin/presentation-shared@1.0.0
  - @itwin/unified-selection@1.0.0

## 0.8.2

### Patch Changes

- [#724](https://github.com/iTwin/presentation/pull/724): Fixed `@itwin/core-bentley` dependency version to be `^4.9.0`.

## 0.8.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@0.7.1

## 0.8.0

### Minor Changes

- [#708](https://github.com/iTwin/presentation/pull/708): **BREAKING:** A new attribute - `imodelKey` - has been added to `imodelAccess` prop of "use tree" hooks. For the most common case when a hierarchy is built from an `IModelConnection`, it's recommended to use `key` attribute of the connection as this value.

  Example:

  ```ts
  function createHierarchyProvider(imodel: IModelConnection) {
    return createIModelHierarchyProvider({
      imodelAccess: {
        imodelKey: imodel.key, // set the newly introduced `imodelKey` attribute
        // ... other iModel access props
      },
      // ... other provider props
    });
  }
  ```

  See "Basic example" section in README learning page for the full example.

- [#717](https://github.com/iTwin/presentation/pull/717): **BREAKING:** Add support for non-iModel-driven trees.

  - `useTree` and `useUnifiedSelectionTree` hooks have been changed to support non-iModel-driven trees. The hooks take a `getHierarchyProvider` prop, which returns a `HierarchyProvider`. The provider can return data from any data source.
  - New `useIModelTree` and `useIModelUnifiedSelectionTree` hooks have been added to cover the most common case, where a tree is created from a iModel's data. The API of these hooks is exactly the same as of the old `useTree` and `useUnifiedSelectionTree` hooks.

  Reacting to this breaking change is as simple as renaming the calls to `useTree` and `useUnifiedSelectionTree` to `useIModelTree` and `useIModelUnifiedSelectionTree`, respectively.

- [#717](https://github.com/iTwin/presentation/pull/717): **BREAKING:** The `reloadTree` function attribute returned by "use tree" hooks has been changed to **not** accept a `dataSourceChanged` parameter.

  The parameter was used to notify the tree component that the underlying data source has changed and the tree should be reloaded. For example, something like this was necessary:

  ```tsx
  const { reloadTree } = useIModelUnifiedSelectionTree({
    // ...
  });

  useEffect(() => {
    if (!imodel.isBriefcaseConnection()) {
      return;
    }

    return registerTxnListeners(imodel.txns, () => {
      reloadTree({ dataSourceChanged: true });
    });
  }, [imodel, reloadTree]);
  ```

  Now, the `HierarchyProvider` notifies the hook about hierarchy changes.

  Note that iModel-based hierarchy providers require an `imodelChanged` event object to be provided and raised when the underlying iModel changes:

  ```tsx
  const [imodelChanged] = useState(new BeEvent<() => void>());
  useEffect(() => {
    if (imodel.isBriefcaseConnection()) {
      return registerTxnListeners(imodel.txns, () => imodelChanged.raiseEvent());
    }
    return undefined;
  }, [imodel, imodelChanged]);

  const { ... } = useIModelUnifiedSelectionTree({
    imodelChanged,
    ...,
  });
  ```

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@0.7.0

## 0.7.2

### Patch Changes

- [#699](https://github.com/iTwin/presentation/pull/699): Fixed warnings related to passing `ref` to the component that is not wrapped in `forwardRef` function.
- Updated dependencies:
  - @itwin/presentation-hierarchies@0.5.1
  - @itwin/presentation-shared@0.5.0
  - @itwin/unified-selection@0.5.1

## 0.7.1

### Patch Changes

- Updated dependencies:
  - @itwin/unified-selection@0.5.0
  - @itwin/presentation-hierarchies@0.5.0
  - @itwin/presentation-shared@0.4.1

## 0.7.0

### Minor Changes

- [#676](https://github.com/iTwin/presentation/pull/676): `useTree` and `useUnifiedSelectionTree`: Extended return type of `getFilteredPaths` prop to allow specifying whether hierarchy should be expanded to filtering path target.

  With this change, hierarchy is no longer expanded to filter targets by default. To achieve the same behavior, paths with `autoExpand` option should be returned:

  _Before:_

  ```tsx
  async function getFilteredPaths(): Promise<HierarchyNodeIdentifiersPath[]> {
    return paths;
  }
  ```

  _Now:_

  ```tsx
  async function getFilteredPaths(): Promise<Array<{ path: HierarchyNodeIdentifiersPath; options?: { autoExpand?: boolean }>> {
    return paths.map((path) => ({ path, options: { autoExpand: true } }));
  }
  ```

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@0.4.0
  - @itwin/presentation-shared@0.4.0
  - @itwin/unified-selection@0.4.6

## 0.6.0

### Minor Changes

- [#661](https://github.com/iTwin/presentation/pull/661): Added `onHierarchyLoadError` callback to `useTree` and `useUnifiedSelectionTree` that is called when an error occurs while loading hierarchy.

### Patch Changes

- [#660](https://github.com/iTwin/presentation/pull/660): Switch to `onClick` and `onNodeKeyDown` callbacks provided by `TreeNode` in `TreeNodeRenderer`.
- [#655](https://github.com/iTwin/presentation/pull/655): Remove exposed internal APIs.
- Updated dependencies:
  - @itwin/presentation-hierarchies@0.3.0
  - @itwin/unified-selection@0.4.5
  - @itwin/presentation-shared@0.3.2

## 0.5.3

### Patch Changes

- [#649](https://github.com/iTwin/presentation/pull/649): Changed "Clear active filter" button to switch focus to "Apply filter" button when clicked.

## 0.5.2

### Patch Changes

- [#647](https://github.com/iTwin/presentation/pull/647): Correctly detect when `RowsLimitExceededError` is thrown.

## 0.5.1

### Patch Changes

- [#645](https://github.com/iTwin/presentation/pull/645): Fixed node filtering buttons not showing when node is hovered.

## 0.5.0

### Minor Changes

- [#639](https://github.com/iTwin/presentation/pull/639): Added ability to retry loading hierarchy level that failed to load.

### Patch Changes

- [#640](https://github.com/iTwin/presentation/pull/640): Fix keyboard hierarchy navigation and visual issues when nodes are focused.
- [#636](https://github.com/iTwin/presentation/pull/636): Updated `TreeModel` to auto-expand nodes when a filter is applied to them.
- Updated dependencies:
  - @itwin/presentation-hierarchies@0.2.0

## 0.4.3

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@0.1.6

## 0.4.2

### Patch Changes

- [#630](https://github.com/iTwin/presentation/pull/630): Added `getLabel` function to `TreeRenderer` and `TreeNodeRenderer` to allow customizing node labels.
- Updated dependencies:
  - @itwin/presentation-hierarchies@0.1.5
  - @itwin/presentation-shared@0.3.1
  - @itwin/unified-selection@0.4.4

## 0.4.1

### Patch Changes

- [#627](https://github.com/iTwin/presentation/pull/627): Changed `extended` selection mode to not deselect nodes when `ctrl` is not used.
- Updated dependencies:
  - @itwin/presentation-shared@0.3.0
  - @itwin/presentation-hierarchies@0.1.4
  - @itwin/unified-selection@0.4.3

## 0.4.0

### Minor Changes

- [#615](https://github.com/iTwin/presentation/pull/615): Modified `onNodeClick` and `onNodeKeyDown` callbacks to pass node instead of id and changed `onFilterClick` to pass `HierarchyLevelDetails` instead of node id in `TreeNodeRenderer`. This change allows to access additional information about a node (such as `extendedData`) without having to perform a lookup. This change breaks the existing API, so the consuming code needs to be adjusted:

  ```typescript
  import { TreeNodeRenderer } from "@itwin/presentation-hierarchies-react";

  export function MyTreeNodeRenderer(props) {
    return (
      <TreeNodeRenderer
        {...props}
        // Previous implementation
        onNodeClick={(nodeId, isSelected, event) => someFunc(nodeId)}
        onNodeKeyDown={(nodeId, isSelected, event) => someFunc(nodeId)}
        onFilterClick={(nodeId) => {
          const hierarchyLevelDetails = getHierarchyLevelDetails(nodeId);
          someFunc(hierarchyLevelDetails);
        }}

        // After the change
        onNodeClick={(node, isSelected, event) => someFunc(node.id)}
        onNodeKeyDown={(node, isSelected, event) => someFunc(node.id)}
        onFilterClick={(hierarchyLevelDetails) => someFunc(hierarchyLevelDetails)}
      />
    );
  }
  ```

### Patch Changes

- [#624](https://github.com/iTwin/presentation/pull/624): Reset tree state when filter is applied on hierarchy.
- Updated dependencies:
  - @itwin/presentation-hierarchies@0.1.3

## 0.3.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@0.1.2

## 0.3.0

### Minor Changes

- [#605](https://github.com/iTwin/presentation/pull/605): Added `onHierarchyLimitExceeded` callback to `useTree` and `useUnifiedSelectionTree` for tracking when hierarchy level exceeds the limit.

  ```typescript
  import { TreeRenderer, useTree } from "@itwin/presentation-hierarchies-react";

  function MyTree(props: MyTreeProps) {
    const state = useTree({
      ...props,
      onHierarchyLimitExceeded: ({ nodeId, filter, limit }) => {
        console.log(`Hierarchy limit of ${limit} exceeded for node ${nodeId}.`);
      }
    });
    return <TreeRenderer {...state} />;
  }
  ```

- [#607](https://github.com/iTwin/presentation/pull/607): Added `dataSourceChanged` option to `reloadTree` function retuned by `useTree` and `useUnifiedSelectionTree`. It allows to specify that data used to build the tree might have changed and need to be repulled when reloading the hierarchy.

  ```ts
  import { registerTxnListeners } from "@itwin/presentation-core-interop";

  function MyTree({ imodel, ...props}: Props) {
    const { reloadTree, treeProps } = useTree(props);
    useEffect(() => {
      // listen for changes in iModel and reload tree
      return registerTxnListeners(imodel.txns, () => {
        reloadTree({ dataSourceChanged: true });
      });
    }, [imodel, reloadTree]);
    return <TreeRenderer {...treeProps} />;
  }
  ```

## 0.2.0

### Minor Changes

- [#600](https://github.com/iTwin/presentation/pull/600): Added `onPerformanceMeasured` callback to `useTree` and `useUnifiedSelectionTree` for performance metrics reporting. This callback is invoked for `initial-load`, `hierarchy-level-load` and `reload` actions.

  ```typescript
  import { TreeRenderer, useTree } from "@itwin/presentation-hierarchies-react";

  function MyTree(props: MyTreeProps) {
    const state = useTree({
      ...props,
      onPerformanceMeasured: (action, duration) => {
        telemetryClient.log(`MyTree [${feature}] took ${duration} ms`);
      }
    });
    return <TreeRenderer {...state} />;
  }
  ```

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-hierarchies@0.1.1

## 0.1.0

### Minor Changes

- [#587](https://github.com/iTwin/presentation/pull/587): Initial release.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.2.0
  - @itwin/unified-selection@0.4.2
  - @itwin/presentation-hierarchies@0.1.0
