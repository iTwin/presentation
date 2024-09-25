---
"@itwin/presentation-hierarchies": minor
---

**BREAKING:** Added support for creating hierarchies from multiple data sources.

- Changes to `HierarchyProvider` interface:
  - Removed `notifyDataSourceChanged` method. Each provider implementation should decide how it gets notified about data source changes.
  - Added `setHierarchyFilter` method to allow setting or removing the filter without creating a new provider.

- Renamed `createHierarchyProvider` to `createIModelHierarchyProvider` to signify that the created provider creates nodes based on specific iModel. In addition, the function received the following changes:
  - The `imodelAccess` object now requires an additional `imodelKey` attribute. See README for how to create the `imodelAccess` object.
  - Added an optional `imodelChanged` prop of `Event` type. The created provider listens to this event and updates the hierarchy when the event is raised (previously this was done by calling `notifyDataSourceChanged` method on the provider).
  - The returned provider now has a `dispose` method to clean up resources - make sure to call it when the provider is no longer needed.

- Added `mergeProviders` function, which, given a number of hierarchy providers, creates a new provider that merges the hierarchies of the input providers. The returned provider has a `dispose` method that needs to be called when the provider is no longer needed.

- `HierarchyNode` terminology and related changes:
  - "Standard" nodes were renamed to "IModel" nodes to signify the fact that they're based on iModel data:
    - `StandardHierarchyNodeKey` renamed to `IModelHierarchyNodeKey`.
    - `HierarchyNodeKey.isStandard` renamed to `HierarchyNodeKey.isIModelNodeKey`.
    - `HierarchyNode.isStandard` renamed to `HierarchyNode.isIModelNode`.
  - "Custom" nodes were renamed to "generic":
    - `key` of custom nodes was a `string`. The type was changed to newly added `GenericNodeKey` object. This also affects how generic nodes are identified through `HierarchyNodeIdentifier` when specifying hierarchy filter paths (was a `string`, now `GenericNodeKey`).
    - `DefineCustomNodeChildHierarchyLevelProps` renamed to `DefineGenericNodeChildHierarchyLevelProps`.
    - `HierarchyNodeKey.isCustom` renamed to `HierarchyNodeKey.isGeneric`.
    - `HierarchyNode.isCustom` renamed to `HierarchyNode.isGeneric`.
    - `HierarchyNodeIdentifier.isCustomNodeIdentifier` renamed to `HierarchyNodeIdentifier.isGenericNodeIdentifier`.
    - `HierarchyNodesDefinition.isCustomNode` renamed to `HierarchyNodesDefinition.isGenericNode`.
  - Type guards in `HierarchyNode` namespace no longer narrow the type of the input node to `ProcessedHierarchyNode` subtypes. Instead, a `ProcessedHierarchyNode` namespace was added with a number of type guards to do that.

- `createClassBasedHierarchyDefinition` props changes:
  - When specifying `childNodes` definition for instances parent node, the `parentNodeClassName` attribute was changed to `parentInstancesNodePredicate`. In addition to accepting a full class name, identifying the class of parent instances to return children for, it now also accepts an async function predicate.
  - When specifying `childNodes` definition for generic parent node, the `customParentNodeKey` attribute was changed to `parentGenericNodePredicate`. The type changed from `string`, identifying the key of the parent node, to an async function predicate. Migration:

    ```ts
    // before
    {
      customParentNodeKey: "my-custom-node",
      definitions: async () => [...],
    }

    // after
    {
      parentGenericNodePredicate: async (parentNode) => parentNode.key.id === "my-custom-node",
      definitions: async () => [...],
    }
    ```
