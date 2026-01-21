---
"@itwin/presentation-hierarchies-react": minor
---

Fixed selection handling in `StrataKitTreeRenderer`. Mouse double clicks now correctly ignored to prevent rapid selection toggling. Keyboard selection using `Space` and `Enter` keys is working.

**Breaking changes**

- `useSelectionHandler` is no longer exported. This function is an internal implementation detail of `StrataKitTreeRenderer` and should not be used directly.
