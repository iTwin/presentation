/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/


import { LabelGroupingNodeKey, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { compareNodesByLabel, mergeNodes, mergeSortedArrays } from "../../Common";
import { GroupingHandlerResult, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";
import { sortNodesByLabel } from "../Sorting";

/** @internal */
export async function createLabelGroups(nodes: ProcessedInstanceHierarchyNode[]): Promise<GroupingHandlerResult> {
  const ungrouped = new Array<ProcessedInstanceHierarchyNode>();
  const nodesToMergeMap = new Map<string, ProcessedInstanceHierarchyNode[]>();
  const nodesToGroupMap = new Map<string, ProcessedInstanceHierarchyNode[]>();
  for (const node of nodes) {
    const byLabel = node.processingParams?.grouping?.byLabel;
    if (!byLabel) {
      ungrouped.push(node);
      continue;
    }
    const nodeMapKeyIdentifier = `label:"${node.label}";groupId:${JSON.stringify(typeof byLabel === "object" ? byLabel.groupId : undefined)}`;
    const map = typeof byLabel === "object" && byLabel.action === "merge" ? nodesToMergeMap : nodesToGroupMap;
    let list = map.get(nodeMapKeyIdentifier);
    if (!list) {
      list = [];
      map.set(nodeMapKeyIdentifier, list);
    }
    list.push(node);
  }
  const mergedNodes = new Array<ProcessedInstanceHierarchyNode>();
  nodesToMergeMap.forEach((entry) => {
    let finalNode = entry[0];
    for (let i = 1; i < entry.length; ++i) {
      finalNode = mergeNodes(finalNode, entry[i]);
    }
    mergedNodes.push(finalNode);
  });

  const groupedNodes = new Array<ProcessedInstancesGroupingHierarchyNode>();
  nodesToGroupMap.forEach((entry) => {
    const byLabel = entry[0].processingParams?.grouping?.byLabel;
    const groupId = typeof byLabel === "object" ? byLabel.groupId : undefined;
    const groupingNodeKey: LabelGroupingNodeKey = {
      type: "label-grouping",
      label: entry[0].label,
      groupId,
    };
    const groupedNodeParentKeys = entry[0].parentKeys;
    groupedNodes.push({
      label: entry[0].label,
      key: groupingNodeKey,
      parentKeys: groupedNodeParentKeys,
      groupedInstanceKeys: entry.flatMap((groupedInstanceNode) => groupedInstanceNode.key.instanceKeys),
      children: entry.map((gn) => ({ ...gn, parentKeys: [...groupedNodeParentKeys, groupingNodeKey] })),
    });
  });

  return {
    grouped: sortNodesByLabel(groupedNodes),
    ungrouped: mergeSortedArrays(ungrouped, sortNodesByLabel(mergedNodes), compareNodesByLabel),
    groupingType: "label",
  };
}
