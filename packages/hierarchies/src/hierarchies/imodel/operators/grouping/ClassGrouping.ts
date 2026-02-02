/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Dictionary } from "@itwin/core-bentley";
import type { ECSchemaProvider } from "@itwin/presentation-shared";
import { compareFullClassNames, createMainThreadReleaseOnTimePassedHandler, getClass } from "@itwin/presentation-shared";
import type { ParentHierarchyNode } from "../../../HierarchyNode.js";
import { HierarchyNode } from "../../../HierarchyNode.js";
import type { ClassGroupingNodeKey } from "../../../HierarchyNodeKey.js";
import type { ProcessedInstanceHierarchyNode } from "../../IModelHierarchyNode.js";
import type { GroupingHandlerResult, ProcessedInstancesGroupingHierarchyNode } from "../Grouping.js";

interface ClassInfo {
  fullName: string;
  name: string;
  label?: string;
}

interface ClassGroupingInformation {
  ungrouped: ProcessedInstanceHierarchyNode[];
  grouped: Dictionary<string, { class: ClassInfo; groupedNodes: ProcessedInstanceHierarchyNode[] }>;
}

/** @internal */
export async function createClassGroups(
  schemaProvider: ECSchemaProvider,
  parentNode: ParentHierarchyNode | undefined,
  nodes: ProcessedInstanceHierarchyNode[],
): Promise<GroupingHandlerResult> {
  const parentNodeClass = parentNode && HierarchyNode.isClassGroupingNode(parentNode) ? parentNode.key.className : undefined;
  const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Dictionary(compareFullClassNames) };
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  for (const node of nodes) {
    await releaseMainThread();
    const nodeClassName = node.key.instanceKeys[0].className;
    if (node.processingParams?.grouping?.byClass && (!parentNodeClass || compareFullClassNames(nodeClassName, parentNodeClass) !== 0)) {
      let groupingInfo = groupings.grouped.get(nodeClassName);
      if (!groupingInfo) {
        const nodeClass = await getClass(schemaProvider, nodeClassName);
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

async function createGroupingNodes(groupings: ClassGroupingInformation): Promise<GroupingHandlerResult> {
  const groupedNodes = new Array<ProcessedInstancesGroupingHierarchyNode>();
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  for (const { value: entry } of groupings.grouped) {
    await releaseMainThread();
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
      children: entry.groupedNodes.map((gn) => Object.assign(gn, { parentKeys: [...groupedNodeParentKeys, groupingNodeKey] })),
    });
  }
  return { grouped: groupedNodes, ungrouped: groupings.ungrouped, groupingType: "class" };
}
