/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { ECClass, IMetadataProvider } from "../../../ECMetadata";
import {
  HierarchyNodePropertiesGroupingParams,
  HierarchyNodePropertyGroup,
  HierarchyNodePropertyValueRange,
  ProcessedInstanceHierarchyNode,
  PropertyGroupingNodeKey,
} from "../../../HierarchyNode";
import { translate } from "../../../Localization";
import { OmitOverUnion } from "../../../Utils";
import { IPrimitiveValueFormatter } from "../../../values/Formatting";
import { TypedPrimitiveValue } from "../../../values/Values";
import { getClass } from "../../Common";
import { GroupingHandler, GroupingHandlerResult, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";
import { sortNodesByLabel } from "../Sorting";

interface DisplayablePropertyGroupingInfo {
  label: string;
  propertyGroupingNodeKey: OmitOverUnion<PropertyGroupingNodeKey, "groupedInstanceKeys">;
}

interface PropertyGroupingInformation {
  ungrouped: ProcessedInstanceHierarchyNode[];
  grouped: Map<string, { displayablePropertyGroupingInfo: DisplayablePropertyGroupingInfo; groupedNodes: ProcessedInstanceHierarchyNode[] }>;
}

/** @internal */
export interface PropertyGroupInfo {
  ecClass: ECClass;
  previousPropertiesGroupingInfo: PreviousPropertiesGroupingInfo;
  propertyGroup: Omit<HierarchyNodePropertyGroup, "propertyValue">;
}

/** @internal */
export type PreviousPropertiesGroupingInfo = Array<{ propertiesClassName: string; propertyGroup: Omit<HierarchyNodePropertyGroup, "propertyValue"> }>;

/** @internal */
export async function createPropertyGroups(
  metadata: IMetadataProvider,
  nodes: ProcessedInstanceHierarchyNode[],
  handlerGroupingParams: PropertyGroupInfo,
  valueFormatter: IPrimitiveValueFormatter,
): Promise<GroupingHandlerResult> {
  const groupings: PropertyGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    const byProperties = node.processingParams?.grouping?.byProperties;
    if (!byProperties) {
      groupings.ungrouped.push(node);
      continue;
    }
    if (!(await shouldCreatePropertyGroup(metadata, handlerGroupingParams, byProperties, node.key.instanceKeys[0].className))) {
      groupings.ungrouped.push(node);
      continue;
    }
    const currentProperty = byProperties.propertyGroups[handlerGroupingParams.previousPropertiesGroupingInfo.length];
    const partialPropertyNodeKeyToAdd = {
      propertyName: currentProperty.propertyName,
      propertyClassName: byProperties.propertiesClassName,
    };

    const propertyClass = handlerGroupingParams.ecClass;
    const property = await propertyClass.getProperty(currentProperty.propertyName);
    if (!property?.isPrimitive() || property.primitiveType === "Binary" || property.primitiveType === "IGeometry") {
      groupings.ungrouped.push(node);
      continue;
    }
    const koqName = (await property.kindOfQuantity)?.fullName;
    if (!currentProperty.propertyValue) {
      if (byProperties.createGroupForUnspecifiedValues) {
        addGroupingToMap(
          groupings.grouped,
          `${currentProperty.propertyName}:Unspecified`,
          {
            label: translate("grouping.unspecified-label"),
            propertyGroupingNodeKey: {
              type: "property-grouping:value",
              ...partialPropertyNodeKeyToAdd,
              formattedPropertyValue: "",
            },
          },
          node,
        );
        continue;
      }
      groupings.ungrouped.push(node);
      continue;
    }

    if (currentProperty.ranges) {
      if (typeof currentProperty.propertyValue === "number") {
        const propValue = currentProperty.propertyValue;
        const matchingRange = currentProperty.ranges.find((range) => propValue >= range.fromValue && propValue <= range.toValue);

        if (matchingRange) {
          const fromValueTypedPrimitive: TypedPrimitiveValue = {
            type: Number.isInteger(matchingRange.fromValue) ? "Integer" : "Double",
            extendedType: property.extendedTypeName,
            koqName,
            value: matchingRange.fromValue,
          };
          const toValueTypedPrimitive: TypedPrimitiveValue = {
            type: Number.isInteger(matchingRange.toValue) ? "Integer" : "Double",
            extendedType: property.extendedTypeName,
            koqName,
            value: matchingRange.toValue,
          };

          const rangeLabel = matchingRange.rangeLabel ?? `${await valueFormatter(fromValueTypedPrimitive)} - ${await valueFormatter(toValueTypedPrimitive)}`;
          addGroupingToMap(
            groupings.grouped,
            `${currentProperty.propertyName}:${matchingRange.fromValue} - ${matchingRange.toValue}(${rangeLabel})`,
            {
              label: rangeLabel,
              propertyGroupingNodeKey: {
                ...partialPropertyNodeKeyToAdd,
                type: "property-grouping:range",
                fromValue: matchingRange.fromValue,
                toValue: matchingRange.toValue,
              },
            },
            node,
          );
          continue;
        }
      }
      if (byProperties.createGroupForOutOfRangeValues) {
        addGroupingToMap(
          groupings.grouped,
          "Other",
          {
            label: translate("grouping.other-label"),
            propertyGroupingNodeKey: {
              type: "property-grouping:other",
            },
          },
          node,
        );
        continue;
      }
      groupings.ungrouped.push(node);
      continue;
    }

    const formattedValue = await valueFormatter(
      TypedPrimitiveValue.create(currentProperty.propertyValue, property.primitiveType, koqName, property.extendedTypeName),
    );

    addGroupingToMap(
      groupings.grouped,
      `${currentProperty.propertyName}:${formattedValue}`,
      {
        label: formattedValue,
        propertyGroupingNodeKey: {
          ...partialPropertyNodeKeyToAdd,
          type: "property-grouping:value",
          formattedPropertyValue: formattedValue,
        },
      },
      node,
    );
  }
  return createGroupingNodes(groupings);
}

function addGroupingToMap(
  groupingMap: Map<string, { displayablePropertyGroupingInfo: DisplayablePropertyGroupingInfo; groupedNodes: ProcessedInstanceHierarchyNode[] }>,
  mapKey: string,
  propertyToAdd: DisplayablePropertyGroupingInfo,
  node: ProcessedInstanceHierarchyNode,
): void {
  let groupingInfo = groupingMap.get(mapKey);
  if (!groupingInfo) {
    groupingInfo = {
      displayablePropertyGroupingInfo: propertyToAdd,
      groupedNodes: [node],
    };
    groupingMap.set(mapKey, groupingInfo);
    return;
  }
  groupingInfo.groupedNodes.push(node);
}

function createGroupingNodes(groupings: PropertyGroupingInformation): GroupingHandlerResult {
  const groupedNodes = new Array<ProcessedInstancesGroupingHierarchyNode>();
  groupings.grouped.forEach((entry) => {
    const groupedNodeParentKeys = entry.groupedNodes[0].parentKeys;
    groupedNodes.push({
      label: entry.displayablePropertyGroupingInfo.label,
      key: {
        ...entry.displayablePropertyGroupingInfo.propertyGroupingNodeKey,
        groupedInstanceKeys: entry.groupedNodes.flatMap((groupedInstanceNode) => groupedInstanceNode.key.instanceKeys),
      },
      parentKeys: groupedNodeParentKeys,
      children: entry.groupedNodes.map((gn) => ({
        ...gn,
        parentKeys: [...groupedNodeParentKeys, entry.displayablePropertyGroupingInfo.propertyGroupingNodeKey],
      })),
    });
  });
  return { grouped: sortNodesByLabel(groupedNodes), ungrouped: groupings.ungrouped, groupingType: "property" };
}

/** @internal */
export async function getUniquePropertiesGroupInfo(metadata: IMetadataProvider, nodes: ProcessedInstanceHierarchyNode[]): Promise<Array<PropertyGroupInfo>> {
  const uniqueProperties = new Map<string, PropertyGroupInfo>();
  for (const node of nodes) {
    const byProperties = node.processingParams?.grouping?.byProperties;
    if (!byProperties) {
      continue;
    }

    const previousPropertiesInfo = new Array<{ propertyGroup: HierarchyNodePropertyGroup; propertyGroupKey: string }>();
    for (const propertyGroup of byProperties.propertyGroups) {
      const mapKeyRanges = getRangesAsString(propertyGroup.ranges);
      const lastKey = previousPropertiesInfo.length > 0 ? previousPropertiesInfo[previousPropertiesInfo.length - 1].propertyGroupKey : "";
      const propertyGroupKey = `${lastKey}:${propertyGroup.propertyName}(${mapKeyRanges})`;
      const mapKey = `${byProperties.propertiesClassName}:${propertyGroupKey}`;

      if (!uniqueProperties.get(mapKey)) {
        uniqueProperties.set(mapKey, {
          ecClass: await getClass(metadata, byProperties.propertiesClassName),
          propertyGroup: {
            propertyName: propertyGroup.propertyName,
            ranges: propertyGroup.ranges,
          },
          previousPropertiesGroupingInfo: previousPropertiesInfo.map((groupingInfo) => ({
            propertiesClassName: byProperties.propertiesClassName,
            propertyGroup: groupingInfo.propertyGroup,
          })),
        });
      }

      previousPropertiesInfo.push({
        propertyGroup,
        propertyGroupKey,
      });
    }
  }
  // Order might change in uniqueProperties, resorting to make sure that properties with fewer previous properties are returned first.
  return [...uniqueProperties.values()].sort((lhs, rhs) => lhs.previousPropertiesGroupingInfo.length - rhs.previousPropertiesGroupingInfo.length);
}

function getRangesAsString(ranges?: HierarchyNodePropertyValueRange[]): string {
  return ranges
    ? ranges
        .map((range) => `${range.fromValue}-${range.toValue}(${range.rangeLabel ?? ""})`)
        .sort()
        .join(";")
    : "";
}

async function shouldCreatePropertyGroup(
  metadata: IMetadataProvider,
  handlerGroupingParams: PropertyGroupInfo,
  nodePropertyGroupingParams: HierarchyNodePropertiesGroupingParams,
  nodeFullClassName: string,
): Promise<boolean> {
  if (
    nodePropertyGroupingParams.propertiesClassName !== handlerGroupingParams.ecClass.fullName ||
    nodePropertyGroupingParams.propertyGroups.length < handlerGroupingParams.previousPropertiesGroupingInfo.length + 1
  ) {
    return false;
  }
  const currentProperty = nodePropertyGroupingParams.propertyGroups[handlerGroupingParams.previousPropertiesGroupingInfo.length];
  if (
    currentProperty.propertyName !== handlerGroupingParams.propertyGroup.propertyName ||
    !doRangesMatch(currentProperty.ranges, handlerGroupingParams.propertyGroup.ranges)
  ) {
    return false;
  }
  if (!doPreviousPropertiesMatch(handlerGroupingParams.previousPropertiesGroupingInfo, nodePropertyGroupingParams)) {
    return false;
  }
  const nodeClass = await getClass(metadata, nodeFullClassName);
  if (!(await nodeClass.is(handlerGroupingParams.ecClass))) {
    return false;
  }
  return true;
}

/** @internal */
export function doPreviousPropertiesMatch(
  previousPropertiesGroupingInfo: PreviousPropertiesGroupingInfo,
  nodesProperties: HierarchyNodePropertiesGroupingParams,
): boolean {
  return (
    previousPropertiesGroupingInfo.length <= nodesProperties.propertyGroups.length &&
    previousPropertiesGroupingInfo.every(
      (groupingInfo, index) =>
        groupingInfo.propertiesClassName === nodesProperties.propertiesClassName &&
        groupingInfo.propertyGroup.propertyName === nodesProperties.propertyGroups[index].propertyName &&
        doRangesMatch(groupingInfo.propertyGroup.ranges, nodesProperties.propertyGroups[index].ranges),
    )
  );
}

/** @internal */
export function doRangesMatch(ranges1: HierarchyNodePropertyValueRange[] | undefined, ranges2: HierarchyNodePropertyValueRange[] | undefined): boolean {
  if (typeof ranges1 !== typeof ranges2) {
    return false;
  }
  if (!ranges1) {
    return true;
  }
  assert(Array.isArray(ranges2));
  if (ranges1.length !== ranges2.length) {
    return false;
  }
  return (
    // Check twice, to validate if both ranges have the same elements (elements can be in a different order)
    ranges1.every((lhsRange) =>
      ranges2.some(
        (rhsRange) => lhsRange.fromValue === rhsRange.fromValue && lhsRange.toValue === rhsRange.toValue && lhsRange.rangeLabel === rhsRange.rangeLabel,
      ),
    ) &&
    ranges2.every((lhsRange) =>
      ranges1.some(
        (rhsRange) => lhsRange.fromValue === rhsRange.fromValue && lhsRange.toValue === rhsRange.toValue && lhsRange.rangeLabel === rhsRange.rangeLabel,
      ),
    )
  );
}

/** @internal */
export async function createPropertiesGroupingHandlers(
  metadata: IMetadataProvider,
  nodes: ProcessedInstanceHierarchyNode[],
  valueFormatter: IPrimitiveValueFormatter,
): Promise<GroupingHandler[]> {
  const propertiesGroupInfo = await getUniquePropertiesGroupInfo(metadata, nodes);
  return propertiesGroupInfo.map((propertyInfo) => async (allNodes) => createPropertyGroups(metadata, allNodes, propertyInfo, valueFormatter));
}
