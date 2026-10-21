---
"@itwin/presentation-hierarchies-react": major
---

`StrataKitTreeRenderer` exposes per-node action callbacks `getInlineActions`, `getMenuActions` and `getContextMenuActions`. Each receives `{ targetNode: TreeNode; selectedNodes: TreeNode[] }`, so actions can be applied to the target node or to all selected nodes.

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
