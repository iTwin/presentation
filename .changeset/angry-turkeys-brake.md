---
"@itwin/presentation-hierarchies": minor
---

**BREAKING:** Added support for creating hierarchies from multiple data sources.

- `InstancesNodeKey.instanceKeys` array items now have an optional `imodelKey` attribute to allow for the identification of the iModel that the instance belongs to. This is useful when working with sets of instance keys representing instances from different iModels. In addition, the same `imodelKey` attribute is also available on `HierarchyNodeIdentifier` to allow for filtering nodes based on the iModel they belong to.

- `HierarchyNode` terminology and related changes:
  - "Standard" nodes were renamed to "IModel" nodes to signify the fact that they're based on iModel data:
    - `StandardHierarchyNodeKey` renamed to `IModelHierarchyNodeKey`.
    - `HierarchyNodeKey.isStandard` renamed to `HierarchyNodeKey.isIModelNodeKey`.
    - `HierarchyNode.isStandard` renamed to `HierarchyNode.isIModelNode`.
  - "Custom" nodes were renamed to "generic":
    - `key` of custom nodes was a `string`. Now, `HierarchyProvider` returns these nodes with key of type `GenericNodeKey` (`HierarchyDefinition` still returns the `key` as `string` like before). This affects how generic nodes are identified through `HierarchyNodeIdentifier` when specifying hierarchy filter paths (was a `string`, now `GenericNodeKey`).
    - `DefineCustomNodeChildHierarchyLevelProps` renamed to `DefineGenericNodeChildHierarchyLevelProps`.
    - `HierarchyNodeKey.isCustom` renamed to `HierarchyNodeKey.isGeneric`.
    - `HierarchyNode.isCustom` renamed to `HierarchyNode.isGeneric`.
    - `HierarchyNodeIdentifier.isCustomNodeIdentifier` renamed to `HierarchyNodeIdentifier.isGenericNodeIdentifier`.
    - `HierarchyNodesDefinition.isCustomNode` renamed to `HierarchyNodesDefinition.isGenericNode`.
  - `ParsedHierarchyNode` was renamed to `SourceHierarchyNode`.
  - Type guards in `HierarchyNode` namespace no longer narrow the type of the input node to `ProcessedHierarchyNode` subtypes. Instead, a `ProcessedHierarchyNode` namespace was added with a number of type guards to do that.

- Changes to `HierarchyProvider` interface:
  - Removed `notifyDataSourceChanged` method. Each provider implementation should decide how it gets notified about data source changes.
  - Added `setHierarchyFilter` method to allow setting or removing the filter without creating a new provider.

- Renamed `createHierarchyProvider` to `createIModelHierarchyProvider` to signify that the created provider creates nodes based on specific iModel. In addition, the function received the following changes:
  - The `imodelAccess` object now requires an additional `imodelKey` attribute. See README for how to create the `imodelAccess` object.
  - All nodes returned by the provider are now associated with the iModel this provider is using:
    - Instances-based hierarchy nodes' instance keys have an `imodelKey` attribute.
    - Generic nodes' keys have a `source` attribute set to imodel access' `imodelKey`.
  - Added an optional `imodelChanged` prop of `Event` type. The created provider listens to this event and updates the hierarchy when the event is raised (previously this was done by calling `notifyDataSourceChanged` method on the provider).
  - The returned provider now has a `dispose` method to clean up resources - make sure to call it when the provider is no longer needed.

- Added `mergeProviders` function, which, given a number of hierarchy providers, creates a new provider that merges the hierarchies of the input providers. The returned provider has a `dispose` method that needs to be called when the provider is no longer needed.

- Renamed `createClassBasedHierarchyDefinition` to `createPredicateBasedHierarchyDefinition` to signify its props changes:
  - When specifying `childNodes` definition for instances parent node, the `parentNodeClassName` attribute was changed to `parentInstancesNodePredicate`. In addition to accepting a full class name, identifying the class of parent instances to return children for, it now also accepts an async function predicate.
  - When specifying `childNodes` definition for generic parent node, the `customParentNodeKey` attribute was changed to `parentGenericNodePredicate`. The type changed from `string`, identifying the key of the parent node, to an async function predicate.

  Migration:

    ```ts
    // before
    const definition = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [...],
        childNodes: [
          {
            parentNodeClassName: "MySchema.MyClass",
            definitions: async () => [...],
          },
          {
            customParentNodeKey: "my-custom-node",
            definitions: async () => [...],
          },
        ],
      },
    });

    // after
    const definition = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [...],
        childNodes: [
          {
            parentInstancesNodePredicate: "MySchema.MyClass",
            /* alternative:
            parentInstancesNodePredicate: async (parentKey) =>
              Promise.all(
                parentKey.instanceKeys.map(async (instanceKey) =>
                  classHierarchyInspector.classDerivesFrom(instanceKey.className, "MySchema.MyClass"),
                ),
              ),
            */
            definitions: async () => [...],
          },
          {
            parentGenericNodePredicate: async (parentKey) => parentKey.id === "my-custom-node",
            definitions: async () => [...],
          },
        ],
      },
    });
    ```
