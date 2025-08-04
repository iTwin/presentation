---
"@itwin/presentation-hierarchies-react": minor
---

Updated peer dependencies:

- `@stratakit/bricks`: 0.2.0 => 0.3.3
- `@stratakit/foundations`: 0.1.3 => 0.2.2
- `@stratakit/structures`: 0.1.1 => 0.3.1

`StrataKitTreeRenderer` & `StrataKitTreeNoeRenderer` changes:

- `getActions` was split into `getMenuActions` & `getInlineActions`. New properties maintain the same type.

`FilterAction` & `RenameAction` changes:

- added `inline` property, which informs the action that it is inline.
