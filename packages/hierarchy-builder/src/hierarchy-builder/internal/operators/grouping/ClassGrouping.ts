/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { IMetadataProvider } from "../../../Metadata";
import { getClass } from "../../Common";
import { GroupingHandlerResult } from "../Grouping";

interface ClassInfo {
  fullName: string;
  name: string;
  label?: string;
}

interface ClassGroupingInformation {
  ungrouped: Array<HierarchyNode>;
  grouped: Map<string, { class: ClassInfo; groupedNodes: Array<HierarchyNode> }>;
}

/** @internal */
export async function createClassGroups(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandlerResult> {
  const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    // we're only grouping instance nodes
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byClass) {
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
  const outNodes: GroupingHandlerResult = { grouped: [], ungrouped: [], groupingType: "class" };
  groupings.grouped.forEach((entry) => {
    const groupedNode: HierarchyNode = {
      label: entry.class.label ?? entry.class.name,
      key: {
        type: "class-grouping",
        class: { name: entry.class.fullName, label: entry.class.label },
      },
      children: entry.groupedNodes,
    };
    outNodes.grouped.push(groupedNode);
  });
  outNodes.ungrouped.push(...groupings.ungrouped);
  return outNodes;
}
