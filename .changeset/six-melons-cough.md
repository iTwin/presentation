---
"@itwin/presentation-hierarchies-react": patch
---

Added a react hook `useNodeHighlighting` that helps create highlighted node labels based on provided text that should be highlighted.

Example usage:

```ts
import { StrataKitTreeRenderer, useNodeHighlighting } from "@itwin/presentation-hierarchies-react";

type BaseTreeRendererProps = React.ComponentPropsWithoutRef<typeof StrataKitTreeRenderer>;

function MyComponent(props: BaseTreeRendererProps & { searchText: string }) {
  // Create highlight based on searchText
  const highlightText = props.searchText !== "" ? props.searchText : undefined;
  const { getLabel } = useNodeHighlighting({ highlightText });

  // Provide getLabel function to tree renderer
  return <StrataKitTreeRenderer {...props} getLabel={getLabel} />;
}
```
