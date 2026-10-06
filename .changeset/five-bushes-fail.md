---
"@itwin/presentation-hierarchies-react": minor
---

Renamed the `isReloading` attribute back to `isLoading` in the result of the `useTree`, `useUnifiedSelectionTree`, `useIModelTree`, and `useIModelUnifiedSelectionTree` hooks. The attribute is `true` while root nodes are being loaded or search paths are being resolved, including the initial load.
