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
export interface ErrorNode {
  error: PresentationInfoNode;
  parent?: PresentationHierarchyNode;
  expandTo: (expandNode: (nodeId: string) => void) => void;
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

export function getErrors(rootNodes: PresentationTreeNode[]): ErrorNode[] {
  return rootNodes.flatMap((rootNode) => {
    if (!isPresentationHierarchyNode(rootNode)) {
      return [{ parent: undefined, error: rootNode, expandTo: (expandNode) => expandTo(expandNode, []) }];
    }
    if (rootNode.children === true) {
      return [];
    }
    return getErrorNodes(rootNode, !rootNode.isExpanded ? [rootNode.id] : []);
  });
}

function getErrorNodes(parent: PresentationHierarchyNode, path: string[]) {
  const errorList: ErrorNode[] = [];

  if (parent.children === true) {
    return [];
  }

  const pathToChild = [...path, ...(!parent.isExpanded ? [parent.id] : [])];
  parent.children.forEach((node) => {
    if (!isPresentationHierarchyNode(node)) {
      errorList.push({ parent, error: node, expandTo: (expandNode) => expandTo(expandNode, path) });
      return;
    }

    if (node.children !== true) {
      const childErrorList = getErrorNodes(node, pathToChild);
      errorList.push(...childErrorList);
      return;
    }
  });
  return errorList;
}

function expandTo(expandNode: (nodeId: string) => void, path: string[]) {
  path.forEach((nodeId) => expandNode(nodeId));
}
