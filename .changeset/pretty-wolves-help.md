---
"@itwin/presentation-hierarchies-react": minor
---

**BREAKING:** Add support for non-iModel-driven trees.

- `useTree` and `useUnifiedSelectionTree` hooks have been changed to support non-iModel-driven trees. The hooks take a `getHierarchyProvider` prop, which returns a `HierarchyProvider`. The provider can return data from any data source.

- New `useIModelTree` and `useIModelUnifiedSelectionTree` hooks have been added to cover the most common case, where a tree is created from a iModel's data. The API of these hooks is exactly the same as of the old `useTree` and `useUnifiedSelectionTree` hooks.

Reacting to this breaking change is as simple as renaming the calls to `useTree` and `useUnifiedSelectionTree` to `useIModelTree` and `useIModelUnifiedSelectionTree`, respectively.
