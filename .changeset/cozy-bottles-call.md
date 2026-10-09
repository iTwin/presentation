---
"@itwin/presentation-tree-definitions": minor
---

Expose `createSharedIdsProvider`, `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, and `createClassificationsTreeIdsProvider` for sharing cached ID data. Their provider interfaces expose per-dataset `IdsProviderDataState` values (`"not-requested"`, `"requested"`, `"loaded"`, and `"failed"`) without initiating queries.

`createModelsTree`, `createCategoriesTree`, and `createClassificationsTree` now accept an optional `getIdsProvider(imodelKey)` callback to share iModel-specific providers between hierarchy and search. All three factories require `imodelAccess.imodelKey`. For `createClassificationsTree`, the default resolver throws when asked for another iModel key. Provider getters support explicit retries after failures without retaining failed partial results.

ID providers return readonly collections and metadata, including nested values and search-path entries. Search paths are now readonly; callers that modify them must first create their own copies.
