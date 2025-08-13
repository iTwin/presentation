---
"@itwin/presentation-hierarchies-react": patch
---

Added a react hook `useNodeHighlighting` that helps create highlighted node labels based on provided highlight.

Example usage:

```ts
import { StrataKitTreeRenderer, useNodeHighlighting } from "@itwin/presentation-hierarchies-react";
import type { BaseTreeRendererProps } from "@itwin/tree-widget-react";

function MyComponent(props: BaseTreeRendererProps & { searchText: string }) {
  // Create highlight based on searchText
  const highlight = useMemo(() => (props.searchText ? { text: props.searchText } : undefined), [props.searchText]);
  const { getLabel } = useNodeHighlighting({ rootNodes: props.rootNodes, highlight });

  // Provide getLabel function to tree renderer
  return <StrataKitTreeRenderer {...props} getLabel={getLabel} />;
}
```
