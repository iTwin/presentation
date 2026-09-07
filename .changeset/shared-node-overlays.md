---
"@itwin/presentation-hierarchies-react": patch
---

`TreeRenderer`: improved tree node rendering performance by moving per-node overlays to the tree level. Instead of every node mounting its own context menu and label editing popover, the tree now renders a single shared context menu and a single label editor positioned at the renamed node's location.
