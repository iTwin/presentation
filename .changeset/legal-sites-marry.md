---
"@itwin/presentation-hierarchies": major
---

Fixed `depthInHierarchy` setting `autoExpand` flag for non grouping nodes. This was happening when `depthInHierarchy` points to a grouping node that is between two non grouping nodes and the non grouping node is not a filter target.

To achieve this, `autoExpand` is now determined in post processing step.

**API Additions**
Changed the return type of `createHierarchyFilteringHelper`, it also returns these functions:
- createChildNodeAutoExpandProp
- createChildNodeAutoExpandPropAsync
- createChildNodeFilteringProp
- createChildNodeFilteringPropAsync

**Breaking changes**

- Changed props of `createChildNodeProps` and `createChildNodePropsAsync` functions, that are returned by `createHierarchyFilteringHelper`. The props now have required `parentKeys` attribute.
- Changed `depthInHierarchy` and `depthInPath` to use 0-Based indexing instead of 1-Based Indexing.
- Changed `depthInHierarchy` to not set `autoExpand` flag on the node that is at the `depthInHierarchy` position.
