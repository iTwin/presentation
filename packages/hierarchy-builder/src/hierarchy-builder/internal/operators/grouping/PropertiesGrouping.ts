/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { ECClass, IMetadataProvider } from "../../../ECMetadata";
import { HierarchyNodePropertiesGroupingParams, ProcessedInstanceHierarchyNode, PropertyGroup, PropertyGroupingNodeKey, Range } from "../../../HierarchyNode";
import { translate } from "../../../Localization";
import { IPrimitiveValueFormatter } from "../../../values/Formatting";
import { TypedPrimitiveValue } from "../../../values/Values";
import { getClass } from "../../Common";
import { GroupingHandler, GroupingHandlerResult } from "../Grouping";

interface DisplayablePropertyGroupingInfo {
  label: string;
  propertyGroupingNodeKey: PropertyGroupingNodeKey;
}

interface PropertyGroupingInformation {
  ungrouped: ProcessedInstanceHierarchyNode[];
  grouped: Map<string, { displayablePropertyGroupingInfo: DisplayablePropertyGroupingInfo; groupedNodes: ProcessedInstanceHierarchyNode[] }>;
}

/** @internal */
export interface PropertyGroupInfo {
  ecClass: ECClass;
  previousPropertiesGroupingInfo: PreviousPropertiesGroupingInfo;
  propertyGroup: Omit<PropertyGroup, "propertyValue">;
}

/** @internal */
export type PreviousPropertiesGroupingInfo = Array<{ fullClassName: string; propertyGroup: Omit<PropertyGroup, "propertyValue"> }>;

/** @internal */
export async function createPropertyGroups(
  metadata: IMetadataProvider,
  nodes: ProcessedInstanceHierarchyNode[],
  extractedPropertyInfo: PropertyGroupInfo,
  valueFormatter: IPrimitiveValueFormatter,
): Promise<GroupingHandlerResult> {
  const groupings: PropertyGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    const byProperties = node.processingParams?.grouping?.byProperties;
    if (!byProperties) {
      groupings.ungrouped.push(node);
      continue;
    }
    if (!(await shouldCreatePropertyGroup(metadata, extractedPropertyInfo, byProperties, node.key.instanceKeys[0].className))) {
      groupings.ungrouped.push(node);
      continue;
    }
    const currentProperty = byProperties.propertyGroups[extractedPropertyInfo.previousPropertiesGroupingInfo.length];
    const partialPropertyNodeKeyToAdd = {
      propertyName: currentProperty.propertyName,
      fullClassName: byProperties.fullClassName,
    };

    if (currentProperty.propertyValue === undefined || currentProperty.propertyValue === "") {
      if (byProperties.createGroupForUnspecifiedValues) {
        addGroupingToMap(
          groupings.grouped,
          `${currentProperty.propertyName}:Unspecified`,
          {
            label: translate("grouping.unspecified-label"),
            propertyGroupingNodeKey: {
              ...partialPropertyNodeKeyToAdd,
              type: "property-grouping:value",
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
          const fromValueTypedPrimitive = {
            type: Number.isInteger(matchingRange.fromValue) ? "Integer" : "Double",
            value: matchingRange.fromValue,
          } as TypedPrimitiveValue;
          const toValueTypedPrimitive = {
            type: Number.isInteger(matchingRange.toValue) ? "Integer" : "Double",
            value: matchingRange.toValue,
          } as TypedPrimitiveValue;

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
          `${currentProperty.propertyName}:Other`,
          {
            label: translate("grouping.other-label"),
            propertyGroupingNodeKey: {
              ...partialPropertyNodeKeyToAdd,
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

    const propertyClass = await getClass(metadata, byProperties.fullClassName);
    const property = await propertyClass.getProperty(currentProperty.propertyName);
    if (!property?.isPrimitive()) {
      groupings.ungrouped.push(node);
      continue;
    }
    const formattedValue = await valueFormatter({
      type: property.primitiveType,
      extendedType: property.extendedTypeName,
      koqName: (await property.kindOfQuantity)?.fullName,
      value: currentProperty.propertyValue,
    });

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
  const outNodes: GroupingHandlerResult = { grouped: [], ungrouped: [], groupingType: "property" };
  groupings.grouped.forEach((entry) => {
    const groupingNodeKey = entry.displayablePropertyGroupingInfo.propertyGroupingNodeKey;
    const groupedNodeParentKeys = entry.groupedNodes[0].parentKeys;
    outNodes.grouped.push({
      label: entry.displayablePropertyGroupingInfo.label,
      key: groupingNodeKey,
      parentKeys: groupedNodeParentKeys,
      children: entry.groupedNodes.map((gn) => ({ ...gn, parentKeys: [...groupedNodeParentKeys, groupingNodeKey] })),
    });
  });
  outNodes.ungrouped.push(...groupings.ungrouped);
  return outNodes;
}

/** @internal */
export async function getUniquePropertiesGroupInfo(metadata: IMetadataProvider, nodes: ProcessedInstanceHierarchyNode[]): Promise<Array<PropertyGroupInfo>> {
  const uniqueProperties = new Map<string, PropertyGroupInfo>();
  for (const node of nodes) {
    const byProperties = node.processingParams?.grouping?.byProperties;
    if (!byProperties) {
      continue;
    }

    const previousPropertiesInfo = new Array<{ propertyGroup: PropertyGroup; propertyGroupKey: string }>();
    for (const propertyGroup of byProperties.propertyGroups) {
      const mapKeyRanges = getRangesAsString(propertyGroup.ranges);
      const lastKey = previousPropertiesInfo.length > 0 ? previousPropertiesInfo[previousPropertiesInfo.length - 1].propertyGroupKey : "";
      const propertyGroupKey = `${lastKey}:${propertyGroup.propertyName}(${mapKeyRanges})`;
      const mapKey = `${byProperties.fullClassName}:${propertyGroupKey}`;

      if (!uniqueProperties.get(mapKey)) {
        uniqueProperties.set(mapKey, {
          ecClass: await getClass(metadata, byProperties.fullClassName),
          propertyGroup: {
            propertyName: propertyGroup.propertyName,
            ranges: propertyGroup.ranges,
          },
          previousPropertiesGroupingInfo: previousPropertiesInfo.map((groupingInfo) => ({
            fullClassName: byProperties.fullClassName,
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

function getRangesAsString(ranges?: Range[]): string {
  return ranges
    ? ranges
        .map((range) => `${range.fromValue}-${range.toValue}(${range.rangeLabel ? `${range.rangeLabel}` : ""})`)
        .sort()
        .join(";")
    : "";
}

async function shouldCreatePropertyGroup(
  metadata: IMetadataProvider,
  extractedPropertyInfo: PropertyGroupInfo,
  nodePropertyGroupingParams: HierarchyNodePropertiesGroupingParams,
  nodeFullClassName: string,
): Promise<boolean> {
  if (
    nodePropertyGroupingParams.fullClassName !== extractedPropertyInfo.ecClass.fullName ||
    nodePropertyGroupingParams.propertyGroups.length < extractedPropertyInfo.previousPropertiesGroupingInfo.length + 1
  ) {
    return false;
  }
  const currentProperty = nodePropertyGroupingParams.propertyGroups[extractedPropertyInfo.previousPropertiesGroupingInfo.length];
  if (
    currentProperty.propertyName !== extractedPropertyInfo.propertyGroup.propertyName ||
    !doRangesMatch(currentProperty.ranges, extractedPropertyInfo.propertyGroup.ranges)
  ) {
    return false;
  }
  if (!doPreviousPropertiesMatch(extractedPropertyInfo.previousPropertiesGroupingInfo, nodePropertyGroupingParams)) {
    return false;
  }
  const nodeClass = await getClass(metadata, nodeFullClassName);
  if (!(await nodeClass.is(extractedPropertyInfo.ecClass))) {
    return false;
  }
  return true;
}

/** @internal */
export function doPreviousPropertiesMatch(
  previousPropertiesGroupingInfo: PreviousPropertiesGroupingInfo,
  nodesProperties: HierarchyNodePropertiesGroupingParams,
): boolean {
  return previousPropertiesGroupingInfo.every(
    (groupingInfo, index) =>
      groupingInfo.fullClassName === nodesProperties.fullClassName &&
      groupingInfo.propertyGroup.propertyName === nodesProperties.propertyGroups[index].propertyName &&
      doRangesMatch(groupingInfo.propertyGroup.ranges, nodesProperties.propertyGroups[index].ranges),
  );
}

/** @internal */
export function doRangesMatch(ranges1: Range[] | undefined, ranges2: Range[] | undefined): boolean {
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
