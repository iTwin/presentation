---
"@itwin/presentation-hierarchies": minor
---

Increased the speed of hierarchy filtering with large number of filtered paths.

| Amount of paths | Before the change | After the change |
| --- | ---------- | --------- |
| 500 | 960.18 ms  | 233.65 ms |
| 1k  | 2.29 s     | 336.81 ms |
| 10k | 232.55 s   | 2.17 s    |
| 50k | not tested | 13.45 s   |

In addition, changed `NodeParser` (return type of `HierarchyDefinition.parseNode`):

- It now can return a promise, so instead of just `SourceInstanceHierarchyNode` it can now also return `Promise<SourceInstanceHierarchyNode>`.
- Additionally, it now accepts an optional `parentNode` argument of `HierarchyDefinitionParentNode` type.
