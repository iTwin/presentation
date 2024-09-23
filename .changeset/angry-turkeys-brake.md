---
"@itwin/presentation-hierarchies": minor
---

Added support for creating hierarchies from multiple data sources.

- Changes to `HierarchyProvider` interface:
  - Removed `notifyDataSourceChanged` method. Each provider implementation should decide how it gets notified about data source changes.
  - Added `setHierarchyFilter` method to allow setting or removing the filter without creating a new provider.

- Renamed `createHierarchyProvider` to `createIModelHierarchyProvider` to signify that the created provider creates nodes based on specific iModel. In addition, the function received the following changes:
  - The `imodelAccess` object now requires an additional `imodelKey` attribute. See README for how to create the `imodelAccess` object.
  - Added an optional `imodelChanged` prop of `Event` type. The created provider listens to this event and updates the hierarchy when the event is raised (previously this was done by calling `notifyDataSourceChanged` method on the provider).
  - The returned provider now has a `dispose` method to clean up resources - make sure to call it when the provider is no longer needed.

- Added `mergeProviders` function, which, given a number of hierarchy providers, creates a new provider that merges the hierarchies of the input providers. The returned provider has a `dispose` method that needs to be called when the provider is no longer needed.

- Type guards in `HierarchyNode` namespace no longer narrow the type of the input node to `ProcessedHierarchyNode` subtypes. Instead, a `ProcessedHierarchyNode` namespace was added with a number of type guards to do that.
