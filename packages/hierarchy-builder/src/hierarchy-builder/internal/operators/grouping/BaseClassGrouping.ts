/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/


import { ECClass, IMetadataProvider } from "../../../ECMetadata";
import { ClassGroupingNodeKey, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { BaseClassChecker } from "../../Common";
import { getClass } from "../../GetClass";
import { GroupingHandler, GroupingHandlerResult } from "../Grouping";

/** @internal */
export async function getBaseClassGroupingECClasses(metadata: IMetadataProvider, nodes: ProcessedInstanceHierarchyNode[]): Promise<ECClass[]> {
  // Get all base class names that are provided in the grouping information
  const baseClassesFullClassNames = getAllBaseClasses(nodes);
  if (baseClassesFullClassNames.size === 0) {
    return [];
  }

  const baseClasses = await Promise.all(Array.from(baseClassesFullClassNames).map(async (fullName) => getClass(metadata, fullName)));
  return sortByBaseClass(baseClasses.filter((baseClass) => baseClass.isRelationshipClass() || baseClass.isEntityClass()));
}

/** @internal */
export async function createBaseClassGroupsForSingleBaseClass(
  nodes: ProcessedInstanceHierarchyNode[],
  baseECClass: ECClass,
  baseClassChecker: BaseClassChecker,
): Promise<GroupingHandlerResult> {
  const groupedNodes = new Array<ProcessedInstanceHierarchyNode>();
  const ungroupedNodes = new Array<ProcessedInstanceHierarchyNode>();
  for (const node of nodes) {
    if (
      !node.processingParams?.grouping?.byBaseClasses ||
      !node.processingParams.grouping.byBaseClasses.fullClassNames.some((className) => className === baseECClass.fullName)
    ) {
      ungroupedNodes.push(node);
      continue;
    }
    const fullCurrentNodeClassName = node.key.instanceKeys[0].className;

    const isCurrentNodeClassOfBase = await baseClassChecker.isECClassOfBaseECClass(fullCurrentNodeClassName, baseECClass);

    if (isCurrentNodeClassOfBase) {
      groupedNodes.push(node);
    } else {
      ungroupedNodes.push(node);
    }
  }

  const result: GroupingHandlerResult = { grouped: [], ungrouped: ungroupedNodes, groupingType: "base-class" };
  if (groupedNodes.length > 0) {
    const groupingNodeKey: ClassGroupingNodeKey = {
      type: "class-grouping",
      class: { name: baseECClass.fullName, label: baseECClass.label ?? baseECClass.name },
    };
    result.grouped.push({
      label: baseECClass.label ?? baseECClass.name,
      key: groupingNodeKey,
      parentKeys: [...groupedNodes[0].parentKeys],
      groupedInstanceKeys: groupedNodes.flatMap((groupedInstanceNode) => groupedInstanceNode.key.instanceKeys),
      children: groupedNodes.map((gn) => ({ ...gn, parentKeys: [...gn.parentKeys, groupingNodeKey] })),
    });
  }
  return result;
}

function getAllBaseClasses(nodes: ProcessedInstanceHierarchyNode[]): Set<string> {
  const baseClasses = new Set<string>();
  for (const node of nodes) {
    if (node.processingParams?.grouping?.byBaseClasses) {
      for (const className of node.processingParams.grouping.byBaseClasses.fullClassNames) {
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

/** @internal */
export async function createBaseClassGroupingHandlers(
  metadata: IMetadataProvider,
  nodes: ProcessedInstanceHierarchyNode[],
  baseClassChecker: BaseClassChecker,
): Promise<GroupingHandler[]> {
  const baseClassGroupingECClasses = await getBaseClassGroupingECClasses(metadata, nodes);
  return baseClassGroupingECClasses.map((baseECClass) => async (allNodes) => createBaseClassGroupsForSingleBaseClass(allNodes, baseECClass, baseClassChecker));
}
