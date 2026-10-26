---
"@itwin/presentation-tree-definitions": minor
---

Expose `createSharedIdsProvider`, `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, and `createClassificationsTreeIdsProvider` for sharing cached ID data.

- `createModelsTree`, `createCategoriesTree`, and `createClassificationsTree` accept an optional `idsProvider` created for the same iModel. The factories throw if the provider's `config` doesn't match the tree's configuration.
- Each provider reports its loading state through `IdsProviderDataState` values, without starting any queries.
- `createSharedIdsProvider` accepts optional `loadDataOverrides` to replace its iModel queries with custom data loaders. `SharedIdsProvider` exposes the loaded data through `getData()`, for example to reuse it in another provider:

  ```ts
  const provider = createSharedIdsProvider({
    imodelAccess,
    elementClassName,
    loadDataOverrides: { loadElementModelCategories: () => otherProvider.models.getData() },
  });
  ```

Breaking changes:

- The `definition` returned by tree factories has been renamed to `hierarchyDefinition`.
- `createCategoriesTree`: The `viewType` prop has been replaced by a required `hierarchyConfig.perspective` property, so `hierarchyConfig` is now required. The accepted values (`"2d"` and `"3d"`) are unchanged.

`createClassificationsTree` no longer requires the supplied `imodelAccess` to include `imodelKey`.
