# @itwin/presentation-tree-definitions

Reusable, UI-independent tree definitions backed by iModel data. The package provides models, categories, and classifications trees for use in custom tree components and other hierarchy-driven workflows.

Use `createModelsTree` to create a hierarchy definition with configurable root subject visibility, empty model inclusion, element class grouping, and hierarchy level filtering. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ModelsTreeNode` offers type guards and node type identification for subject, model, category, element, and element class grouping nodes.

The models-tree `createInstanceKeyPaths` and `createSearchTree` helpers include hidden model entries by default. Pass `includeOnlyVisibleNodeInstanceKeys: true` to omit sub-model entries and models hidden by partition content properties. The partition-hidden model IDs are derived from cached model metadata shared across searches on the same tree instance. The root subject is always omitted when `subjects.root` is `"exclude"`, and subjects hidden by their JSON properties remain omitted regardless of this flag.

Use `createCategoriesTree` to create a hierarchy definition for a 2D or 3D view with configurable empty category inclusion, sub-category visibility, and optional elements with class exclusions. It also provides helpers for searching by label. `CategoriesTreeNode` offers type guards and node type identification for definition container, category, sub-category, model, element, and element class grouping nodes.

Use `createClassificationsTree` to create a hierarchy definition with a configurable root classification system and optional element class exclusions. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ClassificationsTreeNode` offers type guards and node type identification for classification table, classification, and geometric element nodes.

## ID Providers

ID providers supply data used by tree hierarchies and searches. Each tree factory creates its own provider by default, or accepts a `getIdsProvider(imodelKey)` callback that returns the provider for the requested iModel. The factory's `imodelAccess` must include its `imodelKey`.

Use `createBaseIdsProvider` to create the `baseIdsProvider` required by `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, or `createClassificationsTreeIdsProvider`. Return the resulting tree-specific provider from the corresponding factory's `getIdsProvider` callback. When creating trees for multiple iModel versions, keep separate providers keyed by `imodelKey` and share the resolver across the factories. The provider interfaces also support custom implementations.

Providers load data on demand and reuse previously loaded data. Their state properties use `IdsProviderDataState`:

- `"not-requested"`: loading has not started.
- `"requested"`: loading has started, but the dataset is not fully available; it may be partially loaded.
- `"loaded"`: the dataset is ready.
- `"failed"`: loading the dataset or a required dependency failed.

For optional background loading, call a provider getter when the corresponding state is `"not-requested"` and handle rejection. Later getter calls can retry failed loads. Trees remain usable while provider data loads.

Reuse providers only within the same iModel and compatible configurations. Return the same provider for each key throughout the corresponding tree's lifetime. Replace providers and recreate their trees after relevant data or configuration changes, or iModel closure; providers do not refresh their data automatically.

### iModel and Search Scope

`createModelsTree` and `createCategoriesTree` resolve their ID provider once using `imodelAccess.imodelKey` and retain it for hierarchy and search. Create a separate tree for each iModel version; supplying `getIdsProvider` does not make these definitions reusable across versions.

The classifications definition resolves its cached child-classification provider using the parent instance's `imodelKey`. When `getIdsProvider` is omitted, its default resolver returns the provider only for the factory's key and throws when asked for another key. The check runs on provider lookup, so levels that do not use it, such as root levels, do not trigger the error.

All three factories' search helpers use the factory's `imodelAccess` and its matching ID provider. To search another iModel version, create a factory with the corresponding access; a keyed provider callback does not change where searches run.
