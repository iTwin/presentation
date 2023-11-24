/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  HierarchyNodeAutoExpandProp,
  HierarchyNodeGroupingParamsBase,
  InstanceHierarchyNodeProcessingParams,
  ProcessedInstanceHierarchyNode,
} from "../../../HierarchyNode";
import { GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";

/** @internal */
export type OptionsAccessor = (processingParams: InstanceHierarchyNodeProcessingParams) => HierarchyNodeGroupingParamsBase | undefined;

/** @internal */
export type BaseGroupingParamsExtractor = (
  nodes: ProcessedInstanceHierarchyNode[],
  optionsAccessor: OptionsAccessor,
) => HierarchyNodeAutoExpandProp | undefined | { hideIfNoSiblings: boolean; hideIfOneGroupedNode: boolean };

/** @internal */
export function getGroupingBaseParamsOptionsFromParentNode(
  parentNode: ProcessedInstancesGroupingHierarchyNode,
  groupingType: GroupingType,
  baseGroupingParamsExtractor: BaseGroupingParamsExtractor,
): HierarchyNodeAutoExpandProp | { hideIfNoSiblings: boolean; hideIfOneGroupedNode: boolean } | undefined {
  switch (groupingType) {
    case "base-class":
      return baseGroupingParamsExtractor(parentNode.children, (p) => p.grouping?.byBaseClasses);
    case "class":
      return baseGroupingParamsExtractor(parentNode.children, (p) => (typeof p.grouping?.byClass === "object" ? p.grouping.byClass : undefined));
    case "label":
      return baseGroupingParamsExtractor(parentNode.children, (p) => (typeof p.grouping?.byLabel === "object" ? p.grouping.byLabel : undefined));
    case "property":
      return baseGroupingParamsExtractor(parentNode.children, (p) => p.grouping?.byProperties);
  }
}
