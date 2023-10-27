/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult } from "../Grouping";

/** @internal */
export async function createLabelGroups(nodes: HierarchyNode[]): Promise<GroupingHandlerResult> {
  const outputNodes: GroupingHandlerResult = {
    grouped: [],
    ungrouped: [],
    groupingType: "label",
  };

  for (const node of nodes) {
    if (!node.params?.grouping?.byLabel) {
      outputNodes.ungrouped.push(node);
      continue;
    }

    if (outputNodes.grouped.length > 0) {
      const lastGroupedNode = outputNodes.grouped[outputNodes.grouped.length - 1];
      if (node.label === lastGroupedNode.label && Array.isArray(lastGroupedNode.children)) {
        lastGroupedNode.children.push(node);
        continue;
      }
    }
    outputNodes.grouped.push(createLabelGroupingNode(node));
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
