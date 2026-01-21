---
"@itwin/presentation-hierarchies-react": major
---

Clean up `TreeErrorRenderer` and `ErrorItemRenderer`.

**Breaking changes:**

- Error items returned by `useErrorList` hook no longer have the `expandTo` function. Expanding to error nodes is now done completely internally, so consumers don't need to call this function anymore.

- The `reloadTree` function prop in `ErrorItemRenderer` and `TreeErrorRenderer` components no longer takes the `state` option. The option was required and always had the same value, so it was redundant.

- Renamed `onFilterClick` -> `filterHierarchyLevel` in `ErrorItemRenderer`, `TreeErrorRenderer` and `StrataKitTreeRenderer` components. This makes its name consistent with other function props ("do something" vs "on something happened").

- Renamed `scrollToElement` -> `scrollToNode` in `ErrorItemRenderer` and `TreeErrorRenderer`, and changed its type to take `TreeNode` instead of an error item returned by `useErrorList` hook.
