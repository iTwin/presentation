---
"@itwin/presentation-tree-definitions": patch
---

Expose `createBaseIdsProvider`, `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, and `createClassificationsTreeIdsProvider` for sharing cached ID data. Their provider interfaces expose per-dataset `IdsProviderDataState` values (`"not-requested"`, `"requested"`, `"loaded"`, and `"failed"`) without initiating queries.

`createModelsTree`, `createCategoriesTree`, and `createClassificationsTree` now accept an optional `idsProvider` shared by hierarchy and search. Getters support explicit retries after failures without retaining failed partial results.
