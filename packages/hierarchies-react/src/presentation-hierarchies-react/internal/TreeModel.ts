/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { FinalizedNode, GenericInstanceFilter } from "@itwin/presentation-hierarchies";
import { SelectionChangeType } from "../UseSelectionHandler";

/** @internal */
export interface TreeModelRootNode {
  id: undefined;
  nodeData: undefined;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
  isLoading?: boolean;
}

/** @internal */
export interface TreeModelHierarchyNode {
  id: string;
  nodeData: FinalizedNode;
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
}

/** @internal */
export interface TreeModelGenericInfoNode {
  id: string;
  parentId: string | undefined;
  type: "Unknown";
  message: string;
}

/** @internal */
export interface TreeModelNoFilterMatchesInfoNode {
  id: string;
  parentId: string | undefined;
  type: "NoFilterMatches";
}

/** @internal */
export interface TreeModelResultSetTooLargeInfoNode {
  id: string;
  parentId: string | undefined;
  type: "ResultSetTooLarge";
  resultSetSizeLimit: number;
}

/** @internal */
export type TreeModelInfoNode = TreeModelGenericInfoNode | TreeModelResultSetTooLargeInfoNode | TreeModelNoFilterMatchesInfoNode;

/** @internal */
export type TreeModelNode = TreeModelHierarchyNode | TreeModelInfoNode;

/** @internal */
export function isTreeModelHierarchyNode(node: TreeModelHierarchyNode | TreeModelInfoNode | TreeModelRootNode): node is TreeModelHierarchyNode {
  return "nodeData" in node && node.nodeData !== undefined;
}

/** @internal */
export function isTreeModelInfoNode(node: TreeModelHierarchyNode | TreeModelInfoNode | TreeModelRootNode): node is TreeModelInfoNode {
  return "type" in node && node.type !== undefined;
}

/** @internal */
export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: Map<string, TreeModelNode>;
  rootNode: TreeModelRootNode;
}

/** @internal */
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
    if (!firstChild || !isTreeModelInfoNode(firstChild) || firstChild.type !== "Unknown") {
      return "none";
    }

    // remove subtree if there is only one `Unknown` info node in order to attempt reloading children
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

    const parentNode = rootId !== undefined ? model.idToNode.get(rootId) : model.rootNode;
    // istanbul ignore else
    if (parentNode && !isTreeModelInfoNode(parentNode)) {
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
    return updateForReload(model, nodeId, (node) => {
      node.hierarchyLimit = limit;
    });
  }

  export function setInstanceFilter(model: TreeModel, nodeId: string | undefined, filter?: GenericInstanceFilter): boolean {
    return updateForReload(model, nodeId, (node) => {
      node.instanceFilter = filter;
    });
  }

  export function selectNodes(model: TreeModel, nodeIds: Array<string>, changeType: SelectionChangeType) {
    if (changeType === "replace") {
      for (const [nodeId, node] of model.idToNode) {
        if (!isTreeModelHierarchyNode(node)) {
          continue;
        }
        node.isSelected = !!nodeIds.find((id) => id === nodeId);
      }
      return;
    }
    for (const nodeId of nodeIds) {
      const modelNode = model.idToNode.get(nodeId);
      if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
        return;
      }
      modelNode.isSelected = changeType === "add";
    }
  }

  export function isNodeSelected(model: TreeModel, nodeId: string): boolean {
    const currentNode = model.idToNode.get(nodeId);
    return !!currentNode && isTreeModelHierarchyNode(currentNode) && !!currentNode.isSelected;
  }

  export function getNode(model: TreeModel, nodeId: string | undefined): TreeModelNode | TreeModelRootNode | undefined {
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
    // istanbul ignore if
    if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
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
  if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
    return false;
  }

  update(modelNode);
  if (modelNode.isExpanded) {
    modelNode.isLoading = true;
    return true;
  }
  return false;
}
