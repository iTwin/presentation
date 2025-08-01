# Hierarchy searching

Hierarchy searching is a concept where the hierarchy is filtered to a subset that contains only the requested nodes, their ancestors and their children.

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

And these are the node paths we want to searched by:

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

The process of searching a hierarchy has two major steps:

1. Determine node identifier paths for the target nodes. While some hierarchy providers may be able to create these paths automatically, the implementations delivered with this library leave this responsibility to the consumers.
2. Given the node identifier paths, the hierarchy provider has the responsibility to search the hierarchy by implementing the `HierarchyProvider.setHierarchySearch` method and making sure the given filter is accounted for, when `getNodes` is called. The given paths are used to search root nodes and each returned node is assigned a `search` flag, containing identifier paths for its child nodes.

The reasoning for having these two steps separate is twofold:

- It decouples creation of the searched hierarchy from the type of filtering being done - the paths could be created based on a variety of ways, such as a search string or a target instance ID, to name a few. And building the searched hierarchy doesn't depend on the way the paths are created.
- Hierarchies' filtering is specific in a way that, generally, each hierarchy level has to be queried independently, and target nodes may be located somewhere deep in the hierarchy. Taking the hierarchy defined at the top of this document, for C target node we need to include its ancestors B and A when building their hierarchy levels, even though they aren't our filter targets. So the most efficient way to do that is to first find the filter targets, and then rebuild the paths in a bottom-up manner.

See [Implementing hierarchy filtering support](./CustomHierarchyProviders.md#implementing-hierarchy-filtering-support) for more information on how to implement hierarchy filtering in a custom hierarchy provider.

## Handling automatic expansion of nodes

Imagine a case where we have this hierarchy:

```txt
+ A
+--+ B
|  +--+ C
|     +--+ ...100 nodes
+--+ ...
```

Let's say, we want the hierarchy to contain only the nodes with "C" label. In this case it may be useful to display to the user where exactly "C" node is located without showing all of its 100 children. This is possible to do by providing an additional `autoExpand` option to a search path, which indicates that the hierarchy should be auto-expanded up to the target node. A `HierarchyProvider` would then set the `autoExpand` flag on the nodes that are part of the searched hierarchy up to the target node, and the component that renders the hierarchy would make sure such nodes are expanded when the hierarchy is displayed. So the searched and auto-expanded hierarchy would look like this:

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
import { HierarchySearchPath } from "@itwin/presentation-hierarchies";

// Get a grouping node that groups the "C" element
const searchPath: HierarchySearchPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  // Supply options for the search path
  options: {
    // Auto-expand the hierarchy up to the target "C" node
    autoExpand: true,
  },
};
```

<!-- END EXTRACTION -->

Additionally, you might not want to add `autoExpand` flag to every node in `HierarchyFilteringPath`. For such cases hierarchies may be expanded up to desired depth, which can be achieved by setting the `autoExpand` property to `{ depth: number }`, where depth represents node's depth in the hierarchy excluding grouping nodes:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.HierarchyFilteringPathImport, Presentation.Hierarchies.HierarchyFiltering.AutoExpandUntilDepthWithoutGrouping.FilteringPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchySearchPath } from "@itwin/presentation-hierarchies";

const searchPath: HierarchySearchPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  options: {
    // Auto-expand the hierarchy up to the specified depth. In this case up to and including element "B"
    autoExpand: { depth: 2 },
  },
};
```

<!-- END EXTRACTION -->

Also, hierarchies may contain grouping nodes, which don't represent anything by themselves, which means they can't be a filter target. In some cases it may be necessary to auto-expand the hierarchy up to a desired grouping node (and not auto-expand grouping nodes below them), which can be achieved by setting the `autoExpand` property to `{ depth: number, includeGroupingNodes: true }`, where depth represents grouping node depth in the hierarchy:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.HierarchyFilteringPathImport, Presentation.Hierarchies.HierarchyFiltering.AutoExpandUntilDepthWithGrouping.FilteringPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchySearchPath } from "@itwin/presentation-hierarchies";

// Hierarchy has two grouping nodes under C element: one class grouping and one label grouping node.
// Get grouping node that groups the "C" element and is the nearest grouping node to it
const groupingNode = await getSelectedGroupingNode();
const searchPath: HierarchySearchPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  options: {
    // Auto-expand the hierarchy up to the last grouping node. The `depth` attribute equals to the number of parents.
    autoExpand: { includeGroupingNodes: true, depth: groupingNode.parentKeys.length },
  },
};
```

<!-- END EXTRACTION -->
