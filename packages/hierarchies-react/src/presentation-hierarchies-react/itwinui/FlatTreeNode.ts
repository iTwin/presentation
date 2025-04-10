/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useMemo } from "react";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../TreeNode.js";

/**
 * Placeholder node that is added to hierarchy as a child for a parent node while its child nodes are loading.
 *
 * @alpha
 * */
interface PlaceholderNode {
  id: string;
  level: number;
  placeholder: true;
}

/**
 * An extended `PresentationHierarchyNode` node with properties needed for a flat tree structure.
 *
 * @alpha
 */
export type FlatNode = {
  level: number;
  levelSize: number;
  posInLevel: number;
} & PresentationHierarchyNode;

/**
 * A node used to build an error message.
 * Returned by `useErrorList`.
 *
 * @alpha
 * */
export interface ErrorNode {
  error: PresentationInfoNode;
  parent?: PresentationHierarchyNode;
  expandTo: (expandNode: (nodeId: string) => void) => void;
}

/**
 * A node describing single tree item position and its content inside tree.
 * Returned by `useFlatTreeNodeList` hook.
 *
 *  @alpha
 */
export type FlatTreeNode = FlatNode | PlaceholderNode;

/** @alpha */
export function isPlaceholderNode(node: FlatTreeNode): node is PlaceholderNode {
  return "placeholder" in node;
}

/**
 * Used to get a list of `FlatTreeNode` objects for the given list of `PresentationTreeNode` objects that represent
 * a hierarchical structure. The resulting nodes can be used to render the hierarchy in a flat manner, e.g. using a
 * virtualized list.
 *
 * @alpha
 */
export function useFlatTreeNodeList(rootNodes: PresentationTreeNode[]) {
  return useMemo(() => getFlatNodes(rootNodes, 1), [rootNodes]);
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

/**
 * Finds and returns all error nodes in a given hierarchy in the form of `PresentationTreeNode[]`.
 *
 * @alpha
 */
export function useErrorList(rootNodes: PresentationTreeNode[]): ErrorNode[] {
  return useMemo(
    () =>
      rootNodes.flatMap((rootNode) => {
        if (!isPresentationHierarchyNode(rootNode)) {
          return [{ parent: undefined, error: rootNode, expandTo: (expandNode) => expandTo(expandNode, []) }];
        }
        if (rootNode.children === true) {
          return [];
        }
        return getErrorNodes(rootNode, !rootNode.isExpanded ? [rootNode.id] : []);
      }),
    [rootNodes],
  );
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
