---
"@itwin/presentation-hierarchies-react": minor
---

Add ability to customize `Selectable` objects that are added to unified selection, when a generic node in a unified selection-driven tree component is selected.

By default, when a generic node is selected in a unified selection-driven tree component, the `Selectable` that is created for it gets a per-tree unique identifier. This means that a similar generic node somewhere else in the tree or a different tree will not be considered the same. However, in some cases we do want generic nodes to be treated as the same, and for that matter unified selection-enabling tree state hooks now have a new `createSelectableForGenericNode` option:

```tsx
import { useUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";

const treeState = useUnifiedSelectionTree({
    selectionStorage,
    createSelectableForGenericNode: useCallback<NonNullable<Props<typeof useUnifiedSelectionTree>["createSelectableForGenericNode"]>>(
        (node, uniqueId) => ({ identifier: node.key.id, data: node, async *loadInstanceKeys() {} }),
        [],
    ),
  // ...other options
});
```
