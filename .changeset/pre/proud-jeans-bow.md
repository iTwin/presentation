---
"@itwin/presentation-hierarchies-react": patch
---

Adjust how `useTree` and other variants of it determines `isReloading` value. `isReloading` is now set to `true` if root nodes are being loaded.
