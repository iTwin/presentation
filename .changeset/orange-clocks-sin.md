---
"@itwin/presentation-hierarchies-react": minor
---

Modified `onNodeClick` and `onNodeKeyDown` callbacks to pass node instead of id and changed `onFilterClick` to pass `HierarchyLevelDetails` instead of node id in `TreeNodeRenderer`. This change allows to access additional information about a node (such as `extendedData`) without having to perform a lookup. This change breaks the existing API, so the consuming code needs to be adjusted:

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
