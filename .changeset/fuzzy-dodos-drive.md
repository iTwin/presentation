---
"@itwin/presentation-hierarchies": minor
---

Refactored specifying the depth / level to which filtering path should be auto-expanded.

- Deprecated `FilteringPathAutoExpandOption` and `FilterTargetGroupingNodeInfo`.
- Added `FilteringPathAutoExpandDepthInPath` and  `FilteringPathAutoExpandDepthInHierarchy` which should be used instead.

Migration:

```ts
const pathExpandedToInstanceInPath: HierarchyFilteringPath = {
  path: [instanceKey1, instanceKey2, instanceKey3],
  options: {
    // deprecated:
    autoExpand: { depth: 1 },
    // do this instead:
    autoExpand: { depthInPath: 1 },
  },
};

const pathExpandedToGroupingNode: HierarchyFilteringPath = {
  path: [instanceKey1, instanceKey2, instanceKey3],
  options: {
    // deprecated:
    autoExpand: { depth: 1, key: groupingNodeKey },
    // also deprecated:
    autoExpand: { depth: 1, includeGroupingNodes: true },
    // do this instead:
    autoExpand: { depthInHierarchy: 1 },
  },
};
```
