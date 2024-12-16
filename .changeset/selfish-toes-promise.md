---
"@itwin/presentation-hierarchies-react": minor
---

Added `getNode` function to tree state hooks to allow getting a node by id.

Example usage:

```tsx
function MyTreeComponentInternal({ imodelAccess }: { imodelAccess: IModelAccess }) {
  const { rootNodes, getNode, expandNode: doExpandNode, ...state } = useTree({
    // tree props
  });

  // enhance the default `expandNode` handler to log the action to console
  const expandNode = React.useCallback(async (nodeId: string, isExpanded: boolean) => {
    const node = getNode(nodeId);
    if (node) {
      console.log(`${isExpanded ? "Expanding" : "Collapsing"} node: ${node.label}`);
    }
    doExpandNode(nodeId, isExpanded);
  }, [getNode, doExpandNode]);

  // render the tree
  if (!rootNodes || !rootNodes.length) {
    return "No data to display";
  }
  return <TreeRenderer {...state} expandNode={expandNode} rootNodes={rootNodes} />;
}
```
