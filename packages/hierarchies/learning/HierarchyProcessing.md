# Hierarchy processing

This page describes how and in what order a hierarchy provider (see `createHierarchyProvider`) processes nodes.

1. The hierarchy definition's `defineHierarchyLevel` function is called to get the hierarchy level definitions.

2. Hierarchy level definitions are turned into nodes.

   2.1. In case the hierarchy level definition is a `CustomHierarchyNodeDefinition`, it's simply mapped to the custom node.

   2.2. In case the hierarchy level definition is an `InstanceNodesQueryDefinition`, the nodes are fetched from the iModel and parsed either by definition's `parseNode` function, or the default parser.

3. Nodes are passed through the labels formatter.

4. Nodes are passed through the hierarchy definition's `preProcessNode` function, if one is defined.

5. Nodes are passed through the hiding processor that hides based on their `hideIfNoChildren` and `hideInHierarchy` processing flags. This step may require loading children for some nodes, e.g. to find out if they have children or get the children to replace the processed node.

6. Nodes are passed through the grouping processor.

7. If nodes' children flag is undefined, it is determined by loading the children.

8. Nodes are passed through the hierarchy definition's `postProcessNode` function, if one is defined.

9. Nodes are sorted by label.

10. Nodes are cleaned up by removing the temporary properties added during processing.
