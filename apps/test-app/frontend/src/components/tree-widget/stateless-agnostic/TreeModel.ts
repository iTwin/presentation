/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { HierarchyNode } from "@itwin/presentation-hierarchy-builder";

export interface NodeIdentifier {
  id: string;
  nodeData: HierarchyNode;
}

export interface ModelNode extends NodeIdentifier {
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
}

export type InfoNodeTypes = "ResultSetTooLarge" | "Unknown";

export interface InfoNode {
  id: string;
  parentId?: string;
  type: InfoNodeTypes;
  message: string;
}

export type TreeNode = ModelNode | InfoNode;

export function isModelNode(node: TreeNode): node is ModelNode {
  return "nodeData" in node;
}

export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: { [id: string]: TreeNode };
}

export function expandNode(model: TreeModel, nodeIdentifier: NodeIdentifier, isExpanded: boolean) {
  const node = model.idToNode[nodeIdentifier.id];
  if (!isModelNode(node)) {
    return;
  }

  node.isExpanded = isExpanded;
}

export function addHierarchyPart(model: TreeModel, parent: NodeIdentifier | undefined, hierarchyPart: TreeModel) {
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

export function removeSubTree(model: TreeModel, parent: NodeIdentifier | undefined) {
  const currentChildren = model.parentChildMap.get(parent?.id);
  if (!currentChildren) {
    return;
  }
  model.parentChildMap.delete(parent?.id);

  for (const childId of currentChildren) {
    const childNode = model.idToNode[childId];
    if (childNode && isModelNode(childNode)) {
      removeSubTree(model, childNode);
    }
    delete model.idToNode[childId];
  }
}
