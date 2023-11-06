/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../HierarchyNode";
import { ECClass, IMetadataProvider } from "../../../Metadata";
import { getClass } from "../../Common";
import { GroupingHandler, GroupingHandlerResult } from "../Grouping";

// /** @internal */
// export async function getPropertiesGroupingECClasses(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<ECClass[]> {
//   // Get all base class names that are provided in the grouping information
//   const propertyClasses = await getAllPropertyClasses(metadata, nodes);
//   if (propertyClasses.size === 0) {
//     return [];
//   }

//   return sortByBaseClass(propertyClasses.filter((baseClass) => baseClass.isRelationshipClass() || baseClass.isEntityClass()));
// }

/** @internal */
export async function createPropertyGrouping(
  metadata: IMetadataProvider,
  nodes: HierarchyNode[],
  propertyInfo: PropertyGroupInfo,
): Promise<GroupingHandlerResult> {
  const finalResult: GroupingHandlerResult = { grouped: [], ungrouped: [], groupingType: "property" };
  const baseClassGroupingNode: HierarchyNode = {
    label: propertyInfo.range ? propertyInfo.range.rangeLabel ?? `${propertyInfo.range.fromValue} - ${propertyInfo.range.toValue}` : "",
    key: {
      type: "property-grouping",
      property: { name: baseECClass.fullName, label: baseECClass.label ?? baseECClass.name },
    },
    children: [],
  };
  assert(Array.isArray(baseClassGroupingNode.children));

  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byBaseClasses) {
      if (!node.params.grouping.byBaseClasses.fullClassNames.some((className) => className === baseECClass.fullName)) {
        finalResult.ungrouped.push(node);
        continue;
      }
      const fullCurrentNodeClassName = node.key.instanceKeys[0].className;
      const currentNodeECClass = await getClass(metadata, fullCurrentNodeClassName);
      if (await currentNodeECClass.is(baseECClass)) {
        baseClassGroupingNode.children.push(node);
        continue;
      }
    }
    finalResult.ungrouped.push(node);
  }

  // push grouping node if it has children
  if (baseClassGroupingNode.children.length > 0) {
    finalResult.grouped.push(baseClassGroupingNode);
  }
  return finalResult;
}

interface PropertyGroupInfo {
  propertyClass: ECClass;
  propertyName: string;
  range?: { fromValue: string; toValue: string; rangeLabel?: string } | { fromValue: number; toValue: number; rangeLabel?: string };
}

async function getPropertyInfoFromNodesPropertiesGrouping(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<Set<PropertyGroupInfo>> {
  const propertyGroupInfo = new Set<PropertyGroupInfo>();
  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.byProperties) {
      const propertyClass = await getClass(metadata, node.params.grouping.byProperties.fullClassName);
      const nodeClass = await getClass(metadata, node.key.instanceKeys[0].className);
      if (!(await nodeClass.is(propertyClass))) {
        continue;
      }
      for (const propertyGroup of node.params.grouping.byProperties.propertyGroups) {
        if (typeof propertyGroup === "string") {
          if (!!(await propertyClass.getProperty(propertyGroup))) {
            propertyGroupInfo.add({ propertyClass, propertyName: propertyGroup });
          }
          continue;
        }
        if (!!(await propertyClass.getProperty(propertyGroup.propertyName))) {
          if (!propertyGroup.ranges) {
            propertyGroupInfo.add({ propertyClass, propertyName: propertyGroup.propertyName });
            continue;
          }
          for (const range of propertyGroup.ranges) {
            propertyGroupInfo.add({ propertyClass, propertyName: propertyGroup.propertyName, range });
          }
        }
      }
    }
  }
  return propertyGroupInfo;
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
export async function createBaseClassGroupingHandlers(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandler[]> {
  const baseClassGroupingECClasses = await getBaseClassGroupingECClasses(metadata, nodes);
  return baseClassGroupingECClasses.map(
    (baseECClass) => async (allNodes: HierarchyNode[]) => createBaseClassGroupsForSingleBaseClass(metadata, allNodes, baseECClass),
  );
}
