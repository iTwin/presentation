---
"@itwin/presentation-tree-definitions": minor
---

Expose `createSharedIdsProvider`, `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, and `createClassificationsTreeIdsProvider` for sharing cached ID data. Their provider interfaces expose per-dataset `IdsProviderDataState` values (`"not-requested"`, `"requested"`, `"loaded"`, and `"failed"`) without initiating queries. Provider getters support explicit retries after failures without retaining failed partial results.

`createModelsTree`, `createCategoriesTree`, and `createClassificationsTree` now accept an optional `idsProvider`, created for the same iModel as the supplied `imodelAccess`, to share cached ID data between trees. `createClassificationsTree` no longer requires the supplied `imodelAccess` to include `imodelKey`. The returned `definition` has been renamed to `hierarchyDefinition`.

`createCategoriesTree`: Replaced the `viewType` prop with a required `hierarchyConfig.perspective` property, following BIS modeling perspective terminology. The accepted values (`"2d"` and `"3d"`) are unchanged, and `hierarchyConfig` is now required. `createCategoriesTreeIdsProvider` accepts the same `hierarchyConfig.perspective` and exposes it through `config.perspective`.

ID providers expose the configuration used to create them through readonly `config`, which custom implementations must also provide. Factory-created providers retain readonly configuration snapshots with normalized defaults and excluded-class lists. Tree factories validate the supplied provider's configuration when the tree is created, throwing when the compared settings differ. `createModelsTreeIdsProvider` and `createCategoriesTreeIdsProvider` also reject incompatible shared-provider filters. Configurations can use runtime values.

`createSharedIdsProvider` accepts optional `loadDataOverrides` for replacing the default iModel queries with custom `Subscribable` data loaders: `loadElementModelCategories` (backing `models` and `categories` lookups), `loadSubModeledElements`, and `loadSubCategories`. Overridden data is still loaded lazily, has its state tracked, is cached, and is loaded again on retry after a failure. The `models`, `subModeledElements`, and `subCategories` groups of `SharedIdsProvider` expose `getData()` for retrieving the cached datasets, for example to reuse them as `loadDataOverrides` of another provider:

```ts
const provider = createSharedIdsProvider({
  imodelAccess,
  elementClassName,
  loadDataOverrides: { loadElementModelCategories: () => otherProvider.models.getData() },
});
```
