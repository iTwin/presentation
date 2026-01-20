# Merged hierarchies

The merging hierarchy provider, created using the `mergeProviders` factory function, allows creating a hierarchy that combines data from multiple data sources. The implementation is fairly straightforward - it merely forwards requests to given providers and merges the results. A couple of nuances:

- Since none of the merged providers know about each other, the nodes they return have a `children` flag that only accounts for children from the same provider. The merging provider must ensure to check if any of the other merged providers have children for a given node and update its `children` flag accordingly.

- While the `HierarchyProvider` interface doesn't define how the returned nodes should be sorted, it's assumed that they're sorted by the label property. As a result, the merging provider makes sure that returned nodes are sorted by the label property after merging them.

- The merging provider merely forwards node requests to internal ones, it doesn't account for the need to merge special nodes, like grouping ones. If you want to create a merged hierarchy from multiple versions of the same iModel, have a look at [Merged iModel hierarchies](./imodel/MergedIModelHierarchies.md) learning page.

## Example

The below example demonstrates how to create a hierarchy provider that merges three providers:

<!-- [[include: [Presentation.Hierarchies.MergedHierarchies.Imports, Presentation.Hierarchies.MergedHierarchies.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { GetHierarchyNodesProps, HierarchyNode, HierarchyProvider, mergeProviders } from "@itwin/presentation-hierarchies";

// Create a very basic hierarchy provider factory
function createBasicHierarchyProvider(nodes: (parentNode: GetHierarchyNodesProps["parentNode"]) => HierarchyNode[]): HierarchyProvider {
  return {
    hierarchyChanged: new BeEvent(),
    async *getNodes({ parentNode }) {
      for (const node of nodes(parentNode)) {
        yield node;
      }
    },
    async *getNodeInstanceKeys() {},
    setFormatter() {},
    setHierarchySearch() {},
  };
}
// A provider that returns a single "Node X" root node
const provider1 = createBasicHierarchyProvider((parent) => {
  if (!parent) {
    return [{ key: { type: "generic", id: "x" }, label: "Node X", children: false, parentKeys: [] }];
  }
  return [];
});
// A provider that returns a single "Node A" root node
const provider2 = createBasicHierarchyProvider((parent) => {
  if (!parent) {
    return [{ key: { type: "generic", id: "a" }, label: "Node A", children: false, parentKeys: [] }];
  }
  return [];
});
// A provider that returns no root nodes, but returns a single "Child node" for parent nodes "A" and "X"
const childrenProvider = createBasicHierarchyProvider((parent) => {
  if (parent && HierarchyNode.isGeneric(parent) && (parent.key.id === "a" || parent.key.id === "x")) {
    return [{ key: { type: "generic", id: "c" }, label: "Child node", children: false, parentKeys: [...parent.parentKeys, parent.key] }];
  }
  return [];
});

// Merge all 3 providers
const mergingProvider = mergeProviders({ providers: [provider1, provider2, childrenProvider] });

// Collect the hierarchy. Notes:
// - Root nodes are sorted by label
// - "Child node" is placed under both "Node A" and "Node X"
expect(await collectHierarchy(mergingProvider)).to.containSubset([
  {
    label: "Node A",
    children: [
      {
        label: "Child node",
        children: undefined,
      },
    ],
  },
  {
    label: "Node X",
    children: [
      {
        label: "Child node",
        children: undefined,
      },
    ],
  },
]);
```

<!-- END EXTRACTION -->
