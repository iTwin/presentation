/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";
import { GroupingHierarchyNode, NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import { configure } from "@testing-library/react";
import {
  isTreeModelHierarchyNode,
  TreeModel,
  TreeModelHierarchyNode,
  TreeModelInfoNode,
  TreeModelNode,
} from "../presentation-hierarchies-react/internal/TreeModel";

configure({ reactStrictMode: true });

export * from "@testing-library/react";

export function createStub<T extends (...args: any[]) => any>() {
  return sinon.stub<Parameters<T>, ReturnType<T>>();
}

export function getHierarchyNode(model: TreeModel, id: string | undefined) {
  const node = TreeModel.getNode(model, id);
  return node && isTreeModelHierarchyNode(node) ? node : undefined;
}

type ModelInput = Array<Partial<Omit<TreeModelHierarchyNode, "children">> & { id: string | undefined; children?: string[] }>;

export function createTreeModel(seed: ModelInput) {
  const model: TreeModel = {
    idToNode: new Map(),
    parentChildMap: new Map(),
    rootNode: { id: undefined, nodeData: undefined },
  };

  for (const input of seed) {
    if (input.children) {
      model.parentChildMap.set(input.id, input.children);
    }

    if (input.id === undefined) {
      model.rootNode = { ...model.rootNode, instanceFilter: input.instanceFilter, hierarchyLimit: input.hierarchyLimit };
      continue;
    }

    const nodeId = input.id;
    const node = input ? model.idToNode.get(nodeId) : model.rootNode;
    if (!node) {
      model.idToNode.set(nodeId, {
        ...input,
        id: nodeId,
        label: input.label ?? nodeId,
        children: input.children === undefined || input.children.length > 0,
        nodeData: input.nodeData ?? createTestHierarchyNode({ id: input.id }),
      });
    }
  }

  return model;
}

export function addNodesToModel(model: TreeModel, parentId: string, nodes: TreeModelNode[]) {
  model.parentChildMap.set(
    parentId,
    nodes.map((node) => node.id),
  );
  for (const node of nodes) {
    model.idToNode.set(node.id, node);
  }
}

export function createTreeModelNode(props: Partial<TreeModelHierarchyNode> & { id: string }): TreeModelHierarchyNode {
  return {
    ...props,
    label: props.label ?? props.id,
    children: props.children ?? false,
    nodeData: props.nodeData ?? createTestHierarchyNode({ id: props.id }),
  };
}

export function createTestModelInfoNode({ id, ...props }: Partial<TreeModelInfoNode> & { id: string }): TreeModelInfoNode {
  return {
    ...props,
    id,
    message: props.message ?? "test-message",
    type: props.type ?? "Unknown",
  };
}

export function createTestHierarchyNode({ id, ...props }: Partial<NonGroupingHierarchyNode> & { id: string }): NonGroupingHierarchyNode {
  return {
    ...props,
    key: props.key ?? id,
    label: props.label ?? id,
    children: props.children ?? false,
    parentKeys: props.parentKeys ?? [],
  };
}

export function createTestGroupingNode({ id, ...props }: Partial<GroupingHierarchyNode> & { id: string }): GroupingHierarchyNode {
  return {
    ...props,
    key: props.key ?? { type: "class-grouping", className: id },
    label: props.label ?? id,
    children: props.children ?? false,
    parentKeys: props.parentKeys ?? [],
    groupedInstanceKeys: props.groupedInstanceKeys ?? [],
  };
}
