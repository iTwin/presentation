---
"@itwin/presentation-hierarchies-react": minor
---

Introduced `getTreeItemProps` and `treeRootProps` to `StrataKitTreeRenderer`. This allows passing props to underlying `Tree.Item` and `Tree.Root` components.

**Breaking changes**

`StrataKitTreeNodeRenderer` props changes:
- `getMenuActions` callback changed to `menuActions` prop (type: `ReactNode[]`)
- `getInlineActions` callback changed to `inlineActions` prop (type: `ReactNode[]`)
- `getContextMenuActions` callback changed to `contextMenuActions` prop (type: `ReactNode[]`)
- `getLabel` callback removed - use `label` prop instead
- `getSublabel` callback removed - use `description` prop instead
- `getDecorations` callback removed - use `decorations` prop instead
- `getClassName` callback removed - use `className` prop instead
- `onNodeClick` and `onNodeKeyDown` callbacks removed - use `onClick` and `onKeyDown` props instead

`StrataKitTreeRenderer` props changes:
- Props previously passed to `StrataKitTreeNodeRenderer` are no longer accepted
- Use `getTreeItemProps` callback to provide props to specific `Tree.Item` components
- Use `getMenuActions`, `getInlineActions`, and `getContextMenuActions` on `StrataKitTreeRenderer` to provide actions for nodes
