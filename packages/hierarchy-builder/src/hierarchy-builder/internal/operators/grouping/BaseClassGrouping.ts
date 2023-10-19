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
      type: "base-class-grouping",
      class: { name: baseECClass.fullName, label: baseECClass.label ?? baseECClass.name },
    },
    children: [],
  };
  finalAllNodeHierarchy.push(baseClassGroupingNode);
  finalGroupedNodeHierarchy.push(baseClassGroupingNode);
  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byBaseClasses) {
      let classNameIsInBaseClassInfo = false;
      // check if the node should be grouped by this baseClass
      for (const classInfo of node.params.grouping.byBaseClasses.baseClassInfo) {
        const specificClassName = `${classInfo.schemaName}.${classInfo.className}`;
        if (specificClassName === baseECClass.fullName) {
          classNameIsInBaseClassInfo = true;
          break;
        }
      }
      if (classNameIsInBaseClassInfo) {
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
  return { allNodes: finalAllNodeHierarchy, groupedNodes: finalGroupedNodeHierarchy };
}

export function getAllBaseClasses(nodes: HierarchyNode[]): Set<string> {
  const baseClasses = new Set<string>();
  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byBaseClasses) {
      for (const classInfo of node.params.grouping.byBaseClasses.baseClassInfo) {
        const specificClassName = `${classInfo.schemaName}.${classInfo.className}`;
        baseClasses.add(specificClassName);
      }
    }
  }
  return baseClasses;
}

export async function sortByBaseClass(classes: ECClass[]) {
  const output: ECClass[] = [];
  const originalAmountOfClasses = classes.length;
  while (output.length < originalAmountOfClasses) {
    // Iterate through array of classes, if the element in the array is not parent class, it can be added to the outputArray and removed from the input array
    // Repeat this until all classes have been added to the outputArray
    for (let parentIndex = 0; parentIndex < classes.length; ++parentIndex) {
      let isParent = false;
      for (let childIndex = 0; childIndex < classes.length; ++childIndex) {
        if (childIndex !== parentIndex) {
          if (await classes[childIndex].is(classes[parentIndex])) {
            isParent = true;
            break;
          }
        }
      }
      if (!isParent) {
        output.push(classes[parentIndex]);
        classes.splice(parentIndex, 1);
        break;
      }
    }
  }
  // Output has all the classes, but parent classes have been added after their children. So the array has to be reversed.
  return output.reverse();
}
