/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GenericInstanceFilter, HierarchyNode } from "@itwin/presentation-hierarchies";
import { ErrorInfo } from "../TreeNode.js";
import { SelectionChangeType } from "../UseSelectionHandler.js";

/** @internal */
export interface TreeModelRootNode {
  id: undefined;
  nodeData: undefined;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
  isLoading?: boolean;
  error?: ErrorInfo;
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
  instanceFilter?: GenericInstanceFilter;
  error?: ErrorInfo;
}

/** @internal */
export function isTreeModelHierarchyNode(node: TreeModelHierarchyNode | ErrorInfo | TreeModelRootNode): node is TreeModelHierarchyNode {
  return "nodeData" in node && node.nodeData !== undefined;
}

/** @internal */
export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: Map<string, TreeModelHierarchyNode>;
  rootNode: TreeModelRootNode;
}

/** @internal */
export namespace TreeModel {
  export function expandNode(model: TreeModel, nodeId: string, isExpanded: boolean): "none" | "loadChildren" | "reloadChildren" {
    const node = model.idToNode.get(nodeId);
    if (!node) {
      return "none";
    }

    node.isExpanded = isExpanded;
    if (!isExpanded) {
      return "none";
    }

    if (node.error?.type === "ChildrenLoad") {
      node.isLoading = true;
      // remove subtree if there `ChildrenLoad` error info in order to attempt reloading children
      TreeModel.removeSubTree(model, nodeId);
      return "reloadChildren";
    }

    if (!node.children) {
      return "none";
    }

    const children = model.parentChildMap.get(node.id);
    if (!children) {
      node.isLoading = true;
      return "loadChildren";
    }

    return "none";
  }

  /** @internal */
  export function addHierarchyPart(model: TreeModel, rootId: string | undefined, hierarchyPart: TreeModel): void {
    removeSubTree(model, rootId);
    model.rootNode.error = hierarchyPart.rootNode.error;

    for (const [parentId, children] of hierarchyPart.parentChildMap) {
      model.parentChildMap.set(parentId, children);
    }

    for (const [nodeId, node] of hierarchyPart.idToNode) {
      model.idToNode.set(nodeId, node);
    }

    const parentNode = rootId !== undefined ? model.idToNode.get(rootId) : model.rootNode;
    /* c8 ignore next 3*/
    if (!parentNode) {
      return;
    }
    parentNode.isLoading = false;
  }

  export function removeSubTree(model: TreeModel, parentId: string | undefined): void {
    clearNodeError(model, parentId);
    const currentChildren = model.parentChildMap.get(parentId);
    if (!currentChildren) {
      return;
    }
    model.parentChildMap.delete(parentId);

    for (const childId of currentChildren) {
      const childNode = model.idToNode.get(childId);
      if (childNode) {
        removeSubTree(model, childNode.id);
      }
      model.idToNode.delete(childId);
    }
  }

  export function setHierarchyLimit(model: TreeModel, nodeId: string | undefined, limit?: number | "unbounded"): boolean {
    return updateForReload(model, nodeId, (node) => {
      node.hierarchyLimit = limit;
    });
  }

  export function setInstanceFilter(model: TreeModel, nodeId: string | undefined, filter?: GenericInstanceFilter): boolean {
    return updateForReload(model, nodeId, (node) => {
      if (filter && node.id !== undefined) {
        node.isExpanded = true;
      }
      node.instanceFilter = filter;
    });
  }

  export function selectNodes(model: TreeModel, nodeIds: Array<string>, changeType: SelectionChangeType) {
    if (changeType === "replace") {
      for (const [nodeId, node] of model.idToNode) {
        node.isSelected = !!nodeIds.find((id) => id === nodeId);
      }
      return;
    }
    for (const nodeId of nodeIds) {
      const modelNode = model.idToNode.get(nodeId);
      if (!modelNode) {
        return;
      }
      modelNode.isSelected = changeType === "add";
    }
  }

  export function isNodeSelected(model: TreeModel, nodeId: string): boolean {
    const currentNode = model.idToNode.get(nodeId);
    return !!currentNode && !!currentNode.isSelected;
  }

  export function getNode(model: TreeModel, nodeId: string | undefined): TreeModelHierarchyNode | TreeModelRootNode | undefined {
    if (!nodeId) {
      return model.rootNode;
    }
    return model.idToNode.get(nodeId);
  }

  export function setIsLoading(model: TreeModel, nodeId: string | undefined, isLoading: boolean) {
    if (nodeId === undefined) {
      model.rootNode.isLoading = isLoading;
      return;
    }
    const modelNode = model.idToNode.get(nodeId);
    /* c8 ignore next 3*/
    if (!modelNode) {
      return;
    }
    modelNode.isLoading = isLoading;
  }
}

function updateForReload(model: TreeModel, nodeId: string | undefined, update: (node: TreeModelHierarchyNode | TreeModelRootNode) => void) {
  TreeModel.removeSubTree(model, nodeId);
  if (nodeId === undefined) {
    update(model.rootNode);
    model.rootNode.isLoading = true;
    return true;
  }

  const modelNode = model.idToNode.get(nodeId);
  if (!modelNode) {
    return false;
  }

  update(modelNode);
  if (modelNode.isExpanded) {
    modelNode.isLoading = true;
    return true;
  }
  return false;
}

function clearNodeError(model: TreeModel, parentId: string | undefined) {
  if (!parentId) {
    return (model.rootNode.error = undefined);
  }
  const node = model.idToNode.get(parentId);
  if (!node) {
    return;
  }
  node.error = undefined;
}
