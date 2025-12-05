# Hierarchy search

Hierarchy search is a concept where the hierarchy is filtered to a subset that contains only the requested nodes, their ancestors and their children.

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

And these are the node paths we want to search by:

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

Let's say, we want the hierarchy to contain only the nodes with "C" label. In this case it may be useful to display to the user where exactly "C" node is located without showing all of its 100 children. This is possible to do by providing an additional `reveal` option to a search path, which indicates that the hierarchy should be auto-expanded up to the target node. A `HierarchyProvider` would then set the `autoExpand` flag on the nodes that are part of the searched hierarchy up to the target node, and the component that renders the hierarchy would make sure such nodes are expanded when the hierarchy is displayed. So the searched and auto-expanded hierarchy would look like this:

```txt
+ A                       (auto-expanded)
+--+ B                    (auto-expanded)
|  +--+ C                 (collapsed)
|     +--+ ...100 nodes
```

The following code snippet shows, how to create a search path that includes the `autoExpand` flag:

<!-- [[include: [Presentation.Hierarchies.HierarchySearch.HierarchySearchPathImport, Presentation.Hierarchies.HierarchySearch.AutoExpand.SearchPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchySearchPath } from "@itwin/presentation-hierarchies";

// Get a grouping node that groups the "C" element
const searchPath: HierarchySearchPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  // Supply options for the search path
  options: {
    // Reveal the target "C" node in hierarchy by setting auto-expand flag on all its ancestor nodes
    reveal: true,
  },
};
```

<!-- END EXTRACTION -->

There is also an option to expand filter targets, this can be achieved by setting `autoExpand` flag:

<!-- [[include: [Presentation.Hierarchies.HierarchyFiltering.HierarchyFilteringPathImport, Presentation.Hierarchies.HierarchyFiltering.autoExpand.FilteringPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchyFilteringPath } from "@itwin/presentation-hierarchies";

const filteringPath: HierarchyFilteringPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  options: {
    // Auto-expand all nodes up to element "C".
    reveal: true,
    // Auto-expand the filter target ("C" node) as well.
    autoExpand: true,
  },
};
```

<!-- END EXTRACTION -->

Additionally, you might not want to add `autoExpand` flag to every node in `HierarchyFilteringPath`. For such cases hierarchies may be expanded up to desired depth, which can be achieved by setting the `reveal` property to `{ depthInPath: number }`, where `depthInPath` represents instance's index in the `path` array:

<!-- [[include: [Presentation.Hierarchies.HierarchySearch.HierarchySearchPathImport, Presentation.Hierarchies.HierarchySearch.AutoExpandUntilDepthInPath.SearchPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchySearchPath } from "@itwin/presentation-hierarchies";

const searchPath: HierarchySearchPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  options: {
    // Reveal node "B" (index in filtering path equals `1`) in hierarchy by setting auto-expand flag on all its ancestors
    reveal: { depthInPath: 1 },
  },
};
```

<!-- END EXTRACTION -->

Also, hierarchies may contain grouping nodes, which don't represent anything by themselves, which means they can't be a search target. In some cases it may be necessary to auto-expand the hierarchy up to a desired grouping node (and not auto-expand grouping nodes below them), which can be achieved by setting the `autoExpand` property to `{ depthInHierarchy: number }`, where depth represents grouping node depth in the hierarchy:

<!-- [[include: [Presentation.Hierarchies.HierarchySearch.HierarchySearchPathImport, Presentation.Hierarchies.HierarchySearch.AutoExpandUntilDepthInHierarchy.SearchPath], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { HierarchySearchPath } from "@itwin/presentation-hierarchies";

// Hierarchy has this structure: A -> class grouping node -> label grouping node -> B -> class grouping node -> label grouping node -> C.
// Hierarchy has two grouping nodes that group C element: one class grouping and one label grouping node.

// Get label grouping node that groups the "C" element
const groupingNode = await getSelectedGroupingNode();
const searchPath: HierarchySearchPath = {
  // Path to the element "C"
  path: [elementKeys.a, elementKeys.b, elementKeys.c],
  options: {
    // Reveal (set auto-expand flag for all nodes up to the specified depth) hierarchy up to (but not including) the last label grouping node.
    // The `depthInHierarchy` attribute is the index of the last label grouping node. It is equal to the number of parents.
    reveal: { depthInHierarchy: groupingNode.parentKeys.length },
  },
};
```

<!-- END EXTRACTION -->
