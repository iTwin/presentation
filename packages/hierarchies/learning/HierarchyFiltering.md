# Hierarchy filtering

Hierarchy filtering is a concept where the hierarchy is filtered to a subset that contains only the requested nodes, their ancestors and their children.

For example, let's say we have this hierarchy:

```txt
+ A
+--+ B
|  +--+ C
|  +--+ D
+--+ E
|  +--+ F
+--+ G
```

And these are the node paths we want to filter by:

```txt
A -> B -> C
A -> E
```

The end result would be:

```txt
+ A
+--+ B
|  +--+ C
+--+ E
|  +--+ F
```

## The process

The process of filtering a hierarchy has two major steps:

1. Determine node identifier paths for the target nodes. While some hierarchy providers may be able to create these paths automatically, the implementations delivered with this library leave this responsibility to the consumers. This decouples hierarchy filtering logic from the type of filtering being done - the paths could be created based on a variety of ways, such as a filter string or a target instance ID, to name a few.

2. Given the node identifier paths, the hierarchy provider has the responsibility to filter the hierarchy by implementing the `HierarchyProvider.setHierarchyFilter` method and making sure the given filter is accounted for. The given paths are used to filter root nodes and each returned node is assigned a `filtering` flag, containing identifier paths for its child nodes.

## Handling automatic expansion of nodes

Imagine a case where we have this hierarchy:

```txt
+ A
+--+ B
|  +--+ C
|     +--+ ...100 nodes
+--+ ...
```

Let's say, we want the hierarchy to contain only the nodes with "C" label. In this case it may be useful to display to the user where exactly "C" node is located without showing all of its 100 children. This is possible to do by providing an additional `autoExpand` option to a filter path, which indicates that the hierarchy should be auto-expanded up to the target node. A `HierarchyProvider` would then set the `autoExpand` flag on the nodes that are part of the filtered hierarchy up to the target node, and the component that renders the hierarchy would make sure such nodes are expanded when the hierarchy is displayed. So the filtered and auto-expanded hierarchy would look like this:

```txt
+ A                       (auto-expanded)
+--+ B                    (auto-expanded)
|  +--+ C                 (collapsed)
|     +--+ ...100 nodes
```

The following code snippet shows, how to create a filtering path that includes the `autoExpand` flag:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.HierarchyFilteringPathImport, Presentation.Hierarchies.HierarchyFiltering.AutoExpand.FilteringPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchyFilteringPath } from "@itwin/presentation-hierarchies";

// Get a grouping node that groups the "C" element
const filteringPath: HierarchyFilteringPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  // Supply options for the filtering path
  options: {
    // Auto-expand the hierarchy up to the target "C" node
    autoExpand: true,
  },
};
```

<!-- END EXTRACTION -->

Additionally, hierarchies may contain grouping nodes, which don't represent anything by themselves, which means they can't be a filter target. However, in some cases it may be necessary to auto-expand the hierarchy up to a grouping node, which can be achieved by setting the `autoExpand` property to a grouping node's identifier - its key and depth in the hierarchy:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.HierarchyFilteringPathImport, Presentation.Hierarchies.HierarchyFiltering.AutoExpandUntilGroupingNode.FilteringPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchyFilteringPath } from "@itwin/presentation-hierarchies";

// Get a grouping node that groups the "C" element
const groupingNode = await getSelectedGroupingNode();
const filteringPath: HierarchyFilteringPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  // Supply grouping node attributes with the path to the "C" element.
  options: {
    // Auto-expand the hierarchy up to the grouping node. The `depth` attribute equals to the number of parents.
    autoExpand: { key: groupingNode.key, depth: groupingNode.parentKeys.length },
  },
};
```

<!-- END EXTRACTION -->
