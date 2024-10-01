---
"@itwin/presentation-hierarchies-react": minor
---

A new attribute - `imodelKey` - has been added to `imodelAccess` prop of `useTree` and `useUnifiedSelectionTree` hooks. For the most common case when a hierarchy is built from an `IModelConnection`, it's recommended to use `key` attribute of the connection as this value.
