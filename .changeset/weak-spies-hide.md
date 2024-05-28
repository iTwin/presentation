---
"@itwin/presentation-hierarchies-react": minor
---

Added `onPerformanceMeasured` callback to `useTree` and `useUnifiedSelectionTree` for performance metrics reporting. This callback is invoked for `initial-load`, `hierarchy-level-load` and `reload` actions.

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
