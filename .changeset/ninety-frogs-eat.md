---
"@itwin/presentation-hierarchies-react": minor
---

Changed `onHierarchyLoadError` callback in `UseTreeProps`, it now accepts error as one of the props arguments. Hierarchy load errors are now logged by default (using presentation-hierarchies logger) in `useUnifiedSelectionTree` and `useTree` when `onHierarchyLoadError` callback is not provided.
