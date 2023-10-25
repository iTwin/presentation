/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult } from "../Grouping";

/** @internal */
export async function createLabelGroups(nodes: HierarchyNode[]): Promise<GroupingHandlerResult> {
  if (nodes.length === 0) {
    return { grouped: [], ungrouped: nodes, groupingType: "label" };
  }
  const firstNode: HierarchyNode = nodes[0].params?.grouping?.byLabel ? createLabelGroupingNode(nodes[0]) : nodes[0];
  const outputNodes: GroupingHandlerResult = HierarchyNode.isLabelGroupingNode(firstNode)
    ? {
        grouped: [firstNode],
        ungrouped: [],
        groupingType: "label",
      }
    : {
        grouped: [],
        ungrouped: [firstNode],
        groupingType: "label",
      };

  for (let i = 1; i < nodes.length; ++i) {
    const currentNode = nodes[i];
    if (!currentNode.params?.grouping?.byLabel) {
      outputNodes.ungrouped.push(currentNode);
      continue;
    }

    if (outputNodes.grouped.length > 0) {
      const lastGroupedNode = outputNodes.grouped[outputNodes.grouped.length - 1];
      if (currentNode.label === lastGroupedNode.label) {
        if (Array.isArray(lastGroupedNode.children)) {
          lastGroupedNode.children.push(currentNode);
          continue;
        }
      }
    }
    const labelGroupingNode = createLabelGroupingNode(currentNode);
    outputNodes.grouped.push(labelGroupingNode);
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
