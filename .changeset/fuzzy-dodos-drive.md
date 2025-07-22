---
"@itwin/presentation-hierarchies": minor
---

Deprecated `FilteringPathAutoExpandOption` and `FilterTargetGroupingNodeInfo`, added `FilteringPathAutoExpandDepthInPath` and  `FilteringPathAutoExpandDepthInHierarchy` which should be used instead.

**Before:**

```ts
const options1: FilterTargetGroupingNodeInfo = {
  key: { type: "label-grouping", label: "" },
  depth: 1,
};
const options2: FilteringPathAutoExpandOption = {
  depth: 2,
  includeGroupingNodes: true
};
const options3: FilteringPathAutoExpandOption = {
  depth: 3,
};
```

**After:**

```ts
const options1: FilteringPathAutoExpandDepthInHierarchy = {
  depthInHierarchy: 1,
};
const options2: FilteringPathAutoExpandDepthInHierarchy = {
  depthInHierarchy: 2,
};
const options3: FilteringPathAutoExpandDepthInPath = {
  depthInPath: 3,
};
```
