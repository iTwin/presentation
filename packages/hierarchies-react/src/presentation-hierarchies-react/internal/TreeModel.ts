/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GenericInstanceFilter, HierarchyNode } from "@itwin/presentation-hierarchies";
import { InfoNodeTypes } from "../Types";

export interface TreeModelRootNode {
  id: undefined;
  nodeData: undefined;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
}

export interface TreeModelHierarchyNode {
  id: string;
  nodeData: HierarchyNode;
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
}

export interface TreeModelInfoNode {
  id: string;
  parentId?: string;
  type: InfoNodeTypes;
  message: string;
}

export type TreeModelNode = TreeModelHierarchyNode | TreeModelInfoNode;

export function isTreeModelHierarchyNode(node: TreeModelHierarchyNode | TreeModelInfoNode | TreeModelRootNode): node is TreeModelHierarchyNode {
  return "nodeData" in node && node.nodeData !== undefined;
}

export function isTreeModelInfoNode(node: TreeModelHierarchyNode | TreeModelInfoNode | TreeModelRootNode): node is TreeModelInfoNode {
  return "message" in node && node.message !== undefined;
}

export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: Map<string, TreeModelNode>;
  rootNode: TreeModelRootNode;
}

export namespace TreeModel {
  export function expandNode(model: TreeModel, nodeId: string, isExpanded: boolean): "none" | "loadChildren" | "reloadChildren" {
    const node = model.idToNode.get(nodeId);
    if (!node || !isTreeModelHierarchyNode(node)) {
      return "none";
    }

    node.isExpanded = isExpanded;
    if (!isExpanded || !node.children) {
      return "none";
    }

    const children = model.parentChildMap.get(node.id);
    if (!children) {
      node.isLoading = true;
      return "loadChildren";
    }

    if (children.length !== 1) {
      return "none";
    }

    const firstChild = TreeModel.getNode(model, children[0]);
    if (!firstChild || !isTreeModelInfoNode(firstChild)) {
      return "none";
    }

    TreeModel.removeSubTree(model, nodeId);
    node.isLoading = true;
    return "reloadChildren";
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

    const parentNode = rootId !== undefined ? model.idToNode.get(rootId) : undefined;
    if (parentNode && isTreeModelHierarchyNode(parentNode)) {
      parentNode.isLoading = false;
    }
  }

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

  export function setHierarchyLimit(model: TreeModel, nodeId: string | undefined, limit?: number | "unbounded"): boolean {
    removeSubTree(model, nodeId);
    if (nodeId === undefined) {
      model.rootNode.hierarchyLimit = limit;
      return true;
    }

    const modelNode = model.idToNode.get(nodeId);
    if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
      return false;
    }

    modelNode.hierarchyLimit = limit;
    if (modelNode.isExpanded) {
      modelNode.isLoading = true;
      return true;
    }
    return false;
  }

  export function setInstanceFilter(model: TreeModel, nodeId: string | undefined, filter?: GenericInstanceFilter): boolean {
    if (nodeId === undefined) {
      model.rootNode.instanceFilter = filter;
      removeSubTree(model, nodeId);
      return true;
    }

    const modelNode = model.idToNode.get(nodeId);
    if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
      return false;
    }

    removeSubTree(model, nodeId);
    modelNode.instanceFilter = filter;
    if (modelNode.isExpanded) {
      modelNode.isLoading = true;
    }
    return true;
  }

  export function selectNode(model: TreeModel, nodeId: string, isSelected: boolean) {
    const modelNode = model.idToNode.get(nodeId);
    if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
      return;
    }
    modelNode.isSelected = isSelected;
  }

  export function isHierarchyNodeSelected(model: TreeModel, nodeId: string): boolean {
    const currentNode = model.idToNode.get(nodeId);
    return !!currentNode && isTreeModelHierarchyNode(currentNode) && !!currentNode.isSelected;
  }

  export function getNode(model: TreeModel, nodeId: string | undefined): TreeModelNode | TreeModelRootNode | undefined {
    if (!nodeId) {
      return model.rootNode;
    }
    return model.idToNode.get(nodeId);
  }
}
