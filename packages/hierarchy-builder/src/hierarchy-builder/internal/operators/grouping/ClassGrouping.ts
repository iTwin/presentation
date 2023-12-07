/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IMetadataProvider } from "../../../ECMetadata";
import { ClassGroupingNodeKey, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { getClass } from "../../Common";
import { GroupingHandlerResult, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";
import { sortNodesByLabel } from "../Sorting";

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
export async function createClassGroups(metadata: IMetadataProvider, nodes: ProcessedInstanceHierarchyNode[]): Promise<GroupingHandlerResult> {
  const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    // we're only grouping instance nodes
    if (node.processingParams?.grouping?.byClass) {
      const fullClassName = node.key.instanceKeys[0].className;
      let groupingInfo = groupings.grouped.get(fullClassName);
      if (!groupingInfo) {
        const nodeClass = await getClass(metadata, fullClassName);
        groupingInfo = {
          class: nodeClass,
          groupedNodes: [],
        };
        groupings.grouped.set(fullClassName, groupingInfo);
      }
      groupingInfo.groupedNodes.push(node);
    } else {
      groupings.ungrouped.push(node);
    }
  }
  return createGroupingNodes(groupings);
}

function createGroupingNodes(groupings: ClassGroupingInformation): GroupingHandlerResult {
  const groupedNodes = new Array<ProcessedInstancesGroupingHierarchyNode>();
  groupings.grouped.forEach((entry) => {
    const groupingNodeKey: ClassGroupingNodeKey = {
      type: "class-grouping",
      class: { name: entry.class.fullName, label: entry.class.label },
    };
    const groupedNodeParentKeys = entry.groupedNodes[0].parentKeys;
    groupedNodes.push({
      label: entry.class.label ?? entry.class.name,
      key: groupingNodeKey,
      parentKeys: groupedNodeParentKeys,
      children: entry.groupedNodes.map((gn) => ({ ...gn, parentKeys: [...groupedNodeParentKeys, groupingNodeKey] })),
    });
  });
  return { grouped: sortNodesByLabel(groupedNodes), ungrouped: groupings.ungrouped, groupingType: "class" };
}
