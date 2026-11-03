---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: Added the experimental (`@alpha`) `createHierarchyNodePaths` helper. It works like `createInstanceKeyPaths`, but for each search target it returns the hierarchy nodes from the root up to and including the target node. The helper requires a `HierarchyProvider` created for the tree's `hierarchyDefinition` with label merging disabled.
