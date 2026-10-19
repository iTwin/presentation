---
"@itwin/presentation-hierarchies-react": major
---

The `getInlineActions`, `getMenuActions` and `getContextMenuActions` callbacks of `StrataKitTreeRenderer` receive `{ targetNode: TreeNode; selectedNodes: TreeNode[] }` props, allowing actions to be applied to all selected nodes.

```tsx
return <StrataKitTreeRenderer
  getInlineActions={({ targetNode }) => [
    <InlineAction node={targetNode} />
  ]}
  getMenuActions={({ targetNode }) => [
    <MenuAction node={targetNode} />
  ]}
/>
```
