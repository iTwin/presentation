# @itwin/presentation-hierarchies-react

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
