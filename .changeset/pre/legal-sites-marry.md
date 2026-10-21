---
"@itwin/presentation-hierarchies": major
---

Fixed a bug causing `HierarchyNode.autoExpand` flag to be set on non-grouping nodes, when `HierarchyFilteringPathOptions.autoExpand.depthInHierarchy` points to a grouping node whose child non-grouping node is not a filter target.

**Breaking changes:**

- `GroupingHierarchyNode` no longer contains `filtering` attribute. This was always the case, but now the types have been updated to match it.
- Changed return type of `createHierarchyFilteringHelper`:
  - Removed `createChildNodePropsAsync` - it became an overload of `createChildNodeProps`, whose path matching is done through `asyncPathMatcher` callback.
  - `createChildNodeProps` now has multiple overloads and returns different types based on provided props. `autoExpand` flag is only returned when `parentKeys` are provided.
- Renamed `HierarchyFilteringPathOptions.autoExpand` -> `HierarchyFilteringPathOptions.reveal` to match intent.
- Changed `HierarchyFilteringPathOptions.reveal.depthInHierarchy` and `depthInPath` to use 0-based indexing instead of 1-based indexing.
- Changed `HierarchyFilteringPathOptions.reveal.depthInHierarchy` to not set `autoExpand` flag on the node that is at the `depthInHierarchy` position.
