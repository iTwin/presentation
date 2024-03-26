/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IMetadataProvider } from "../../../ECMetadata";
import { ClassGroupingNodeKey, HierarchyNode, ParentHierarchyNode, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { getClass } from "../../GetClass";
import { GroupingHandlerResult, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";

interface ClassInfo {
  fullName: string;
  name: string;
  label?: string;
}

interface ClassGroupingInformation {
  ungrouped: ProcessedInstanceHierarchyNode[];
  grouped: Map<string, { class: ClassInfo; groupedNodes: ProcessedInstanceHierarchyNode[] }>;
}

/** @internal */
export async function createClassGroups(
  metadata: IMetadataProvider,
  parentNode: ParentHierarchyNode | undefined,
  nodes: ProcessedInstanceHierarchyNode[],
): Promise<GroupingHandlerResult> {
  const parentNodeClass = parentNode && HierarchyNode.isClassGroupingNode(parentNode) ? parentNode.key.className : undefined;
  const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    const nodeClassName = node.key.instanceKeys[0].className;
    if (node.processingParams?.grouping?.byClass && nodeClassName !== parentNodeClass) {
      let groupingInfo = groupings.grouped.get(nodeClassName);
      if (!groupingInfo) {
        const nodeClass = await getClass(metadata, nodeClassName);
        groupingInfo = {
          class: nodeClass,
          groupedNodes: [],
        };
        groupings.grouped.set(nodeClassName, groupingInfo);
      }
      groupingInfo.groupedNodes.push(node);
      continue;
    }
    groupings.ungrouped.push(node);
  }
  return createGroupingNodes(groupings);
}

function createGroupingNodes(groupings: ClassGroupingInformation): GroupingHandlerResult {
  const groupedNodes = new Array<ProcessedInstancesGroupingHierarchyNode>();
  groupings.grouped.forEach((entry) => {
    const groupingNodeKey: ClassGroupingNodeKey = {
      type: "class-grouping",
      className: entry.class.fullName,
    };
    const groupedNodeParentKeys = entry.groupedNodes[0].parentKeys;
    groupedNodes.push({
      label: entry.class.label ?? entry.class.name,
      key: groupingNodeKey,
      parentKeys: groupedNodeParentKeys,
      groupedInstanceKeys: entry.groupedNodes.flatMap((groupedInstanceNode) => groupedInstanceNode.key.instanceKeys),
      children: entry.groupedNodes.map((gn) => ({ ...gn, parentKeys: [...groupedNodeParentKeys, groupingNodeKey] })),
    });
  });
  return { grouped: groupedNodes, ungrouped: groupings.ungrouped, groupingType: "class" };
}
