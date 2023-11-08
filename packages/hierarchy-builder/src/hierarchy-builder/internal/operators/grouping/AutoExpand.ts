/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { AutoExpand, BaseGroupingParams, InstanceHierarchyNodeProcessingParams, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult, GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";

/** @internal */
export function assignAutoExpand(props: GroupingHandlerResult): GroupingHandlerResult {
  for (const node of props.grouped) {
    const autoExpand = getGroupingAutoExpandOptionsFromParentNode(node, props.groupingType);
    if (autoExpand === "always" || (autoExpand === "single-child" && node.children.length === 1)) {
      node.autoExpand = true;
    }
  }

  return props;
}

function getGroupingAutoExpandOptionsFromParentNode(parentNode: ProcessedInstancesGroupingHierarchyNode, groupingType: GroupingType): AutoExpand | undefined {
  switch (groupingType) {
    case "base-class":
      return getAutoExpandOptionsFromNodeProcessingParams(parentNode.children, (p) => p.grouping?.byBaseClasses);
    case "class":
      return getAutoExpandOptionsFromNodeProcessingParams(parentNode.children, (p) =>
        typeof p.grouping?.byClass === "object" ? p.grouping.byClass : undefined,
      );
    case "label":
      return getAutoExpandOptionsFromNodeProcessingParams(parentNode.children, (p) =>
        typeof p.grouping?.byLabel === "object" ? p.grouping.byLabel : undefined,
      );
  }
}

function getAutoExpandOptionsFromNodeProcessingParams(
  nodes: ProcessedInstanceHierarchyNode[],
  autoExpandOptionsAccessor: (processingParams: InstanceHierarchyNodeProcessingParams) => BaseGroupingParams | undefined,
): AutoExpand | undefined {
  for (const node of nodes) {
    const processingParams = node.processingParams ? autoExpandOptionsAccessor(node.processingParams) : undefined;
    if (processingParams?.autoExpand) {
      return processingParams.autoExpand;
    }
  }
  return undefined;
}
