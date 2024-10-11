---
"@itwin/presentation-hierarchies": minor
---

Increased the speed of hierarchy filtering with large number of filtered paths.

- Changed `NodeParser` (`HierarchyDefinition.parseNode`):
  - It now can return a promise, so instead of just `SourceInstanceHierarchyNode` it can now also return `Promise<SourceInstanceHierarchyNode>`.
  - Additionally, it now accepts an optional `parentNode` argument of `HierarchyDefinitionParentNode` type.
