---
"@itwin/presentation-hierarchies": patch
---

`createNodesQueryClauseFactory`: Memoize the hidden-classes tree computed for each select class, significantly speeding up hierarchies that repeatedly select broad base classes (e.g. the models tree).

Previously the hidden-classes tree (introduced with hidden classes/properties support) was recomputed on every `createFilterClauses` call, which recursively walks the whole derived-class subtree of the select class and rebuilds class metadata. The result now persists for the lifetime of the query factory. The factory therefore caches schema-derived metadata and must be re-created when the iModel's schemas may have changed - `createIModelHierarchyProvider` does this automatically by re-creating its factories in response to the `imodelChanged` event.
