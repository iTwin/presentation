/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult, GroupingType } from "../Grouping";

/** @internal */
export function applyGroupHidingParams(props: GroupingHandlerResult): GroupingHandlerResult {
  const finalGroupings: GroupingHandlerResult = { allNodes: [], groupedNodes: [], groupingType: props.groupingType };
  for (const node of props.allNodes) {
    if (HierarchyNode.isGroupingNode(node)) {
      if (Array.isArray(node.children) && (props.allNodes.length === 1 || node.children.length === 1)) {
        const [hideIfNoSiblings, hideIfOneGroupedNode] = getGroupingHideOptionsFromParentNode(node, props.groupingType);
        if (hideIfNoSiblings && props.allNodes.length === 1) {
          return { allNodes: node.children, groupedNodes: [], groupingType: props.groupingType };
        } else if (hideIfOneGroupedNode && node.children.length === 1) {
          finalGroupings.allNodes.push(node.children[0]);
          continue;
        }
      }
      finalGroupings.groupedNodes.push(node);
    }
    finalGroupings.allNodes.push(node);
  }
  return finalGroupings;
}

function getGroupingHideOptionsFromParentNode(
  parentNode: HierarchyNode,
  groupingType: GroupingType,
): [hideIfNoSiblings: boolean, hideIfOneGroupedNode: boolean] {
  if (Array.isArray(parentNode.children)) {
    if (groupingType === "base-class") {
      return getHideOptionsFromBaseClassGroupingNodes(parentNode.children);
    }
    if (groupingType === "class") {
      return getHideOptionsFromClassGroupingNodes(parentNode.children);
    }
    if (groupingType === "label") {
      return getHideOptionsFromLabelGroupingNodes(parentNode.children);
    }
  }
  // istanbul ignore next
  return [false, false];
}

function getHideOptionsFromBaseClassGroupingNodes(nodes: HierarchyNode[]): [hideIfNoSiblings: boolean, hideIfOneGroupedNode: boolean] {
  let hideIfNoSiblings = false;
  let hideIfOneGroupedNode = false;
  for (const node of nodes) {
    if (hideIfNoSiblings && hideIfOneGroupedNode) {
      break;
    }
    if (node.params?.grouping?.byBaseClasses?.hideIfNoSiblings) {
      hideIfNoSiblings = true;
    }
    if (node.params?.grouping?.byBaseClasses?.hideIfOneGroupedNode) {
      hideIfOneGroupedNode = true;
    }
  }
  return [hideIfNoSiblings, hideIfOneGroupedNode];
}

function getHideOptionsFromClassGroupingNodes(nodes: HierarchyNode[]): [hideIfNoSiblings: boolean, hideIfOneGroupedNode: boolean] {
  let hideIfNoSiblings = false;
  let hideIfOneGroupedNode = false;

  for (const node of nodes) {
    if (hideIfNoSiblings && hideIfOneGroupedNode) {
      break;
    }
    if (typeof node.params?.grouping?.byClass !== "boolean") {
      if (node.params?.grouping?.byClass?.hideIfNoSiblings) {
        hideIfNoSiblings = true;
      }
      if (node.params?.grouping?.byClass?.hideIfOneGroupedNode) {
        hideIfOneGroupedNode = true;
      }
    }
  }
  return [hideIfNoSiblings, hideIfOneGroupedNode];
}

function getHideOptionsFromLabelGroupingNodes(nodes: HierarchyNode[]): [hideIfNoSiblings: boolean, hideIfOneGroupedNode: boolean] {
  let hideIfNoSiblings = false;
  let hideIfOneGroupedNode = false;

  for (const node of nodes) {
    if (hideIfNoSiblings && hideIfOneGroupedNode) {
      break;
    }
    if (typeof node.params?.grouping?.byLabel !== "boolean") {
      if (node.params?.grouping?.byLabel?.hideIfNoSiblings) {
        hideIfNoSiblings = true;
      }
      if (node.params?.grouping?.byLabel?.hideIfOneGroupedNode) {
        hideIfOneGroupedNode = true;
      }
    }
  }
  return [hideIfNoSiblings, hideIfOneGroupedNode];
}
