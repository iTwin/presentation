/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { ECClass, IMetadataProvider } from "../../../Metadata";
import { getClass } from "../../Common";
import { GroupingHandler, GroupingHandlerResult } from "../Grouping";

/** @internal */
export async function getBaseClassGroupingECClasses(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<ECClass[]> {
  // Get all base class names that are provided in the grouping information
  const baseClassesFullClassNames = getAllBaseClasses(nodes);
  if (baseClassesFullClassNames.size === 0) {
    return [];
  }

  const baseClasses = await Promise.all(Array.from(baseClassesFullClassNames).map(async (fullName) => getClass(metadata, fullName)));
  return sortByBaseClass(baseClasses.filter((baseClass) => baseClass.isRelationshipClass() || baseClass.isEntityClass()));
}

async function createBaseClassGroupsForSingleBaseClass(
  metadata: IMetadataProvider,
  nodes: HierarchyNode[],
  baseECClass: ECClass,
): Promise<GroupingHandlerResult> {
  const finalResult: GroupingHandlerResult = { allNodes: [], groupedNodes: [], ungroupedNodes: [], groupingType: "base-class" };
  const baseClassGroupingNode: HierarchyNode = {
    label: baseECClass.fullName,
    key: {
      type: "class-grouping",
      class: { name: baseECClass.fullName, label: baseECClass.label ?? baseECClass.name },
    },
    children: [],
  };
  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byBaseClasses) {
      if (!node.params.grouping.byBaseClasses.fullClassNames.some((className) => className === baseECClass.fullName)) {
        finalResult.allNodes.push(node);
        finalResult.ungroupedNodes.push(node);
        continue;
      }
      const fullCurrentNodeClassName = node.key.instanceKeys[0].className;
      const currentNodeECClass = await getClass(metadata, fullCurrentNodeClassName);
      if (await currentNodeECClass.is(baseECClass)) {
        if (Array.isArray(baseClassGroupingNode.children)) {
          baseClassGroupingNode.children.push(node);
          continue;
        }
      }
    }
    finalResult.allNodes.push(node);
    finalResult.ungroupedNodes.push(node);
  }

  // push grouping node if it has children
  if (Array.isArray(baseClassGroupingNode.children) && baseClassGroupingNode.children.length > 0) {
    finalResult.allNodes.push(baseClassGroupingNode);
    finalResult.groupedNodes.push(baseClassGroupingNode);
  }
  return finalResult;
}

function getAllBaseClasses(nodes: HierarchyNode[]): Set<string> {
  const baseClasses = new Set<string>();
  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byBaseClasses) {
      for (const className of node.params.grouping.byBaseClasses.fullClassNames) {
        baseClasses.add(className);
      }
    }
  }
  return baseClasses;
}

async function sortByBaseClass(classes: ECClass[]): Promise<ECClass[]> {
  if (classes.length === 0) {
    return classes;
  }
  const output: ECClass[] = [classes[0]];
  for (let inputIndex = 1; inputIndex < classes.length; ++inputIndex) {
    let wasAdded = false;
    for (let outputIndex = output.length - 1; outputIndex >= 0; --outputIndex) {
      if (await classes[inputIndex].is(output[outputIndex])) {
        output.splice(outputIndex + 1, 0, classes[inputIndex]);
        wasAdded = true;
        break;
      }
    }
    if (!wasAdded) {
      output.splice(0, 0, classes[inputIndex]);
    }
  }

  return output;
}

export async function createBaseClassGroupingHandlers(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandler[]> {
  const baseClassGroupingECClasses = await getBaseClassGroupingECClasses(metadata, nodes);
  return baseClassGroupingECClasses.map(
    (baseECClass) => async (allNodes: HierarchyNode[]) => createBaseClassGroupsForSingleBaseClass(metadata, allNodes, baseECClass),
  );
}
