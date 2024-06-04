# @itwin/presentation-hierarchies-react

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
