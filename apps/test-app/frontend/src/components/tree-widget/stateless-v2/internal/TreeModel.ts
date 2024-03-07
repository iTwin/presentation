/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GenericInstanceFilter, HierarchyNode } from "@itwin/presentation-hierarchy-builder";
import { InfoNodeTypes } from "../Types";

/** @internal */
export interface TreeModelRootNode {
  id: undefined;
  nodeData: undefined;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
}

/** @internal */
export interface TreeModelHierarchyNode<TNodeData = HierarchyNode> {
  id: string;
  nodeData: TNodeData;
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
}

/** @internal */
export interface TreeModelInfoNode {
  id: string;
  parentId?: string;
  type: InfoNodeTypes;
  message: string;
}

/** @internal */
export type TreeModelNode = TreeModelHierarchyNode | TreeModelInfoNode;

/** @internal */
export function isTreeModelHierarchyNode<TNodeData = HierarchyNode>(
  node: TreeModelHierarchyNode<TNodeData> | TreeModelInfoNode | TreeModelRootNode,
): node is TreeModelHierarchyNode<TNodeData> {
  return "nodeData" in node && node.nodeData !== undefined;
}

/** @internal */
export function isTreeModelInfoNode(node: TreeModelHierarchyNode | TreeModelInfoNode | TreeModelRootNode): node is TreeModelInfoNode {
  return "message" in node && node.message !== undefined;
}

/** @internal */
export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: Map<string, TreeModelNode>;
  rootNode: TreeModelRootNode;
}

/** @internal */
export function expandNode(model: TreeModel, nodeId: string, isExpanded: boolean): void {
  const node = model.idToNode.get(nodeId);
  if (!node || !isTreeModelHierarchyNode(node)) {
    return;
  }

  node.isExpanded = isExpanded;
}

/** @internal */
export function addHierarchyPart(model: TreeModel, rootId: string | undefined, hierarchyPart: TreeModel): void {
  removeSubTree(model, rootId);

  for (const [parentId, children] of hierarchyPart.parentChildMap) {
    model.parentChildMap.set(parentId, children);
  }

  for (const [nodeId, node] of hierarchyPart.idToNode) {
    model.idToNode.set(nodeId, node);
  }
}

/** @internal */
export function removeSubTree(model: TreeModel, parentId: string | undefined): void {
  const currentChildren = model.parentChildMap.get(parentId);
  if (!currentChildren) {
    return;
  }
  model.parentChildMap.delete(parentId);

  for (const childId of currentChildren) {
    const childNode = model.idToNode.get(childId);
    if (childNode && isTreeModelHierarchyNode(childNode)) {
      removeSubTree(model, childNode.id);
    }
    model.idToNode.delete(childId);
  }
}

/** @internal */
export function isHierarchyNodeSelected(model: TreeModel, nodeId: string): boolean {
  const currentNode = model.idToNode.get(nodeId);
  return !!currentNode && isTreeModelHierarchyNode(currentNode) && !!currentNode.isSelected;
}
