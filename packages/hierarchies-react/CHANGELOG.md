# @itwin/presentation-hierarchies-react

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
