/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { ECClass, IMetadataProvider } from "../../../Metadata";
import { getClass } from "../../Common";
import { GroupingHandlerReturn } from "../Grouping";

export async function getBaseClassGroupingECClasses(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<ECClass[]> {
  const baseEntityAndRelationshipECClassesArray = new Array<ECClass>();
  // Get all base class names that are provided in the grouping information
  const baseClassesFullClassNames = getAllBaseClasses(nodes);
  if (baseClassesFullClassNames.size === 0) {
    return baseEntityAndRelationshipECClassesArray;
  }
  for (const fullName of baseClassesFullClassNames) {
    const specificNodeClass = await getClass(metadata, fullName);
    if (specificNodeClass.isRelationshipClass() || specificNodeClass.isEntityClass()) {
      baseEntityAndRelationshipECClassesArray.push(specificNodeClass);
    }
  }
  const baseECClassesSorted = await sortByBaseClass(baseEntityAndRelationshipECClassesArray);
  return baseECClassesSorted;
}

export async function createBaseClassGroupsForSingleBaseClass(
  metadata: IMetadataProvider,
  nodes: HierarchyNode[],
  baseECClass: ECClass,
): Promise<GroupingHandlerReturn> {
  const finalAllNodeHierarchy = new Array<HierarchyNode>();
  const finalGroupedNodeHierarchy = new Array<HierarchyNode>();
  const baseClassGroupingNode: HierarchyNode = {
    label: baseECClass.fullName,
    key: {
      type: "class-grouping",
      class: { name: baseECClass.fullName, label: baseECClass.label ?? baseECClass.name },
    },
    children: [],
  };
  finalAllNodeHierarchy.push(baseClassGroupingNode);
  finalGroupedNodeHierarchy.push(baseClassGroupingNode);
  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byBaseClasses) {
      let classNameIsInNodeBaseClassList = false;
      // check if the node should be grouped by this baseClass
      for (const className of node.params.grouping.byBaseClasses.fullClassNames) {
        if (className === baseECClass.fullName) {
          classNameIsInNodeBaseClassList = true;
          break;
        }
      }
      if (classNameIsInNodeBaseClassList) {
        const fullCurrentNodeClassName = node.key.instanceKeys[0].className;
        const currentNodeECClass = await getClass(metadata, fullCurrentNodeClassName);
        if (await currentNodeECClass.is(baseECClass)) {
          if (finalAllNodeHierarchy.length > 0 && Array.isArray(baseClassGroupingNode.children)) {
            baseClassGroupingNode.children.push(node);
            continue;
          }
        }
      }
    }
    finalAllNodeHierarchy.push(node);
  }

  // remove grouping node if it did not have any children
  if (Array.isArray(baseClassGroupingNode.children) && baseClassGroupingNode.children.length === 0) {
    finalAllNodeHierarchy.splice(0, 1);
    finalGroupedNodeHierarchy.splice(0, 1);
  }
  return { allNodes: finalAllNodeHierarchy, groupedNodes: finalGroupedNodeHierarchy, groupingType: "base-class" };
}

export function getAllBaseClasses(nodes: HierarchyNode[]): Set<string> {
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

export async function sortByBaseClass(classes: ECClass[]): Promise<ECClass[]> {
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
