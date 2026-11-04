---
"@itwin/presentation-hierarchies-react": patch
---

`StrataKitTreeRenderer`: Nodes are now scrolled to the center of the viewport when navigating to a node from the errors list or via `renameNode`. Previously, the node could end up at the top edge of the tree and be hidden behind the expanded errors region.
