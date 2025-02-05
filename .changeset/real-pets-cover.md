---
"@itwin/presentation-hierarchies-react": patch
---

`TreeRenderer` and `TreeNodeRenderer` now take actions as specification function array.

- `label`: Action item's label.
- `action`: The action performed when the button is clicked.
- `show` A boolean determining whether the button should be displayed.
- `isDropdownAction`: Specifies whether the action is rendered as a dropdown menu item or a standalone button.
- `icon`: The button's icon.
