---
"@itwin/presentation-hierarchies": major
---

Support creating ECSQL query definitions based on instance filters, containing schema items that don't exist in the _current_ iModel.

To support that, the `NodesQueryClauseFactory` created by `createNodesQueryClauseFactory` returns a query-disabling result when it encounters such schema items. To ensure that's possible,
the `createNodesQueryClauseFactory` function should be called with `imodelAccess` that is passed to `HierarchyDefinition.defineHierarchyLevel`.

**Breaking changes:**

- `DefineHierarchyLevelProps.imodelKey` was replaced with `imodelAccess`. If needed, the key can be accessed using `imodelAccess.imodelKey`. This affects the following APIs:
  - `HierarchyDefinition.defineHierarchyLevel` (function that uses these props),
  - `DefineRootHierarchyLevelProps` (extends the props type),
  - `DefineInstanceNodeChildHierarchyLevelProps` (extends the props type).
