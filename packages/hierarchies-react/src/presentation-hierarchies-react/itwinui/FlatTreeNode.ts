/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { isPresentationHierarchyNode, PresentationTreeNode } from "../TreeNode.js";

interface PlaceholderNode {
  id: string;
  level: number;
  placeholder: true;
}

/** @internal */
export type FlatNode<TNode extends PresentationTreeNode = PresentationTreeNode> = {
  level: number;
  levelSize: number;
  posInLevel: number;
} & TNode;

/** @alpha */
export type FlatTreeNode<TNode extends PresentationTreeNode = PresentationTreeNode> = FlatNode<TNode> | PlaceholderNode;

/** @alpha */
export function isPlaceholderNode(node: FlatTreeNode): node is PlaceholderNode {
  return "placeholder" in node;
}

/** @alpha */
export function flattenNodes(rootNodes: PresentationTreeNode[]) {
  return getFlatNodes(rootNodes, 0);
}

function getFlatNodes(nodes: PresentationTreeNode[], level: number) {
  const flatNodes: FlatTreeNode[] = [];
  nodes.forEach((node, index) => {
    flatNodes.push({ ...node, level, levelSize: nodes.length, posInLevel: index + 1 });
    if (!isPresentationHierarchyNode(node) || !node.isExpanded) {
      return;
    }
    if (node.children !== true) {
      const childNodes = getFlatNodes(node.children, level + 1);
      flatNodes.push(...childNodes);
      return;
    }

    flatNodes.push({ id: "placeholderNode", level: level + 1, placeholder: true } satisfies PlaceholderNode);
  });
  return flatNodes;
}
