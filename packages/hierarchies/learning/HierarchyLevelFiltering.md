# Hierarchy level filtering

Hierarchy level filtering is a concept where filtering is applied to a single hierarchy level (as opposed to [hierarchy filtering](./HierarchyFiltering.md), where filtering is applied to the whole hierarchy). This is useful when hierarchy levels contain very large numbers of nodes as it allows users to filter child nodes based on attributes of items that those nodes represent.

There are three pieces that need to be implemented to enable hierarchy level filtering:

1. Parent nodes that support filtering their children, should have `supportsFiltering` attribute set to `true`. This tells the component that renders the node to render filtering entry point.
2. Depending on application requirements and the hierarchy data source, a hierarchy level filter is described in the form of a `GenericInstanceFilter`.
3. The filter created in step 2 is passed to `HierarchyProvider.getNodes`, where it's converted to data source-specific filter and applied to the query that fetches child nodes.

An example of how to implement hierarchy level filtering in a custom hierarchy provider can be found in the [Implementing hierarchy level filtering support](./CustomHierarchyProviders.md#implementing-hierarchy-level-filtering-support) section.

Implementation details specific to iModels are described in the [iModel hierarchy level filtering](./imodel/HierarchyLevelFiltering.md) learning page.
