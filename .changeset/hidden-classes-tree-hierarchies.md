---
"@itwin/presentation-hierarchies": patch
---

`createIModelHierarchyProvider`: The `createFilterClauses` function, passed to hierarchy definitions through `DefineHierarchyLevelProps`, now gets hidden classes trees from `imodelAccess` through `ECSchemaProvider.getHiddenClassesTree`, instead of computing and caching them itself. All consumers of the same schema provider now share the cache.
