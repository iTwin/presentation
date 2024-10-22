/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement } from "react";
import sinon from "sinon";
import { GroupingHierarchyNode, NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import { configure, RenderOptions, RenderResult, render as renderRTL } from "@testing-library/react";
import { userEvent, UserEvent } from "@testing-library/user-event";
import {
  isTreeModelHierarchyNode,
  isTreeModelInfoNode,
  TreeModel,
  TreeModelGenericInfoNode,
  TreeModelHierarchyNode,
  TreeModelInfoNode,
  TreeModelNoFilterMatchesInfoNode,
  TreeModelResultSetTooLargeInfoNode,
} from "../presentation-hierarchies-react/internal/TreeModel.js";

configure({ reactStrictMode: true });

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 */
function customRender(ui: ReactElement, options?: RenderOptions): RenderResult & { user: UserEvent } {
  return {
    ...renderRTL(ui, options),
    user: userEvent.setup(),
  };
}

export * from "@testing-library/react";
export { customRender as render };

export function createStub<T extends (...args: any[]) => any>() {
  return sinon.stub<Parameters<T>, ReturnType<T>>();
}

export function getHierarchyNode(model: TreeModel, id: string | undefined) {
  const node = TreeModel.getNode(model, id);
  return node && isTreeModelHierarchyNode(node) ? node : undefined;
}

type ModelInputNode = (Partial<Omit<TreeModelHierarchyNode, "children" | "id">> & { id: string | undefined; children?: string[] }) | TreeModelInfoNode;
type ModelInput = Array<ModelInputNode>;

function isModelInputInfoNode(node: ModelInputNode): node is TreeModelInfoNode {
  return isTreeModelInfoNode(node as TreeModelInfoNode);
}

export function createTreeModel(seed: ModelInput) {
  const model: TreeModel = {
    idToNode: new Map(),
    parentChildMap: new Map(),
    rootNode: { id: undefined, nodeData: undefined },
  };

  for (const input of seed) {
    if (isModelInputInfoNode(input)) {
      model.idToNode.set(input.id, input);
      continue;
    }

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

export function createTreeModelNode(props: Partial<TreeModelHierarchyNode> & { id: string }): TreeModelHierarchyNode {
  return {
    ...props,
    label: props.label ?? props.id,
    children: props.children ?? false,
    nodeData: props.nodeData ?? createTestHierarchyNode({ id: props.id }),
  };
}

export function createTestModelGenericInfoNode({ id, ...props }: Partial<TreeModelGenericInfoNode> & { id: string }): TreeModelGenericInfoNode {
  return {
    ...props,
    id,
    parentId: props.parentId ?? undefined,
    message: props.message ?? "test-message",
    type: props.type ?? "Unknown",
  };
}

export function createTestModelNoFilterMatchesInfoNode({
  id,
  ...props
}: Partial<TreeModelNoFilterMatchesInfoNode> & { id: string }): TreeModelNoFilterMatchesInfoNode {
  return {
    ...props,
    id,
    parentId: props.parentId ?? undefined,
    type: "NoFilterMatches",
  };
}

export function createTestModelResultSetTooLargeInfoNode({
  id,
  ...props
}: Partial<TreeModelResultSetTooLargeInfoNode> & { id: string }): TreeModelResultSetTooLargeInfoNode {
  return {
    ...props,
    id,
    parentId: props.parentId ?? undefined,
    type: "ResultSetTooLarge",
    resultSetSizeLimit: props.resultSetSizeLimit ?? 10,
  };
}

export function createTestHierarchyNode({ id, ...props }: Partial<NonGroupingHierarchyNode> & { id: string }): NonGroupingHierarchyNode {
  return {
    ...props,
    key: props.key ?? { type: "generic", id },
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

export function stubGetBoundingClientRect() {
  let stub: sinon.SinonStub<[], DOMRect>;

  beforeEach(() => {
    stub = sinon.stub(window.Element.prototype, "getBoundingClientRect").returns({
      height: 20,
      width: 20,
      x: 0,
      y: 0,
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      toJSON: () => {},
    });
  });

  afterEach(() => {
    stub.restore();
  });
}
