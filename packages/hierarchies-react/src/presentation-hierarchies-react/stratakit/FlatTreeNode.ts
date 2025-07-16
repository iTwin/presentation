/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useMemo } from "react";
import { PresentationHierarchyNode } from "../TreeNode.js";

/**
 * Placeholder item that is added to hierarchy as a child for a parent item while its child items are loading.
 *
 * @alpha
 * */
interface FlatPlaceholderItem {
  id: string;
  level: number;
  placeholder: true;
}

/**
 * An item containing `PresentationHierarchyNode` node with properties needed for a flat tree structure.
 *
 * @alpha
 */
export interface FlatTreeNodeItem {
  id: string;
  level: number;
  levelSize: number;
  posInLevel: number;
  node: PresentationHierarchyNode;
}

/**
 * An item used to build an error message.
 * Returned by `useErrorList`.
 *
 * @alpha
 * */
export interface ErrorItem {
  errorNode: PresentationHierarchyNode;
  expandTo: (expandNode: (nodeId: string) => void) => void;
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
 * Used to get a list of `FlatTreeItem` objects for the given list of `PresentationHierarchyNode` objects that represent
 * a hierarchical structure. The resulting items can be used to render the hierarchy in a flat manner, e.g. using a
 * virtualized list.
 *
 * @alpha
 */
export function useFlatTreeItems(rootNodes: PresentationHierarchyNode[]) {
  return useMemo(() => getFlatItems(rootNodes, 1), [rootNodes]);
}

function getFlatItems(nodes: PresentationHierarchyNode[], level: number) {
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
 * Finds and returns all items containing errors in a given hierarchy in the form of `ErrorItem[]`.
 *
 * @alpha
 */
export function useErrorList(rootNodes: PresentationHierarchyNode[]): ErrorItem[] {
  return useMemo(
    () =>
      rootNodes.flatMap((rootNode) => {
        if (!!rootNode.error) {
          return [{ errorNode: rootNode, expandTo: (expandNode) => expandTo(expandNode, []) }];
        }
        if (rootNode.children === true) {
          return [];
        }
        return getErrorItems(rootNode, !rootNode.isExpanded ? [rootNode.id] : []);
      }),
    [rootNodes],
  );
}

function getErrorItems(parent: PresentationHierarchyNode, path: string[]) {
  const errorList: ErrorItem[] = [];

  if (parent.children === true) {
    return [];
  }

  const pathToChild = [...path, ...(!parent.isExpanded ? [parent.id] : [])];
  parent.children.forEach((node) => {
    if (!!node.error) {
      errorList.push({ errorNode: node, expandTo: (expandNode) => expandTo(expandNode, path) });
      return;
    }

    if (node.children !== true) {
      const childErrorList = getErrorItems(node, pathToChild);
      errorList.push(...childErrorList);
      return;
    }
  });
  return errorList;
}

function expandTo(expandNode: (nodeId: string) => void, path: string[]) {
  path.forEach((nodeId) => expandNode(nodeId));
}
