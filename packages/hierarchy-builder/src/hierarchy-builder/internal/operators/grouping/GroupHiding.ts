/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BaseGroupingParams, HierarchyNode, HierarchyNodeHandlingParams } from "../../../HierarchyNode";
import { GroupingHandlerResult, GroupingType } from "../Grouping";

/** @internal */
export function applyGroupHidingParams(props: GroupingHandlerResult): GroupingHandlerResult {
  if (props.groupedNodes.length === 0) {
    return props;
  }
  const finalGroupings: GroupingHandlerResult = { allNodes: [], groupedNodes: [], ungroupedNodes: [], groupingType: props.groupingType };
  for (const node of props.groupedNodes) {
    if (Array.isArray(node.children) && (props.allNodes.length === 1 || node.children.length === 1)) {
      const [hideIfNoSiblings, hideIfOneGroupedNode] = getGroupingHideOptionsFromParentNode(node, props.groupingType);
      if (hideIfNoSiblings && props.allNodes.length === 1) {
        return { allNodes: node.children, groupedNodes: [], ungroupedNodes: node.children, groupingType: props.groupingType };
      }
      if (hideIfOneGroupedNode && node.children.length === 1) {
        finalGroupings.allNodes.push(node.children[0]);
        finalGroupings.ungroupedNodes.push(node.children[0]);
        continue;
      }
    }
    finalGroupings.groupedNodes.push(node);
    finalGroupings.allNodes.push(node);
  }
  for (const node of props.ungroupedNodes) {
    finalGroupings.allNodes.push(node);
    finalGroupings.ungroupedNodes.push(node);
  }
  return finalGroupings;
}

function getGroupingHideOptionsFromParentNode(
  parentNode: HierarchyNode,
  groupingType: GroupingType,
): [hideIfNoSiblings: boolean, hideIfOneGroupedNode: boolean] {
  if (Array.isArray(parentNode.children)) {
    if (groupingType === "base-class") {
      return getHideOptionsFromNodeProcessingParams(parentNode.children, (p) => p.grouping?.byBaseClasses);
    }
    if (groupingType === "class") {
      return getHideOptionsFromNodeProcessingParams(parentNode.children, (p) => (typeof p.grouping?.byClass === "object" ? p.grouping.byClass : undefined));
    }
    if (groupingType === "label") {
      return getHideOptionsFromNodeProcessingParams(parentNode.children, (p) => (typeof p.grouping?.byLabel === "object" ? p.grouping.byLabel : undefined));
    }
  }
  // istanbul ignore next
  return [false, false];
}

function getHideOptionsFromNodeProcessingParams(
  nodes: HierarchyNode[],
  hideOptionsAccessor: (params: HierarchyNodeHandlingParams) => BaseGroupingParams | undefined,
): [hideIfNoSiblings: boolean, hideIfOneGroupedNode: boolean] {
  let hideIfNoSiblings = false;
  let hideIfOneGroupedNode = false;
  for (const node of nodes) {
    if (hideIfNoSiblings && hideIfOneGroupedNode) {
      break;
    }
    const params = node.params ? hideOptionsAccessor(node.params) : undefined;
    hideIfNoSiblings ||= !!params?.hideIfNoSiblings;
    hideIfOneGroupedNode ||= !!params?.hideIfOneGroupedNode;
  }
  return [hideIfNoSiblings, hideIfOneGroupedNode];
}
