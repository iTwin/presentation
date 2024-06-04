---
"@itwin/presentation-hierarchies-react": minor
---

Modified `onNodeClick` and `onNodeKeyDown` callbacks to pass entire node instead of id in `TreeNodeRenderer`. This change breaks the existing API, so the consuming code needs to be adjusted to use `node.id` instead of `nodeId`:

```typescript
import { TreeNodeRenderer } from "@itwin/presentation-hierarchies-react";

export function MyTreeNodeRenderer(props) {
  return (
    <TreeNodeRenderer
      {...props}
      // Previous implementation
      onNodeClick={(nodeId, isSelected, event) => someFunc(nodeId)}
      onNodeKeyDown={(nodeId, isSelected, event) => someFunc(nodeId)}

      // After the change
      onNodeClick={(node, isSelected, event) => someFunc(node.id)}
      onNodeKeyDown={(node, isSelected, event) => someFunc(node.id)}
    />
  );
}
```
