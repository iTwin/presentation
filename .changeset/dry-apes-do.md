---
"@itwin/presentation-hierarchies-react": major
---

Added ability to enter node rename mode programmatically through `StrataKitTreeRenderer` ref. The `renameNode` method accepts a predicate function to identify the target node. If the node is not visible (because its parent is collapsed), all parents will be expanded automatically to make it visible and the node will be scrolled into view.

Example:
```tsx
import { StrataKitTreeRenderer, StrataKitTreeRendererAttributes } from "@itwin/presentation-hierarchies-react";

function MyTree() {
  const treeRef = useRef<StrataKitTreeRendererAttributes>(null);

  return (
    <>
      <div className="tree-header">
        <button
          onClick={() => {
            treeRef.current?.renameNode((node) => node.label === "Node to rename");
          }}
        >
          Rename node
        </button>
      </div>
      <StrataKitTreeRenderer ref={treeRef} />
    </>
  );
}
```

**Breaking changes**

- `StrataKitTreeNodeRenderer` is no longer exported.
- `RenameContextProvider` is no longer exported. It is not necessary when using `StrataKitTreeRenderer`.
- `RenameAction` now requires a `node` prop.
