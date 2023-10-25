/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BaseGroupingParams, HierarchyNode, HierarchyNodeHandlingParams } from "../../../HierarchyNode";
import { GroupingHandlerResult, GroupingType } from "../Grouping";

/** @internal */
export function applyGroupHidingParams(props: GroupingHandlerResult): GroupingHandlerResult {
  if (props.grouped.length === 0) {
    return props;
  }
  const finalGroupings = { ...props, grouped: [] };
  for (const node of props.grouped) {
    if (Array.isArray(node.children) && ((props.ungrouped.length === 0 && props.grouped.length === 1) || node.children.length === 1)) {
      const [hideIfNoSiblings, hideIfOneGroupedNode] = getGroupingHideOptionsFromParentNode(node, props.groupingType);
      if (hideIfNoSiblings && props.ungrouped.length === 0 && props.grouped.length === 1) {
        return { grouped: [], ungrouped: node.children, groupingType: props.groupingType };
      }
      if (hideIfOneGroupedNode && node.children.length === 1) {
        finalGroupings.ungrouped.push(node.children[0]);
        continue;
      }
    }
    finalGroupings.grouped.push(node);
  }

  finalGroupings.ungrouped.push(...props.ungrouped);
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
