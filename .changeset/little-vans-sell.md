---
"@itwin/presentation-hierarchies-react": minor
---

Added `filterButtonsVisibility` to `treeNodeRenderer`. Which allows configuring filter buttons visibility for the whole tree.
    `show-on-hover` - default value, shows filter buttons on node hover or focus.
    `hide` - hides filter buttons on focus and hover, but will continue to show buttons on nodes in which filter is applied. Reaching hierarchy limit will continue to provide a way to filter nodes.
