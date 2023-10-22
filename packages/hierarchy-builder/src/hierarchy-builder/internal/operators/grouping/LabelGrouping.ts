/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult } from "../Grouping";

/** @internal */
export async function createLabelGroups(nodes: HierarchyNode[]): Promise<GroupingHandlerResult> {
  if (nodes.length === 0) {
    return { allNodes: nodes, groupedNodes: [], groupingType: "label" };
  }
  const firstNode: HierarchyNode = nodes[0].params?.grouping?.byLabel ? createLabelGroupingNode(nodes[0]) : nodes[0];
  const outputNodes: GroupingHandlerResult = {
    allNodes: [firstNode],
    groupedNodes: HierarchyNode.isLabelGroupingNode(firstNode) ? [firstNode] : [],
    groupingType: "label",
  };

  for (let i = 1; i < nodes.length; ++i) {
    const currentNode = nodes[i];
    const lastOutputNode = outputNodes.allNodes[outputNodes.allNodes.length - 1];
    if (currentNode.label === lastOutputNode.label) {
      if (HierarchyNode.isLabelGroupingNode(lastOutputNode) && Array.isArray(lastOutputNode.children)) {
        if (currentNode.params?.grouping?.byLabel) {
          lastOutputNode.children.push(currentNode);
        } else {
          outputNodes.allNodes.splice(outputNodes.allNodes.length - 1, 0, currentNode);
        }
        continue;
      }
    } else if (currentNode.params?.grouping?.byLabel) {
      const labelGroupingNode = createLabelGroupingNode(currentNode);
      outputNodes.allNodes.push(labelGroupingNode);
      outputNodes.groupedNodes.push(labelGroupingNode);
      continue;
    }
    outputNodes.allNodes.push(currentNode);
  }

  return outputNodes;
}

function createLabelGroupingNode(node: HierarchyNode): HierarchyNode {
  return {
    label: node.label,
    key: {
      type: "label-grouping",
      label: node.label,
    },
    children: [node],
  };
}
