---
"@itwin/presentation-hierarchies-react": major
---

Unified tree actions handling to make it easier defining actions that could be reused in different contexts: `inline`, `context menu` and `actions dropdown`.

**Breaking changes**

- Removed `reserveSpace` property from `RenameActions` and `FilterAction`. These actions now automatically infer context where they are used.
- Added requirement to render newly introduced `TreeActionBase` component instead of `Tree.ItemAction` when rendering custom tree actions.
