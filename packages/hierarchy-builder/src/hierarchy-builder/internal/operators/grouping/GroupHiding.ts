/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerReturn } from "../Grouping";

/**
 * @internal
 */
export function applyGroupHidingParams(allNodes: HierarchyNode[]): GroupingHandlerReturn {
  const finalGroupings: GroupingHandlerReturn = { allNodes: [], groupedNodes: [] };
  for (const node of allNodes) {
    if (HierarchyNode.isGroupingNode(node)) {
      if (Array.isArray(node.children) && (allNodes.length === 1 || node.children.length === 1)) {
        const [hideIfNoSiblings, hideIfOneGroupedNode] = getGroupingHideOptionsFromParentNode(node);
        if (hideIfNoSiblings && allNodes.length === 1) {
          return { allNodes: node.children, groupedNodes: [] };
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

/**
 * @internal
 */
function getGroupingHideOptionsFromParentNode(parentNode: HierarchyNode): [hideIfNoSiblings: boolean, hideIfOneGroupedNode: boolean] {
  if (Array.isArray(parentNode.children)) {
    if (HierarchyNode.isBaseClassGroupingNode(parentNode)) {
      return getHideOptionsFromBaseClassGroupingNodes(parentNode.children);
    }
    if (HierarchyNode.isClassGroupingNode(parentNode)) {
      return getHideOptionsFromClassGroupingNodes(parentNode.children);
    }
    if (HierarchyNode.isLabelGroupingNode(parentNode)) {
      return getHideOptionsFromLabelGroupingNodes(parentNode.children);
    }
  }
  // istanbul ignore next
  return [false, false];
}

/**
 * @internal
 */
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

/**
 * @internal
 */
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

/**
 * @internal
 */
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
