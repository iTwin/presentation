# @itwin/presentation-tree-definitions

Reusable, UI-independent tree definitions backed by iModel data. The package provides models, categories, and classifications trees for use in custom tree components and other hierarchy-driven workflows.

Each tree factory requires the `imodelAccess` of the iModel it's created for and returns a `hierarchyDefinition` for `createIModelHierarchyProvider`, together with search helpers that query the same iModel. To build a merged hierarchy for multiple iModel versions, create a tree per version and return the matching `hierarchyDefinition` from the `getHierarchyDefinition` callback of `createMergedIModelHierarchyProvider`.

Use `createModelsTree` to obtain a `hierarchyDefinition` with configurable root subject visibility, empty model inclusion, element class grouping, and hierarchy level filtering. Apart from the required `imodelAccess`, the factory accepts only optional `idsProvider`, `hierarchyConfig`, and `uniqueId` props. The factory also provides helpers for searching by label or locating specific instances in the hierarchy. `ModelsTreeNode` offers type guards and node type identification for subject, model, category, element, and element class grouping nodes.

The models-tree `createInstanceKeyPaths` and `createSearchTree` helpers include hidden model entries by default. Pass `includeOnlyVisibleNodeInstanceKeys: true` to omit sub-model entries and models hidden by partition content properties. The partition-hidden model IDs are derived from cached model metadata shared across searches on the same tree instance. The root subject is always omitted when `subjects.root` is `"exclude"`, and subjects hidden by their JSON properties remain omitted regardless of this flag.

Use `createCategoriesTree` to obtain a `hierarchyDefinition` for a 2D or 3D view with configurable empty category inclusion, sub-category visibility, and optional elements with class exclusions. Its `hierarchyConfig` prop is required and must specify the `perspective` (`"2d"` or `"3d"`). It also provides helpers for searching by label. `CategoriesTreeNode` offers type guards and node type identification for definition container, category, sub-category, model, element, and element class grouping nodes.

Use `createClassificationsTree` to obtain a `hierarchyDefinition` with a configurable root classification system and optional element class exclusions. Its `hierarchyConfig.rootClassificationSystemCode` setting is required. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ClassificationsTreeNode` offers type guards and node type identification for classification table, classification, and geometric element nodes.

## ID Providers

ID providers supply data used by tree hierarchies and searches. Each tree factory creates its own provider by default, or accepts an `idsProvider` created for the same iModel as the tree's `imodelAccess`.

Use `createSharedIdsProvider` to create the `sharedIdsProvider` required by `createModelsTreeIdsProvider` or `createCategoriesTreeIdsProvider`. For classifications, pass `imodelAccess` and `hierarchyConfig` directly to `createClassificationsTreeIdsProvider`. Pass the resulting tree-specific provider to the corresponding factory's `idsProvider` prop. When creating trees for multiple iModel versions, create separate providers for each version. The provider interfaces also support custom implementations.

Every ID provider exposes the configuration used to create it through readonly `config`. Factory-created providers retain readonly snapshots, with defaults resolved and duplicate excluded classes removed. Classifications providers load classification data independently of shared providers and can be reused by trees with different element exclusions. Custom implementations must expose matching configuration metadata too.

Each tree factory validates a supplied provider's configuration when the tree is created and throws if the compared settings differ. Equivalent defaults and reordered or duplicated exclusions are accepted. Models and categories ID-provider factories also validate the supplied shared provider's element filters. Validation compares runtime values.

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

Reuse providers only within the same iModel and compatible configurations. Replace providers and recreate their trees after relevant data or configuration changes, or iModel closure; providers do not refresh their data automatically.

### iModel and Search Scope

All three tree factories take `imodelAccess` and return a `hierarchyDefinition` for `createIModelHierarchyProvider`. The definition and the `createInstanceKeyPaths` and `createSearchTree` helpers use that access and share a single ID provider, which is either supplied through `idsProvider` or created when the tree is created.

A tree is bound to a single iModel version. For multiple versions of the same iModel, create a tree per version and map each version's access to its tree's `hierarchyDefinition` in the `getHierarchyDefinition` callback of `createMergedIModelHierarchyProvider`.
