---
"@itwin/presentation-hierarchies": minor
---

Increased the speed of hierarchy filtering with large number of filtered paths.

- Added `HierarchyNodeIdentifier.compare` function to compare two identifiers.
- Changed `NodeParser` (return type of `HierarchyDefinition.parseNode`), to additionally allow returning a promise, so instead of just `SourceInstanceHierarchyNode` it can now also return `Promise<SourceInstanceHierarchyNode>`.
