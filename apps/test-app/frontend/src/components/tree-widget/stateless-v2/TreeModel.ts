/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { GenericInstanceFilter } from "@itwin/presentation-hierarchy-builder";
import { InfoNodeTypes, PresentationHierarchyNodeIdentifier } from "./Types";

/** @internal */
export interface TreeModelRootNode {
  id: undefined;
  nodeData: undefined;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
}

/** @internal */
export interface TreeModelHierarchyNode extends PresentationHierarchyNodeIdentifier {
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
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
  return "nodeData" in node;
}

/** @internal */
export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: { [id: string]: TreeModelNode };
  rootNode: TreeModelRootNode;
}

/** @internal */
export function expandNode(model: TreeModel, nodeIdentifier: PresentationHierarchyNodeIdentifier, isExpanded: boolean): void {
  const node = model.idToNode[nodeIdentifier.id];
  if (!isTreeModelHierarchyNode(node)) {
    return;
  }

  node.isExpanded = isExpanded;
}

/** @internal */
export function addHierarchyPart(model: TreeModel, parent: PresentationHierarchyNodeIdentifier | TreeModelRootNode, hierarchyPart: TreeModel): void {
  removeSubTree(model, parent);

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
export function removeSubTree(model: TreeModel, parent: PresentationHierarchyNodeIdentifier | TreeModelRootNode): void {
  const currentChildren = model.parentChildMap.get(parent?.id);
  if (!currentChildren) {
    return;
  }
  model.parentChildMap.delete(parent?.id);

  for (const childId of currentChildren) {
    const childNode = model.idToNode[childId];
    if (childNode && isTreeModelHierarchyNode(childNode)) {
      removeSubTree(model, childNode);
    }
    delete model.idToNode[childId];
  }
}

/** @internal */
export function isHierarchyNodeSelected(model: TreeModel, node: PresentationHierarchyNodeIdentifier): boolean {
  const currentNode = model.idToNode[node.id];
  return currentNode && isTreeModelHierarchyNode(currentNode) && !!currentNode.isSelected;
}
