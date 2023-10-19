/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";

/**
 * @internal
 */
export function applyGroupHidingParams(nodes: HierarchyNode[]): { nodes: HierarchyNode[]; hasHidden: boolean } {
  const finalHierarchy = new Array<HierarchyNode>();
  let hasHidden = false;
  for (const node of nodes) {
    const currentNode = node;
    if (HierarchyNode.isGroupingNode(currentNode)) {
      if (Array.isArray(currentNode.children) && (nodes.length === 1 || currentNode.children.length === 1)) {
        const [hideIfNoSiblings, hideIfOneGroupedNode] = getGroupingHideOptionsFromParentNode(currentNode);
        if (hideIfNoSiblings && nodes.length === 1) {
          return { nodes: currentNode.children, hasHidden: true };
        } else if (hideIfOneGroupedNode && currentNode.children.length === 1) {
          finalHierarchy.push(currentNode.children[0]);
          hasHidden = true;
          continue;
        }
      }
    }
    finalHierarchy.push(currentNode);
  }
  return { nodes: finalHierarchy, hasHidden };
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
