/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ReactElement } from "react";
import sinon from "sinon";
import { BeEvent } from "@itwin/core-bentley";
import { GroupingHierarchyNode, HierarchyProvider, NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import { EventArgs } from "@itwin/presentation-shared";
import { configure, RenderOptions, RenderResult, render as renderRTL } from "@testing-library/react";
import { userEvent, UserEvent } from "@testing-library/user-event";
import { isTreeModelHierarchyNode, TreeModel, TreeModelHierarchyNode } from "../presentation-hierarchies-react/internal/TreeModel.js";
import { ChildrenLoadErrorInfo, GenericErrorInfo, NoFilterMatchesErrorInfo, ResultSetTooLargeErrorInfo } from "../presentation-hierarchies-react/TreeNode.js";
import { UseTreeResult } from "../presentation-hierarchies-react/UseTree.js";

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

type ModelInputNode = Partial<Omit<TreeModelHierarchyNode, "children" | "id">> & { id: string | undefined; children?: string[] };
type ModelInput = Array<ModelInputNode>;

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

export function createTreeModelNode(props: Partial<TreeModelHierarchyNode> & { id: string }): TreeModelHierarchyNode {
  return {
    ...props,
    label: props.label ?? props.id,
    children: props.children ?? false,
    nodeData: props.nodeData ?? createTestHierarchyNode({ id: props.id }),
  };
}

export function createTestGenericErrorInfo({ id, ...props }: Partial<GenericErrorInfo> & { id: string }): GenericErrorInfo {
  return {
    ...props,
    id,
    message: props.message ?? "test-message",
    type: props.type ?? "Unknown",
  };
}

export function createTestChildrenLoadErrorInfo({ id, ...props }: Partial<ChildrenLoadErrorInfo> & { id: string }): ChildrenLoadErrorInfo {
  return {
    ...props,
    id,
    message: props.message ?? "test-message",
    type: "ChildrenLoad",
  };
}

export function createTestNoFilterMatchesErrorInfo({ id, ...props }: Partial<NoFilterMatchesErrorInfo> & { id: string }): NoFilterMatchesErrorInfo {
  return {
    ...props,
    id,
    type: "NoFilterMatches",
  };
}

export function createTestResultSetTooLargeErrorInfo({ id, ...props }: Partial<ResultSetTooLargeErrorInfo> & { id: string }): ResultSetTooLargeErrorInfo {
  return {
    ...props,
    id,
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

export function stubVirtualization() {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(sinon.stub(window.HTMLElement.prototype, "offsetHeight").get(() => 800));
    stubs.push(sinon.stub(window.HTMLElement.prototype, "offsetWidth").get(() => 800));

    stubs.push(
      sinon.stub(window.Element.prototype, "getBoundingClientRect").returns({
        height: 20,
        width: 20,
        x: 0,
        y: 0,
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        toJSON: () => {},
      }),
    );
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs = [];
  });
}

export type StubbedHierarchyProvider = {
  [P in keyof Omit<HierarchyProvider, "hierarchyChanged">]: ReturnType<typeof createStub<HierarchyProvider[P]>>;
} & {
  hierarchyChanged: BeEvent<(args?: EventArgs<HierarchyProvider["hierarchyChanged"]>) => void>;
  [Symbol.dispose]: sinon.SinonStub<[], void>;
};
export function createHierarchyProviderStub(customizations?: Partial<StubbedHierarchyProvider>) {
  const provider = {
    hierarchyChanged: new BeEvent(),
    getNodes: createStub<HierarchyProvider["getNodes"]>(),
    getNodeInstanceKeys: createStub<HierarchyProvider["getNodeInstanceKeys"]>(),
    setFormatter: createStub<HierarchyProvider["setFormatter"]>(),
    setHierarchyFilter: createStub<HierarchyProvider["setHierarchyFilter"]>(),
    [Symbol.dispose]: createStub<() => void>(),
    ...customizations,
  };
  provider.setFormatter.callsFake((arg) => provider.hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: arg } }));
  provider.setHierarchyFilter.callsFake((arg) => provider.hierarchyChanged.raiseEvent({ filterChange: { newFilter: arg } }));
  return provider;
}

export function getTreeRendererProps(useTreeResult: UseTreeResult) {
  if (useTreeResult.rootErrorRendererProps !== undefined) {
    expect(false).to.be.true;
    return undefined;
  }
  return useTreeResult.treeRendererProps;
}
