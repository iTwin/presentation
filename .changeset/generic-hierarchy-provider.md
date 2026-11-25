---
"@itwin/presentation-hierarchies": minor
---

`HierarchyProvider`: Added an optional `TParentNode` type parameter to `HierarchyProvider` and `GetHierarchyNodesProps`, which allows providers to narrow the type of parent nodes they accept in `getNodes` and `getNodeInstanceKeys` calls. It defaults to `ParentHierarchyNode`, so existing usages are unaffected.
