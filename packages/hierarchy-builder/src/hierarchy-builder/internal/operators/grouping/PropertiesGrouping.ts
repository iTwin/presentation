/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { HierarchyNode, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
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
  nodes: ProcessedInstanceHierarchyNode[],
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
    if (node.processingParams?.grouping?.byBaseClasses) {
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
  fullClassName: string;
  previousPropertiesNames: string[];
  propertyName: string;
  ranges?: Array<{ fromValue: string; toValue: string; rangeLabel?: string }>;
}

async function getPropertyInfoFromNodesPropertiesGrouping(metadata: IMetadataProvider, nodes: ProcessedInstanceHierarchyNode[]): Promise<Set<PropertyGroupInfo>> {
  const propertyGroupInfo = new Set<PropertyGroupInfo>();
  for (const node of nodes) {
    const byProperties = node.processingParams?.grouping?.byProperties;
    if (byProperties) {
      for (const propertyGroup of byProperties.propertyGroups) {
        const specificNodePropertyGroupInfo = new Map();
        if (typeof propertyGroup === "string") {
          let groupingInfo = propertyGroupInfo.get(`${byProperties.fullClassName}:${propertyGroup}`);
          if (!groupingInfo) {
            groupingInfo = {
              fullClassName: byProperties.fullClassName,
              previousPropertyName
            }
            propertyGroupInfo.set(`${byProperties.fullClassName}:${propertyGroup}`, groupingInfo);
          }
          propertyGroupInfo.add({ `${node.processingParams.grouping.byProperties.fullClassName}:${propertyGroup}`, propertyName: propertyGroup });
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
export async function createPropertiesGroupingHandlers(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandler[]> {
  const propertiesInfo =
  const baseClassGroupingECClasses = await getBaseClassGroupingECClasses(metadata, nodes);
  return baseClassGroupingECClasses.map(
    (baseECClass) => async (allNodes: HierarchyNode[]) => createBaseClassGroupsForSingleBaseClass(metadata, allNodes, baseECClass),
  );
}
