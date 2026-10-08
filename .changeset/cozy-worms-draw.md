---
"@itwin/presentation-hierarchies": major
---

`createMergedIModelHierarchyProvider`: Replaced `hierarchyDefinition` with `getHierarchyDefinition(imodelAccess)`, which creates a hierarchy definition for each iModel version. The latest version's definition handles pre-processing and post-processing of merged nodes.

Removed `imodelAccess` from `DefineHierarchyLevelProps`. Definitions that need iModel access must capture it when they are created instead of reading it from `defineHierarchyLevel` props.
