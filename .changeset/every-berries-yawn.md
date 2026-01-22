---
"@itwin/presentation-hierarchies-react": major
---

Clean up `TreeErrorRenderer` and `ErrorItemRenderer`.

**Breaking changes:**

- Replaced `useErrorList` hook with `useErrorNodes` hook that returns error nodes (`TreeNode[]`) instead of error items. The `expandTo` function became unnecessary, because expanding to error nodes is now handled internally. As a result, the whole `ErrorItem` type (result of `useErrorList`) was removed. Reacting to this, the following other breaking changes were made:
  - Renamed `errorItem` -> `errorNode` in `ErrorItemRenderer` component and changed the type from removed `ErrorItem` to `TreeNode`.
  - Renamed `errorList` -> `errorNodes` in `TreeErrorRenderer` component and changed the type from `ErrorItem[]` to `TreeNode[]`.
- The `reloadTree` function prop in `ErrorItemRenderer` and `TreeErrorRenderer` components no longer takes the `state` option. The option was required and always had the same value, so it was redundant.
- Renamed `onFilterClick` -> `filterHierarchyLevel` in `ErrorItemRenderer`, `TreeErrorRenderer` and `StrataKitTreeRenderer` components. This makes its name consistent with other function props ("do something" vs "on something happened").
- Renamed `scrollToElement` -> `scrollToNode` in `ErrorItemRenderer` and `TreeErrorRenderer`, and changed its type to take `TreeNode` instead of an error item returned by `useErrorList` hook.
