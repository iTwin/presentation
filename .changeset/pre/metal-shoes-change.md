---
"@itwin/presentation-hierarchies-react": minor
---


Tree node renderer now uses `Tree.ItemAction`. `Show` property now takes in undefined values, values behave like this:

- `undefined` - visible on hover/focus,
- `true` - visible at all times,
- `false` - hidden at all times.

Updated peer dependencies:

- itwinui-icons to 5.0.0-alpha.3,
- itwinui-react to 5.0.0-alpha.6,
