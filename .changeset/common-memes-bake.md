---
"@itwin/presentation-hierarchies-react": major
---

Pass selected nodes to tree node action getters to support actions that should be applied on all selected nodes.

**Breaking changes**
- `StrataKitTreeRenderer.getInlineActions` callback receives `{ targetNode: PresentationHierarchyNode; selectedNodes: PresentationHierarchyNode[] }` props instead of `PresentationHierarchyNode`.
- `StrataKitTreeRenderer.getMenuActions` callback receives `{ targetNode: PresentationHierarchyNode; selectedNodes: PresentationHierarchyNode[] }` props instead of `PresentationHierarchyNode`.

Before
```tsx
return <StrataKitTreeRenderer
  getInlineActions={(node) => [
    <InlineAction node={node} />
  ]}
  getMenuActions={(node) => [
    <MenuAction node={node} />
  ]}
/>
```

After
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
