/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  HierarchyNodeGroupingParamsBase,
  InstanceHierarchyNodeProcessingParams,
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../../../HierarchyNode";
import { GroupingHandlerResult, GroupingType } from "../Grouping";

/** @internal */
export function applyGroupHidingParams(props: GroupingHandlerResult, extraSiblings: number): GroupingHandlerResult {
  if (props.grouped.length === 0) {
    return props;
  }

  // handle the "no siblings" case
  if (props.grouped.length === 1 && props.ungrouped.length === 0 && extraSiblings === 0) {
    const { hideIfNoSiblings } = getGroupingHideOptionsFromParentNode(props.grouped[0], props.groupingType);
    if (hideIfNoSiblings) {
      return { groupingType: props.groupingType, grouped: [], ungrouped: props.grouped[0].children };
    }
  }

  // handle the "no children" case
  const finalGroupings: GroupingHandlerResult = { ...props, ungrouped: [...props.ungrouped], grouped: [] };
  for (const node of props.grouped) {
    if (node.children.length === 1) {
      const { hideIfOneGroupedNode } = getGroupingHideOptionsFromParentNode(node, props.groupingType);
      if (hideIfOneGroupedNode) {
        finalGroupings.ungrouped.push(node.children[0]);
        continue;
      }
    }
    finalGroupings.grouped.push(node);
  }
  return finalGroupings;
}

function getGroupingHideOptionsFromParentNode(
  parentNode: Omit<ProcessedGroupingHierarchyNode, "children"> & { children: ProcessedInstanceHierarchyNode[] },
  groupingType: GroupingType,
): { hideIfNoSiblings: boolean; hideIfOneGroupedNode: boolean } {
  switch (groupingType) {
    case "base-class":
      return getHideOptionsFromNodeProcessingParams(parentNode.children, (p) => p.grouping?.byBaseClasses);
    case "class":
      return getHideOptionsFromNodeProcessingParams(parentNode.children, (p) => (typeof p.grouping?.byClass === "object" ? p.grouping.byClass : undefined));
    case "label":
      return getHideOptionsFromNodeProcessingParams(parentNode.children, (p) => (typeof p.grouping?.byLabel === "object" ? p.grouping.byLabel : undefined));
    case "property":
      return getHideOptionsFromNodeProcessingParams(parentNode.children, (p) => p.grouping?.byProperties);
  }
}

function getHideOptionsFromNodeProcessingParams(
  nodes: ProcessedInstanceHierarchyNode[],
  hideOptionsAccessor: (params: InstanceHierarchyNodeProcessingParams) => HierarchyNodeGroupingParamsBase | undefined,
): { hideIfNoSiblings: boolean; hideIfOneGroupedNode: boolean } {
  let hideIfNoSiblings = false;
  let hideIfOneGroupedNode = false;
  for (const node of nodes) {
    if (hideIfNoSiblings && hideIfOneGroupedNode) {
      break;
    }
    const params = node.processingParams ? hideOptionsAccessor(node.processingParams) : undefined;
    hideIfNoSiblings ||= !!params?.hideIfNoSiblings;
    hideIfOneGroupedNode ||= !!params?.hideIfOneGroupedNode;
  }
  return { hideIfNoSiblings, hideIfOneGroupedNode };
}
