/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import {
  createMainThreadReleaseOnTimePassedHandler,
  formatConcatenatedValue,
  getClass,
  TypedPrimitiveValue,
} from "@itwin/presentation-shared";
import { HierarchyNode } from "../../../HierarchyNode.js";
import { HierarchyNodeKey } from "../../../HierarchyNodeKey.js";

import type { ArrayElement, EC, ECSchemaProvider, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import type { ParentHierarchyNode } from "../../../HierarchyNode.js";
import type { PropertyGroupingNodeKey } from "../../../HierarchyNodeKey.js";
import type {
  HierarchyNodePropertiesGroupingParams,
  HierarchyNodePropertyGroup,
  HierarchyNodePropertyValueRange,
  ProcessedInstanceHierarchyNode,
} from "../../IModelHierarchyNode.js";
import type { GroupingHandler, GroupingHandlerResult, ProcessedInstancesGroupingHierarchyNode } from "../Grouping.js";

interface DisplayablePropertyGroupingInfo {
  label: string;
  propertyGroupingNodeKey: PropertyGroupingNodeKey;
}

interface PropertyGroupingInformation {
  ungrouped: ProcessedInstanceHierarchyNode[];
  grouped: Map<
    string,
    { displayablePropertyGroupingInfo: DisplayablePropertyGroupingInfo; groupedNodes: ProcessedInstanceHierarchyNode[] }
  >;
}

/** @internal */
export interface PropertiesGroupingLocalizedStrings {
  other: string;
  unspecified: string;
}

/** @internal */
export interface PropertyGroupInfo {
  ecClass: EC.Class;
  previousPropertiesGroupingInfo: PreviousPropertiesGroupingInfo;
  propertyGroup: Omit<HierarchyNodePropertyGroup, "propertyValue">;
}

/** @internal */
export type PreviousPropertiesGroupingInfo = Array<{
  propertiesClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  isRange?: boolean;
}>;

/** @internal */
export async function createPropertyGroups(
  nodesToGroup: ProcessedInstanceHierarchyNode[],
  nodesAlreadyGrouped: ProcessedInstancesGroupingHierarchyNode[],
  handlerGroupingParams: PropertyGroupInfo,
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  classHierarchyInspector: Pick<ECSchemaProvider, "classDerivesFrom">,
): Promise<GroupingHandlerResult> {
  let otherValuesGrouping: { node: ProcessedInstancesGroupingHierarchyNode; new: boolean } | undefined;
  const getOtherValuesGroupingNode = () => {
    if (!otherValuesGrouping) {
      const node = nodesAlreadyGrouped.find((n) => HierarchyNodeKey.isPropertyOtherValuesGrouping(n.key));
      if (node) {
        otherValuesGrouping = { node, new: false };
      }
    }
    otherValuesGrouping ??= {
      node: {
        key: { type: "property-grouping:other" as const, properties: [] },
        parentKeys: [],
        groupedInstanceKeys: [],
        label: localizedStrings.other,
        children: [],
      },
      new: true,
    };
    return otherValuesGrouping.node;
  };

  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  const groupings: PropertyGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodesToGroup) {
    await releaseMainThread();

    const byProperties = node.processingParams?.grouping?.byProperties;
    if (!byProperties) {
      groupings.ungrouped.push(node);
      continue;
    }
    if (
      !(await shouldCreatePropertyGroup(
        handlerGroupingParams,
        byProperties,
        node.key.instanceKeys[0].className,
        classHierarchyInspector,
      ))
    ) {
      groupings.ungrouped.push(node);
      continue;
    }
    const currentProperty = byProperties.propertyGroups[handlerGroupingParams.previousPropertiesGroupingInfo.length];
    const propertyClass = handlerGroupingParams.ecClass;
    const property = propertyClass.getProperty(currentProperty.propertyName);

    if (
      !property?.isNavigation() &&
      (!property?.isPrimitive() || property.primitiveType === "Binary" || property.primitiveType === "IGeometry")
    ) {
      groupings.ungrouped.push(node);
      continue;
    }

    const propertyIdentifier = { propertyName: property.name, propertyClassName: property.class.fullName };
    const extendedTypeName = "extendedTypeName" in property ? property.extendedTypeName : undefined;
    const primitiveType = "primitiveType" in property ? property.primitiveType : "String";
    assert(primitiveType !== "Binary" && primitiveType !== "IGeometry");

    if (!currentProperty.propertyValue) {
      if (byProperties.createGroupForUnspecifiedValues) {
        addGroupingToMap(
          groupings.grouped,
          `${propertyIdentifier.propertyName}:Unspecified`,
          {
            label: localizedStrings.unspecified,
            propertyGroupingNodeKey: {
              type: "property-grouping:value",
              ...propertyIdentifier,
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

    const koqName = property.kindOfQuantity?.fullName;
    if (currentProperty.ranges) {
      if (typeof currentProperty.propertyValue === "number") {
        const propValue = currentProperty.propertyValue;
        const matchingRange = currentProperty.ranges.find(
          (range) => propValue >= range.fromValue && propValue <= range.toValue,
        );

        if (matchingRange) {
          const fromValueTypedPrimitive: TypedPrimitiveValue = {
            type: Number.isInteger(matchingRange.fromValue) ? "Integer" : "Double",
            extendedType: extendedTypeName,
            koqName,
            value: matchingRange.fromValue,
          };
          const toValueTypedPrimitive: TypedPrimitiveValue = {
            type: Number.isInteger(matchingRange.toValue) ? "Integer" : "Double",
            extendedType: extendedTypeName,
            koqName,
            value: matchingRange.toValue,
          };

          const rangeLabel =
            matchingRange.rangeLabel ??
            `${await valueFormatter(fromValueTypedPrimitive)} - ${await valueFormatter(toValueTypedPrimitive)}`;
          addGroupingToMap(
            groupings.grouped,
            `${propertyIdentifier.propertyName}:[${matchingRange.fromValue}-${matchingRange.toValue}]${matchingRange.rangeLabel ? `(${matchingRange.rangeLabel})` : ""}`,
            {
              label: rangeLabel,
              propertyGroupingNodeKey: {
                ...propertyIdentifier,
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
        const groupingNode = getOtherValuesGroupingNode();
        assert(HierarchyNodeKey.isPropertyOtherValuesGrouping(groupingNode.key));
        const thisPropertyIdentifier = {
          className: propertyIdentifier.propertyClassName,
          propertyName: propertyIdentifier.propertyName,
        };
        const hasPropertyIdentifier = groupingNode.key.properties.find(
          (x) =>
            x.className === thisPropertyIdentifier.className && x.propertyName === thisPropertyIdentifier.propertyName,
        );
        if (!hasPropertyIdentifier) {
          groupingNode.key.properties.push(thisPropertyIdentifier);
        }
        node.key.instanceKeys.forEach((k) => groupingNode.groupedInstanceKeys.push(k));
        groupingNode.parentKeys = node.parentKeys;
        groupingNode.children.push(Object.assign(node, { parentKeys: [...node.parentKeys, groupingNode.key] }));
        continue;
      }
      groupings.ungrouped.push(node);
      continue;
    }

    const formattedValue =
      currentProperty.propertyValue instanceof Array
        ? await formatConcatenatedValue({ value: currentProperty.propertyValue, valueFormatter })
        : await valueFormatter(
            TypedPrimitiveValue.create(currentProperty.propertyValue, primitiveType, koqName, extendedTypeName),
          );

    addGroupingToMap(
      groupings.grouped,
      `${propertyIdentifier.propertyName}:${formattedValue}`,
      {
        label: formattedValue,
        propertyGroupingNodeKey: {
          ...propertyIdentifier,
          type: "property-grouping:value",
          formattedPropertyValue: formattedValue,
        },
      },
      node,
    );
  }
  return createGroupingNodes(groupings, otherValuesGrouping?.new ? otherValuesGrouping.node : undefined);
}

function addGroupingToMap(
  groupingMap: Map<
    string,
    { displayablePropertyGroupingInfo: DisplayablePropertyGroupingInfo; groupedNodes: ProcessedInstanceHierarchyNode[] }
  >,
  mapKey: string,
  propertyToAdd: DisplayablePropertyGroupingInfo,
  node: ProcessedInstanceHierarchyNode,
): void {
  let groupingInfo = groupingMap.get(mapKey);
  if (!groupingInfo) {
    groupingInfo = { displayablePropertyGroupingInfo: propertyToAdd, groupedNodes: [node] };
    groupingMap.set(mapKey, groupingInfo);
    return;
  }
  groupingInfo.groupedNodes.push(node);
}

function createGroupingNodes(
  groupings: PropertyGroupingInformation,
  otherValuesGroupingNode: ProcessedInstancesGroupingHierarchyNode | undefined,
): GroupingHandlerResult {
  const groupedNodes = new Array<ProcessedInstancesGroupingHierarchyNode>();
  groupings.grouped.forEach((entry) => {
    const groupedNodeParentKeys = entry.groupedNodes[0].parentKeys;
    groupedNodes.push({
      label: entry.displayablePropertyGroupingInfo.label,
      key: entry.displayablePropertyGroupingInfo.propertyGroupingNodeKey,
      parentKeys: groupedNodeParentKeys,
      groupedInstanceKeys: entry.groupedNodes.flatMap((groupedInstanceNode) => groupedInstanceNode.key.instanceKeys),
      children: entry.groupedNodes.map((gn) => ({
        ...gn,
        parentKeys: [...groupedNodeParentKeys, entry.displayablePropertyGroupingInfo.propertyGroupingNodeKey],
      })),
    });
  });
  if (otherValuesGroupingNode) {
    groupedNodes.push(otherValuesGroupingNode);
  }
  return { grouped: groupedNodes, ungrouped: groupings.ungrouped, groupingType: "property" };
}

function createNodePropertyGroupPathMatchers(
  node: ParentHierarchyNode,
): Array<(x: ArrayElement<PreviousPropertiesGroupingInfo>) => boolean> {
  if (!HierarchyNode.isPropertyGroupingNode(node)) {
    return [];
  }

  const keys = [...node.parentKeys, node.key];
  const propertyGroupingNodeKeys: PropertyGroupingNodeKey[] = [];
  for (let i = keys.length - 1; i >= 0; --i) {
    const key = keys[i];
    if (HierarchyNodeKey.isPropertyGrouping(key)) {
      propertyGroupingNodeKeys.push(key);
    } else {
      break;
    }
  }
  propertyGroupingNodeKeys.reverse();

  return propertyGroupingNodeKeys.map((key): ((x: ArrayElement<PreviousPropertiesGroupingInfo>) => boolean) => {
    switch (key.type) {
      case "property-grouping:other":
        return (x) =>
          key.properties.some(
            (p) => p.className === x.propertiesClassName && p.propertyName === x.propertyName && !!x.isRange,
          );
      case "property-grouping:range":
        return (x) => key.propertyClassName === x.propertiesClassName && key.propertyName === x.propertyName;
      case "property-grouping:value":
        return (x) => key.propertyClassName === x.propertiesClassName && key.propertyName === x.propertyName;
    }
  });
}

/** @internal */
export async function getUniquePropertiesGroupInfo(
  schemaProvider: ECSchemaProvider,
  parentNode: ParentHierarchyNode | undefined,
  nodes: ProcessedInstanceHierarchyNode[],
): Promise<Array<PropertyGroupInfo>> {
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  const parentPropertyGroupPath = parentNode ? createNodePropertyGroupPathMatchers(parentNode) : [];
  const uniqueProperties = new Map<string, PropertyGroupInfo>();
  // `getClass` resolves the same class for every node sharing a `propertiesClassName`, so resolve each class once and
  // reuse it across nodes instead of calling `getClass` (schema lookup + class lookup) on every node.
  const propertiesClassCache = new Map<EC.FullClassNameDotNotation, EC.Class>();
  const getPropertiesClass = async (fullClassName: EC.FullClassNameDotNotation): Promise<EC.Class> => {
    let ecClass = propertiesClassCache.get(fullClassName);
    if (!ecClass) {
      ecClass = await getClass(schemaProvider, fullClassName);
      propertiesClassCache.set(fullClassName, ecClass);
    }
    return ecClass;
  };
  for (const node of nodes) {
    await releaseMainThread();

    const byProperties = node.processingParams?.grouping?.byProperties;
    if (!byProperties) {
      continue;
    }

    const propertiesClass = await getPropertiesClass(byProperties.propertiesClassName);
    let propertyGroupIndex = 0;
    const previousPropertiesInfo = new Array<{ propertyGroup: HierarchyNodePropertyGroup; propertyGroupKey: string }>();
    for (const propertyGroup of byProperties.propertyGroups) {
      const property = propertiesClass.getProperty(propertyGroup.propertyName);
      const propertyName = property?.name ?? propertyGroup.propertyName;
      const propertyClassName = property?.class.fullName ?? propertiesClass.fullName;
      const mapKeyRanges = getRangesAsString(propertyGroup.ranges);
      const lastKey =
        previousPropertiesInfo.length > 0
          ? previousPropertiesInfo[previousPropertiesInfo.length - 1].propertyGroupKey
          : "";
      const propertyGroupKey = `${lastKey}:${propertyName}(${mapKeyRanges})`;
      const mapKey = `${propertiesClass.fullName}:${propertyGroupKey}`;

      let isAlreadyGrouped = false;
      if (parentPropertyGroupPath.length > 0 && propertyGroupIndex < parentPropertyGroupPath.length) {
        const groupMatcher = parentPropertyGroupPath[propertyGroupIndex];
        isAlreadyGrouped = groupMatcher({
          propertiesClassName: propertyClassName,
          propertyName,
          isRange: !!propertyGroup.ranges,
        });
      }
      if (!isAlreadyGrouped && !uniqueProperties.get(mapKey)) {
        uniqueProperties.set(mapKey, {
          ecClass: propertiesClass,
          propertyGroup: { propertyName, ranges: propertyGroup.ranges },
          previousPropertiesGroupingInfo: previousPropertiesInfo.map((groupingInfo) => ({
            propertiesClassName:
              propertiesClass.getProperty(groupingInfo.propertyGroup.propertyName)?.class.fullName ??
              propertiesClass.fullName,
            propertyName: groupingInfo.propertyGroup.propertyName,
            isRange: !!groupingInfo.propertyGroup.ranges,
          })),
        });
      }

      previousPropertiesInfo.push({ propertyGroup: { ...propertyGroup, propertyName }, propertyGroupKey });
      ++propertyGroupIndex;
    }
  }
  // Order might change in uniqueProperties, resorting to make sure that properties with fewer previous properties are returned first.
  return [...uniqueProperties.values()].sort(
    (lhs, rhs) => lhs.previousPropertiesGroupingInfo.length - rhs.previousPropertiesGroupingInfo.length,
  );
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
  handlerGroupingParams: PropertyGroupInfo,
  nodePropertyGroupingParams: HierarchyNodePropertiesGroupingParams,
  nodeFullClassName: EC.FullClassNameDotNotation,
  classHierarchyInspector: Pick<ECSchemaProvider, "classDerivesFrom">,
): Promise<boolean> {
  if (
    nodePropertyGroupingParams.propertiesClassName !== handlerGroupingParams.ecClass.fullName ||
    nodePropertyGroupingParams.propertyGroups.length < handlerGroupingParams.previousPropertiesGroupingInfo.length + 1
  ) {
    return false;
  }
  const currentProperty =
    nodePropertyGroupingParams.propertyGroups[handlerGroupingParams.previousPropertiesGroupingInfo.length];
  if (
    currentProperty.propertyName !== handlerGroupingParams.propertyGroup.propertyName ||
    !doRangesMatch(currentProperty.ranges, handlerGroupingParams.propertyGroup.ranges)
  ) {
    return false;
  }
  if (!doPreviousPropertiesMatch(handlerGroupingParams.previousPropertiesGroupingInfo, nodePropertyGroupingParams)) {
    return false;
  }
  return classHierarchyInspector.classDerivesFrom(nodeFullClassName, handlerGroupingParams.ecClass.fullName);
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
        groupingInfo.propertyName === nodesProperties.propertyGroups[index].propertyName &&
        !!groupingInfo.isRange === !!nodesProperties.propertyGroups[index].ranges,
    )
  );
}

/** @internal */
export function doRangesMatch(
  ranges1: HierarchyNodePropertyValueRange[] | undefined,
  ranges2: HierarchyNodePropertyValueRange[] | undefined,
): boolean {
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
        (rhsRange) =>
          lhsRange.fromValue === rhsRange.fromValue &&
          lhsRange.toValue === rhsRange.toValue &&
          lhsRange.rangeLabel === rhsRange.rangeLabel,
      ),
    ) &&
    ranges2.every((lhsRange) =>
      ranges1.some(
        (rhsRange) =>
          lhsRange.fromValue === rhsRange.fromValue &&
          lhsRange.toValue === rhsRange.toValue &&
          lhsRange.rangeLabel === rhsRange.rangeLabel,
      ),
    )
  );
}

/** @internal */
export async function createPropertiesGroupingHandlers(
  imodelAccess: ECSchemaProvider,
  parentNode: ParentHierarchyNode | undefined,
  nodes: ProcessedInstanceHierarchyNode[],
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
): Promise<GroupingHandler[]> {
  const propertiesGroupInfo = await getUniquePropertiesGroupInfo(imodelAccess, parentNode, nodes);
  return propertiesGroupInfo.map(
    (propertyInfo) => async (nodesToGroup, nodesAlreadyGrouped) =>
      createPropertyGroups(
        nodesToGroup,
        nodesAlreadyGrouped,
        propertyInfo,
        valueFormatter,
        localizedStrings,
        imodelAccess,
      ),
  );
}
