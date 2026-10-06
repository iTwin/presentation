# @itwin/presentation-tree-definitions

Reusable, UI-independent tree definitions backed by iModel data and built on `@itwin/presentation-hierarchies`. The package provides models, categories, and classifications trees for use in custom tree components and other hierarchy-driven workflows.

Use `createModelsTree` to create a hierarchy definition with configurable root subject visibility, empty model inclusion, element class grouping, and hierarchy level filtering. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ModelsTreeNode` offers type guards and node type identification for subject, model, category, element, and element class grouping nodes.

The models-tree `createInstanceKeyPaths` and `createSearchTree` helpers include hidden model entries by default. Pass `includeOnlyVisibleNodeInstanceKeys: true` to omit sub-model entries and models hidden by partition content properties. The partition-hidden model IDs are derived from cached model metadata shared across searches on the same tree instance. The root subject is always omitted when `subjects.root` is `"exclude"`, and subjects hidden by their JSON properties remain omitted regardless of this flag.

Use `createCategoriesTree` to create a hierarchy definition for a 2D or 3D view with configurable empty category inclusion, sub-category visibility, and optional elements with class exclusions. It also provides helpers for searching by label. `CategoriesTreeNode` offers type guards and node type identification for definition container, category, sub-category, model, element, and element class grouping nodes.

Use `createClassificationsTree` to create a hierarchy definition with a configurable root classification system and optional element class exclusions. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ClassificationsTreeNode` offers type guards and node type identification for classification table, classification, and geometric element nodes.

## ID Providers

ID providers supply data used by tree hierarchies and searches. Each tree factory creates its own provider by default, or accepts one through the `idsProvider` option.

Use `createBaseIdsProvider` to create the `baseIdsProvider` required by `createModelsTreeIdsProvider`, `createCategoriesTreeIdsProvider`, or `createClassificationsTreeIdsProvider`. Pass the resulting tree-specific provider to the corresponding tree factory. The provider interfaces also support custom implementations.

Providers load data on demand and reuse previously loaded data. Their state properties use `IdsProviderDataState`:

- `"not-requested"`: loading has not started.
- `"requested"`: loading has started, but the dataset is not fully available; it may be partially loaded.
- `"loaded"`: the dataset is ready.
- `"failed"`: loading the dataset or a required dependency failed.

For optional background loading, call a provider getter when the corresponding state is `"not-requested"` and handle rejection. Later getter calls can retry failed loads. Trees remain usable while provider data loads.

Reuse providers only within the same iModel and compatible configurations. Replace them after relevant data or configuration changes, or iModel closure; providers do not refresh their data automatically.
