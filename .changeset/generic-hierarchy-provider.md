---
"@itwin/presentation-hierarchies": minor
---

`HierarchyProvider`: Added an optional `TNode` type parameter, which allows providers to narrow the type of nodes they return from `getNodes`. Parent nodes accepted by `getNodes` and `getNodeInstanceKeys` are narrowed accordingly. It defaults to `HierarchyNode`, so existing usages are unaffected.

Also added an optional `TParentNode` type parameter to `GetHierarchyNodesProps`, which narrows the type of its `parentNode` attribute. It defaults to `ParentHierarchyNode`.
