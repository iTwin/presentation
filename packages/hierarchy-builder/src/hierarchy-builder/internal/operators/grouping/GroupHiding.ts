/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "../../../HierarchyNode";

/**
 * @internal
 */
export function applyHidingGroupingParamsToSpecificGroupingType(nodes: HierarchyNode[], groupingType: string): HierarchyNode[] {
  if (groupingType !== "base-class-grouping" && groupingType !== "class-grouping" && groupingType !== "label-grouping") {
    return nodes;
  }
  const finalHierarchy = new Array<HierarchyNode>();
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < nodes.length; i++) {
    const currentNode = nodes[i];
    if (HierarchyNode.isGroupingNode(currentNode)) {
      if (Array.isArray(currentNode.children)) {
        if (currentNode.key.type === groupingType) {
          const [hideIfNoOtherGroups, hideIfSingleNodeInGroup] = getGroupingHideOptionsFromNodes(currentNode.children);
          if (hideIfNoOtherGroups && nodes.length === 1) {
            return currentNode.children;
          } else if (hideIfSingleNodeInGroup && currentNode.children.length === 1) {
            finalHierarchy.push(currentNode.children[0]);
          }
        } else {
          const newNodeChildren = applyHidingGroupingParamsToSpecificGroupingType(currentNode.children, groupingType);
          currentNode.children = newNodeChildren;
        }
      }
    }
    finalHierarchy.push(currentNode);
  }
  return finalHierarchy;
}

/**
 * @internal
 */
function getGroupingHideOptionsFromNodes(nodes: HierarchyNode[]): [hideIfNoOtherGroups: boolean, hideIfSingleNodeInGroup: boolean] {
  let hideIfNoOtherGroups = false;
  let hideIfSingleNodeInGroup = false;
  for (const node of nodes) {
    if (hideIfNoOtherGroups && hideIfSingleNodeInGroup) {
      break;
    }
    if (node.params?.grouping?.hideIfNoOtherGroups) {
      hideIfNoOtherGroups = true;
    }
    if (node.params?.grouping?.hideIfSingleNodeInGroup) {
      hideIfSingleNodeInGroup = true;
    }
  }
  return [hideIfNoOtherGroups, hideIfSingleNodeInGroup];
}
