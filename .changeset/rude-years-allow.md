---
"@itwin/presentation-components": major
---

Tree: Added interactive and more detailed informational messages in the tree and its hierarchy level filtering components:

- When a hierarchy level size exceeds given limit, a message is displayed, suggesting the results should be filtered to reduce the result set.
- The hierarchy level filtering dialog informs whether provided filters reduce the result set to a small enough size to be displayed in the tree.

Includes 2 breaking `@beta` API changes:

- `PresentationTreeNodeRenderer` now takes `onClearFilterClick` and `onFilterClick` callback props with node identifier argument rather than `PresentationTreeNodeItem`. This was a necessary change to allow opening filtering dialog for a parent node from its child node. To react to this breaking change:

  *before*

  ```tsx
  <PresentationTreeNodeRenderer
    {...nodeProps}
    onFilterClick={(node: PresentationTreeNodeItem) => {
      applyFilter(node);
    }}
  />
  ```

  *after*

  ```tsx
  <PresentationTreeNodeRenderer
    {...nodeProps}
    onFilterClick={(nodeId: string) => {
      const node = modelSource.getModel().getNode(nodeId);
      if (isTreeModelNode(node) && isPresentationTreeNodeItem(node.item)) {
        applyFilter(node.item);
      }
    }}
  />
  ```

- `useHierarchyLevelFiltering` hook's result now contains functions `applyFilter` and `clearFilter` that take node identifier argument rather than a `TreeNodeItem`. The change was made to help reacting to the above `PresentationTreeNodeRenderer` change by requiring the same types of arguments as what `onClearFilterClick` and `onFilterClick` get. In case these functions are used outside of `PresentationTreeNodeRenderer` workflows, reacting to the breaking change is as follows:

  *before*

  ```tsx
  const { applyFilter } = useHierarchyLevelFiltering({ nodeLoader, modelSource });
  const [filterNode, setFilterNode] = useState<PresentationTreeNodeItem>();
  const onFilterButtonClick = () => {
    if (filterNode) {
      applyFilter(filterNode);
    }
  }
  ```

  *after*

  ```tsx
  const { applyFilter } = useHierarchyLevelFiltering({ nodeLoader, modelSource });
  const [filterNodeId, setFilterNodeId] = useState<string>();
  const onFilterButtonClick = () => {
    if (filterNodeId) {
      applyFilter(filterNodeId);
    }
  }
  ```
