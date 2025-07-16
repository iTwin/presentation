---
"@itwin/presentation-hierarchies-react": minor
---

Renames:
    `FlatNode` => `FlatTreeNodeItem`
    `FlatTreeNode` => `FlatTreeItem`
    `PlaceholderNode` => `PlaceholderItem`
    `useFlatTreeNodeList` => `useFlatTreeItems`

Changed `FlatTreeNodeItem` (previously `FlatNode`) to have property `node: PresentationHierarchyNode` instead of extending  `PresentationHierarchyNode`.
