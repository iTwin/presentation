---
"@itwin/presentation-hierarchies": patch
---

Change `createHierarchyFilteringHelper` to set `autoExpand` flag on filter targets when `HierarchyFilteringPathOption.autoExpand.depthInPath` is greater than path length or `HierarchyFilteringPathOption.autoExpand.depthInHierarchy` is greater than filter targets position in the hierarchy.
