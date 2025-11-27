---
"@itwin/presentation-hierarchies": major
---

Fixed `depthInHierarchy` setting `autoExpand` flag for non grouping nodes. This was happening when `depthInHierarchy` points to a grouping node that is between two non grouping nodes and the non grouping node is not a filter target.

To achieve this, `autoExpand` is now determined in post processing step.

**API changes**

Changed `NodePostProcessor` to now accept an optional second argument: `parentNode` of `ParentHierarchyNode` type.

**Breaking changes**

- Changed return type of `createHierarchyFilteringHelper`:
  - Removed `createChildNodePropsAsync`.
  - Merged `createChildNodePropsAsync` into `createChildNodeProps`. Where `pathMatcher` prop from `createChildNodePropsAsync` was renamed to `asyncPathMatcher`.
  - `createChildNodeProps` now returns different types based on provided props. `createChildNodeProps` returns `autoExpand` flag only if `parentKeys` are provided.
- Renamed: `FilteringPathAutoExpandDepthInHierarchy` -> `FilteringPathRevealDepthInHierarchy`; `FilteringPathAutoExpandDepthInPath` -> `FilteringPathRevealDepthInPath`; `HierarchyFilteringPathOptions.autoExpand` -> `HierarchyFilteringPathOptions.reveal`
- Changed `depthInHierarchy` and `depthInPath` to use 0-Based indexing instead of 1-Based Indexing.
- Changed `depthInHierarchy` to not set `autoExpand` flag on the node that is at the `depthInHierarchy` position.
