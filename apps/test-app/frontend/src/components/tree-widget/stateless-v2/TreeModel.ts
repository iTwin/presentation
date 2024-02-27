/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PresentationInstanceFilterInfo } from "@itwin/presentation-components";
import { HierarchyNode } from "@itwin/presentation-hierarchy-builder";
import { InfoNodeTypes } from "./Types";

/** @internal */
export interface TreeModelRootNode {
  id: undefined;
  nodeData: undefined;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: PresentationInstanceFilterInfo;
}

/** @internal */
export interface TreeModelHierarchyNode {
  id: string;
  nodeData: HierarchyNode;
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: PresentationInstanceFilterInfo;
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
export function isTreeModelHierarchyNode(node: TreeModelNode): node is TreeModelHierarchyNode {
  return "nodeData" in node && node.nodeData !== undefined;
}

/** @internal */
export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: { [id: string]: TreeModelNode };
  rootNode: TreeModelRootNode;
}

/** @internal */
export function expandNode(model: TreeModel, nodeId: string, isExpanded: boolean): void {
  const node = model.idToNode[nodeId];
  if (!isTreeModelHierarchyNode(node)) {
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

  for (const nodeId in hierarchyPart.idToNode) {
    if (!(nodeId in hierarchyPart.idToNode)) {
      continue;
    }
    model.idToNode[nodeId] = hierarchyPart.idToNode[nodeId];
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
    const childNode = model.idToNode[childId];
    if (childNode && isTreeModelHierarchyNode(childNode)) {
      removeSubTree(model, childNode.id);
    }
    delete model.idToNode[childId];
  }
}

/** @internal */
export function isHierarchyNodeSelected(model: TreeModel, nodeId: string): boolean {
  const currentNode = model.idToNode[nodeId];
  return currentNode && isTreeModelHierarchyNode(currentNode) && !!currentNode.isSelected;
}
