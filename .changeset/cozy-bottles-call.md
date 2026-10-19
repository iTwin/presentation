---
"@itwin/presentation-tree-definitions": minor
---

Expose `createSharedIdsProvider`, `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, and `createClassificationsTreeIdsProvider` for sharing cached ID data. Their provider interfaces expose per-dataset `IdsProviderDataState` values (`"not-requested"`, `"requested"`, `"loaded"`, and `"failed"`) without initiating queries.

Renamed the `modeledElements` group to `subModeledElements` and its `getAllModeledElements` method to `getAllSubModeledElements` on shared, models-tree, and categories-tree ID providers.

`createModelsTree`, `createCategoriesTree`, and `createClassificationsTree` now accept an optional `getIdsProvider(imodelAccess)` callback to share iModel-specific providers between hierarchy and search. They return `getHierarchyDefinition(imodelAccess)` instead of `definition`; pass `imodelAccess` to the getter and to each `createInstanceKeyPaths` or `createSearchTree` call instead of to the factory. Supplied access must include `imodelKey`; ID providers are resolved or created once per key and shared across these operations. Provider getters support explicit retries after failures without retaining failed partial results.

ID providers expose the configuration used to create them through readonly `config`, which custom implementations must also provide. Factory-created providers retain readonly configuration snapshots with normalized defaults and excluded-class lists. Tree factories validate provider configuration at runtime before the first hierarchy or search request for each iModel, throwing when the compared settings differ. `createModelsTree` allows differences in `subjects.labelMerging`, `models.labelMerging`, and `elements.classGrouping`, which do not affect the ID provider. `createModelsTreeIdsProvider` and `createCategoriesTreeIdsProvider` also reject incompatible shared-provider filters. Configurations can use runtime values.

ID providers return readonly collections and metadata, including nested values and search-path entries. Search paths are now readonly; callers that modify them must first create their own copies.
