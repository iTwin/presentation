---
"@itwin/presentation-tree-definitions": minor
---

Expose `createSharedIdsProvider`, `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, and `createClassificationsTreeIdsProvider` for sharing cached ID data. Their provider interfaces expose per-dataset `IdsProviderDataState` values (`"not-requested"`, `"requested"`, `"loaded"`, and `"failed"`) without initiating queries.

Renamed the `modeledElements` group to `subModeledElements` and its `getAllModeledElements` method to `getAllSubModeledElements` on shared, models-tree, and categories-tree ID providers.

`createModelsTree`, `createCategoriesTree`, and `createClassificationsTree` now accept an optional `getIdsProvider(imodelKey)` callback to share iModel-specific providers between hierarchy and search. They return `getHierarchyDefinition(imodelAccess)` instead of `definition`; pass `imodelAccess` to the getter and to each `createInstanceKeyPaths` or `createSearchTree` call instead of to the factory. Supplied access must include `imodelKey`; ID providers are resolved or created once per key and shared across these operations. Provider getters support explicit retries after failures without retaining failed partial results.

ID providers return readonly collections and metadata, including nested values and search-path entries. Search paths are now readonly; callers that modify them must first create their own copies.
