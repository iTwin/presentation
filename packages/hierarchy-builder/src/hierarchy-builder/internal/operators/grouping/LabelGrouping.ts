/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GroupingNodeKey, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult } from "../Grouping";

/** @internal */
export async function createLabelGroups(nodes: ProcessedInstanceHierarchyNode[]): Promise<GroupingHandlerResult> {
  const outputNodes: GroupingHandlerResult = {
    grouped: [],
    ungrouped: [],
    groupingType: "label",
  };

  for (const node of nodes) {
    if (!node.processingParams?.grouping?.byLabel) {
      outputNodes.ungrouped.push(node);
      continue;
    }
    if (outputNodes.grouped.length > 0) {
      const lastGroupedNode = outputNodes.grouped[outputNodes.grouped.length - 1];
      if (node.label === lastGroupedNode.label) {
        lastGroupedNode.children.push({ ...node, parentKeys: [...node.parentKeys, lastGroupedNode.key] });
        continue;
      }
    }
    const groupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: node.label,
    };
    outputNodes.grouped.push({
      label: node.label,
      key: groupingNodeKey,
      parentKeys: [...node.parentKeys],
      children: [{ ...node, parentKeys: [...node.parentKeys, groupingNodeKey] }],
    });
  }

  return outputNodes;
}
