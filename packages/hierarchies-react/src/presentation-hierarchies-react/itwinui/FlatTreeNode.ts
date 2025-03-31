/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../TreeNode.js";

/** @alpha */
interface PlaceholderNode {
  id: string;
  level: number;
  placeholder: true;
}

/** @alpha */
export type FlatNode = {
  level: number;
  levelSize: number;
  posInLevel: number;
} & PresentationHierarchyNode;

/** @alpha */
export interface ErrorType {
  errorNode: PresentationInfoNode;
  parentNode?: PresentationHierarchyNode;
  expandToNode: (expandNode: (nodeId: string) => void) => void;
}

/** @alpha */
export type FlatTreeNode = FlatNode | PlaceholderNode;

/** @alpha */
export function isPlaceholderNode(node: FlatTreeNode): node is PlaceholderNode {
  return "placeholder" in node;
}

/** @alpha */
export function flattenNodes(rootNodes: PresentationTreeNode[]) {
  return getFlatNodes(rootNodes, 1);
}

function getFlatNodes(nodes: PresentationTreeNode[], level: number) {
  const flatNodes: FlatTreeNode[] = [];
  nodes.forEach((node, index) => {
    if (!isPresentationHierarchyNode(node)) {
      return;
    }
    flatNodes.push({ ...node, level, levelSize: nodes.length, posInLevel: index + 1 });
    if (!node.isExpanded) {
      return;
    }
    if (node.children !== true) {
      const childNodes = getFlatNodes(node.children, level + 1);
      flatNodes.push(...childNodes);
      return;
    }

    flatNodes.push({ id: `${node.id}-children-placeholder`, level: level + 1, placeholder: true } satisfies PlaceholderNode);
  });
  return flatNodes;
}

export function getErrors(rootNodes: PresentationTreeNode[]) {
  return rootNodes.flatMap((rootNode) => getErrorNodes(rootNode, []));
}

function getErrorNodes(parentNode: PresentationTreeNode, path: string[]) {
  const errorList: ErrorType[] = [];
  const newPath = [...path];

  if (!isPresentationHierarchyNode(parentNode)) {
    errorList.push({ parentNode: undefined, errorNode: parentNode, expandToNode: (expandNode) => expandToNode(expandNode, newPath) });
    return [];
  }
  if (parentNode.children === true) {
    return [];
  }
  parentNode.children.forEach((node) => {
    if (!isPresentationHierarchyNode(node)) {
      errorList.push({ parentNode, errorNode: node, expandToNode: (expandNode) => expandToNode(expandNode, newPath) });
      return;
    }

    if (node.children !== true) {
      newPath.push(...(!parentNode.isExpanded ? [parentNode.id] : []));
      const childErrorList = getErrorNodes(node, newPath);
      errorList.push(...childErrorList);
      return;
    }
  });
  return errorList;
}

function expandToNode(expandNode: (nodeId: string) => void, path: string[]) {
  path.forEach((nodeId) => expandNode(nodeId));
}
