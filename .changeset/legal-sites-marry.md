---
"@itwin/presentation-hierarchies": major
---

Fixed a bug where `HierarchyFilteringPathOptions.autoExpand.depthInHierarchy` would cause `HierarchyNode.autoExpand` flag to be present in non grouping nodes, when it shouldn't. This was happening when `HierarchyFilteringPathOptions.autoExpand.depthInHierarchy` points to a grouping node that has a child non-grouping node and the non-grouping node is not a filter target.

To fix this bug, `HierarchyNode.autoExpand` flag is now determined in post processing step.

**Breaking changes**

- `BaseHierarchyNode` no longer contains `filtering` attribute. It was moved to `NonGroupingHierarchyNode` interface.
- Changed return type of `createHierarchyFilteringHelper`:
  - Removed `createChildNodePropsAsync`.
  - Merged `createChildNodePropsAsync` into `createChildNodeProps`. Where `pathMatcher` prop from `createChildNodePropsAsync` was renamed to `asyncPathMatcher`.
  - `createChildNodeProps` now returns different types based on provided props. `createChildNodeProps` returns `autoExpand` flag only if `parentKeys` are provided.
- Renamed: `FilteringPathAutoExpandDepthInHierarchy` -> `FilteringPathRevealDepthInHierarchy`; `FilteringPathAutoExpandDepthInPath` -> `FilteringPathRevealDepthInPath`; `HierarchyFilteringPathOptions.autoExpand` -> `HierarchyFilteringPathOptions.reveal`
- Changed `depthInHierarchy` and `depthInPath` to use 0-Based indexing instead of 1-Based Indexing.
- Changed `depthInHierarchy` to not set `autoExpand` flag on the node that is at the `depthInHierarchy` position.
