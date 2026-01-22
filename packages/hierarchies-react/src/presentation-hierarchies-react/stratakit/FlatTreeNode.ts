/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useMemo } from "react";
import { TreeNode } from "../TreeNode.js";

/**
 * Placeholder item that is added to hierarchy as a child for a parent item while its child items are loading.
 *
 * @alpha
 */
interface FlatPlaceholderItem {
  id: string;
  level: number;
  placeholder: true;
}

/**
 * An item containing `TreeNode` node with properties needed for a flat tree structure.
 *
 * @alpha
 */
export interface FlatTreeNodeItem {
  id: string;
  level: number;
  levelSize: number;
  posInLevel: number;
  node: TreeNode;
}

/**
 * An Item describing single tree item position and its content inside tree.
 * Returned by `useFlatTreeNodeList` hook.
 *
 *  @alpha
 */
export type FlatTreeItem = FlatTreeNodeItem | FlatPlaceholderItem;

/** @alpha */
export function isPlaceholderItem(item: FlatTreeItem): item is FlatPlaceholderItem {
  return "placeholder" in item;
}

/**
 * Used to get a list of `FlatTreeItem` objects for the given list of `TreeNode` objects that represent
 * a hierarchical structure. The resulting items can be used to render the hierarchy in a flat manner, e.g. using a
 * virtualized list.
 *
 * @alpha
 */
export function useFlatTreeItems(rootNodes: TreeNode[]) {
  return useMemo(() => getFlatItems(rootNodes, 1), [rootNodes]);
}

function getFlatItems(nodes: TreeNode[], level: number) {
  const flatItems: FlatTreeItem[] = [];
  nodes.forEach((node, index) => {
    flatItems.push({ node, id: node.id, level, levelSize: nodes.length, posInLevel: index + 1 });
    if (!node.isExpanded || node.error) {
      return;
    }
    if (node.children !== true) {
      const childNodes = getFlatItems(node.children, level + 1);
      flatItems.push(...childNodes);
      return;
    }

    flatItems.push({ id: `${node.id}-children-placeholder`, level: level + 1, placeholder: true } satisfies FlatPlaceholderItem);
  });
  return flatItems;
}

/**
 * Finds and returns all nodes containing errors in a given hierarchy.
 *
 * @alpha
 */
export function useErrorNodes(rootNodes: TreeNode[]): Array<TreeNode & Pick<Required<TreeNode>, "error">> {
  return useMemo(
    () =>
      rootNodes.flatMap((rootNode) => {
        if (isErrorNode(rootNode)) {
          return [rootNode];
        }
        if (rootNode.children === true) {
          return [];
        }
        return getErrorNodes(rootNode);
      }),
    [rootNodes],
  );
}

function getErrorNodes(parent: TreeNode) {
  const errorList: ReturnType<typeof useErrorNodes> = [];

  if (parent.children === true) {
    return [];
  }

  parent.children.forEach((node) => {
    if (isErrorNode(node)) {
      errorList.push(node);
      return;
    }

    if (node.children !== true) {
      const childErrorList = getErrorNodes(node);
      errorList.push(...childErrorList);
      return;
    }
  });
  return errorList;
}

function isErrorNode(node: TreeNode): node is TreeNode & Pick<Required<TreeNode>, "error"> {
  return node.error !== undefined;
}
