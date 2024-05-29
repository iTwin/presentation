---
"@itwin/presentation-hierarchies-react": minor
---

Added `onHierarchyLimitExceeded` callback to `useTree` and `useUnifiedSelectionTree` for tracking when hierarchy level exceeds the limit.

```typescript
import { TreeRenderer, useTree } from "@itwin/presentation-hierarchies-react";

function MyTree(props: MyTreeProps) {
  const state = useTree({
    ...props,
    onHierarchyLimitExceeded: () => {
      console.log(`Hierarchy limit exceeded`);
    }
  });
  return <TreeRenderer {...state} />;
}
```
