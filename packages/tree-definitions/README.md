# @itwin/presentation-tree-definitions

Reusable, UI-independent tree definitions backed by iModel data. The package provides models, categories, and classifications trees for use in custom tree components and other hierarchy-driven workflows.

Use `createModelsTree` to obtain `getHierarchyDefinition(imodelAccess)` with configurable root subject visibility, empty model inclusion, element class grouping, and hierarchy level filtering. The factory accepts only optional `getIdsProvider`, `hierarchyConfig`, and `uniqueId` props; call `createModelsTree()` to use defaults. Call the getter to obtain a definition for `createIModelHierarchyProvider`, or pass it directly to `createMergedIModelHierarchyProvider`. The factory also provides helpers for searching by label or locating specific instances in the hierarchy; supply `imodelAccess` in each search request. `ModelsTreeNode` offers type guards and node type identification for subject, model, category, element, and element class grouping nodes.

The models-tree `createInstanceKeyPaths` and `createSearchTree` helpers include hidden model entries by default. Pass `includeOnlyVisibleNodeInstanceKeys: true` to omit sub-model entries and models hidden by partition content properties. The partition-hidden model IDs are derived from cached model metadata shared across searches on the same tree instance. The root subject is always omitted when `subjects.root` is `"exclude"`, and subjects hidden by their JSON properties remain omitted regardless of this flag.

Use `createCategoriesTree` to obtain `getHierarchyDefinition(imodelAccess)` for a 2D or 3D view with configurable empty category inclusion, sub-category visibility, and optional elements with class exclusions. Its `viewType` prop is required. It also provides helpers for searching by label. `CategoriesTreeNode` offers type guards and node type identification for definition container, category, sub-category, model, element, and element class grouping nodes.

Use `createClassificationsTree` to obtain `getHierarchyDefinition(imodelAccess)` with a configurable root classification system and optional element class exclusions. Its `hierarchyConfig.rootClassificationSystemCode` setting is required. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ClassificationsTreeNode` offers type guards and node type identification for classification table, classification, and geometric element nodes.

## ID Providers

ID providers supply data used by tree hierarchies and searches. Each tree factory creates its own providers by default, or accepts a `getIdsProvider(imodelKey)` callback that returns the provider for the requested iModel. Supplied `imodelAccess` objects must include their `imodelKey`.

Use `createSharedIdsProvider` to create the `sharedIdsProvider` required by `createModelsTreeIdsProvider` or `createCategoriesTreeIdsProvider`. For classifications, pass `imodelAccess` and `hierarchyConfig` directly to `createClassificationsTreeIdsProvider`. Return the resulting tree-specific provider from the corresponding factory's `getIdsProvider` callback. When creating trees for multiple iModel versions, keep separate providers keyed by `imodelKey` and share the resolver across the factories. The provider interfaces also support custom implementations.

Every ID provider exposes the configuration used to create it through readonly `config`. Factory-created providers retain readonly snapshots, with defaults resolved and duplicate excluded classes removed. Shared providers expose element filters; models providers expose element, subject, and model settings; categories providers expose their view `type` and element filters; classifications providers expose their root classification system and element filters. Custom implementations must expose matching configuration metadata too.

Each tree validates a provider's configuration before its first use for an `imodelKey`, whether through a hierarchy definition or a search helper, and throws if the compared settings differ. Equivalent defaults and reordered or duplicated exclusions are accepted. Models trees also allow differences in `subjects.labelMerging`, `models.labelMerging`, and `elements.classGrouping`, which do not affect the ID provider. Models and categories ID-provider factories also validate the supplied shared provider's element filters. Validation compares runtime values.

`SharedIdsProvider` groups its getters with their loading state:

- `models`: model IDs, plan projection models, and model lookups by category.
- `subModeledElements`: IDs of elements modeled by non-empty sub-models.
- `categories`: category IDs and category lookups by model.
- `subCategories`: mappings between categories and sub-categories.

Providers load data on demand and reuse previously loaded data. Their state properties use `IdsProviderDataState`:

- `"not-requested"`: loading has not started.
- `"requested"`: loading has started, but the dataset is not fully available; it may be partially loaded.
- `"loaded"`: the dataset is ready.
- `"failed"`: loading the dataset or a required dependency failed.

For optional background loading, call a provider getter when the corresponding state is `"not-requested"` and handle rejection. Later getter calls can retry failed loads. Trees remain usable while provider data loads.

Reuse providers only within the same iModel and compatible configurations. Return the same provider for each key throughout the corresponding tree's lifetime. Replace providers and recreate their trees after relevant data or configuration changes, or iModel closure; providers do not refresh their data automatically.

### iModel and Search Scope

All three tree factories return `getHierarchyDefinition(imodelAccess)`. Call the getter to obtain a definition for `createIModelHierarchyProvider`, or pass it directly to `createMergedIModelHierarchyProvider`. Each definition uses the supplied access and its matching ID provider.

The `createInstanceKeyPaths` and `createSearchTree` helpers take `imodelAccess` with each search request. ID providers are lazily resolved or created once per `imodelKey` and shared across definitions and searches using the same key. One tree can supply definitions and searches for multiple versions of the same iModel, including when using default providers.
