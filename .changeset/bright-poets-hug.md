---
"@itwin/presentation-hierarchies": patch
---

Fixed `HierarchyFilteringPathOptions.autoExpand` depth option not working properly with grouping nodes. Added `includeGroupingNodes` attribute to `FilteringPathAutoExpandOption`, which allows auto-expanding only desired gouping nodes, when set together with `depth` value.
