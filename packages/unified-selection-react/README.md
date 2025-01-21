# @itwin/unified-selection-react

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/unified-selection-react` package provides React APIs for conveniently using the [@itwin/unified-selection](https://github.com/iTwin/presentation/blob/master/packages/unified-selection/README.md)
package in React applications and components.

## React context for unified selection

There are two ways to pass data to React components - through props or context. While the former is preferred, the latter [also has its uses](https://react.dev/reference/react/useContext#passing-data-deeply-into-the-tree). One caveat about React contexts is that context provider and context consumer MUST use the exact same context object. This package delivers a unified selection React context exactly for this reason - it allows context providers and consumers, which may come from different packages and have no direct dependency on each other, to share the same selection storage.

Example usage:

<!-- [[include: [Presentation.UnifiedSelectionReact.Context.Imports, Presentation.UnifiedSelectionReact.Context.Example], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { createStorage, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { UnifiedSelectionContextProvider, useUnifiedSelectionContext } from "@itwin/unified-selection-react";

/** A top-level component that creates the selection storage and sets up the context provider for all inner components to use */
function App() {
  const [selectionStorage] = useState(() => createStorage());
  const idCounter = useRef(0);
  return (
    <UnifiedSelectionContextProvider storage={selectionStorage}>
      <button
        onClick={() =>
          selectionStorage.addToSelection({
            imodelKey,
            source: "my-button",
            selectables: [{ className: "BisCore.Element", id: `0x${++idCounter.current}` }],
          })
        }
      >
        Select an element
      </button>
      <MyComponent />
    </UnifiedSelectionContextProvider>
  );
}

/** An internal component that takes unified selection storage from context and prints the number of selected elements */
function MyComponent() {
  const selectionContext = useUnifiedSelectionContext();
  if (!selectionContext) {
    throw new Error("Unified selection context is not available");
  }

  function getSelectedElementsCount(storage: SelectionStorage) {
    return Selectables.size(storage.getSelection({ imodelKey }));
  }

  const [selectedElementsCount, setSelectedElementsCount] = useState(() => getSelectedElementsCount(selectionContext.storage));
  useEffect(() => {
    return selectionContext.storage.selectionChangeEvent.addListener(() => {
      setSelectedElementsCount(getSelectedElementsCount(selectionContext.storage));
    });
  }, [selectionContext.storage]);
  return `Number of selected elements: ${selectedElementsCount}`;
}
```

<!-- END EXTRACTION -->

For the above to work, both - context provider and consumer - must use the same dependency of this package (see [symptoms here](https://react.dev/reference/react/useContext#troubleshooting) for when they don't do that). One way to ensure this is to have the following set up:

- Context provider should have a direct dependency on this, as well as the `@itwin/unified-selection`, packages.
- Context consumer should have a peer dependency on this package. This way, the consumer will use the same version of the context as the provider.
