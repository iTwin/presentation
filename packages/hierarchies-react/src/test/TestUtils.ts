/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, expect, vi } from "vitest";
import { createHierarchyProvider } from "@itwin/presentation-hierarchies";
import { render as renderRTL } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { TreeModel } from "../presentation-hierarchies-react/internal/TreeModel.js";

import type { ReactElement } from "react";
import type {
  GroupingHierarchyNode,
  HierarchyProvider,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import type { EventListener, RaisableEvent } from "@itwin/presentation-shared";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import type {
  TreeModelHierarchyNode,
  TreeModelRootNode,
} from "../presentation-hierarchies-react/internal/TreeModel.js";
import type {
  ChildrenLoadErrorInfo,
  ErrorInfo,
  GenericErrorInfo,
  NoFilterMatchesErrorInfo,
  ResultSetTooLargeErrorInfo,
} from "../presentation-hierarchies-react/TreeNode.js";
import type { UseTreeResult } from "../presentation-hierarchies-react/UseTree.js";

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 */
function customRender(ui: ReactElement, options?: RenderOptions): RenderResult & { user: UserEvent } {
  return { ...renderRTL(ui, options), user: userEvent.setup() };
}

export * from "@testing-library/react";
export { customRender as render };

export function getHierarchyNode(model: TreeModel, id: string | undefined) {
  const node = TreeModel.getNode(model, id);
  return node && isTreeModelHierarchyNode(node) ? node : undefined;
}

type ModelInputNode = Partial<Omit<TreeModelHierarchyNode, "children" | "id">> & {
  id: string | undefined;
  children?: string[];
};
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
      model.rootNode = {
        ...model.rootNode,
        instanceFilter: input.instanceFilter,
        hierarchyLimit: input.hierarchyLimit,
      };
      continue;
    }

    const nodeId = input.id;
    const node = model.idToNode.get(nodeId);
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

export function createTestGenericErrorInfo({
  id,
  ...props
}: Partial<GenericErrorInfo> & { id: string }): GenericErrorInfo {
  return { ...props, id, message: props.message ?? "test-message", type: props.type ?? "Unknown" };
}

export function createTestChildrenLoadErrorInfo({
  id,
  ...props
}: Partial<ChildrenLoadErrorInfo> & { id: string }): ChildrenLoadErrorInfo {
  return { ...props, id, message: props.message ?? "test-message", type: "ChildrenLoad" };
}

export function createTestNoFilterMatchesErrorInfo({
  id,
  ...props
}: Partial<NoFilterMatchesErrorInfo> & { id: string }): NoFilterMatchesErrorInfo {
  return { ...props, id, type: "NoFilterMatches" };
}

export function createTestResultSetTooLargeErrorInfo({
  id,
  ...props
}: Partial<ResultSetTooLargeErrorInfo> & { id: string }): ResultSetTooLargeErrorInfo {
  return { ...props, id, type: "ResultSetTooLarge", resultSetSizeLimit: props.resultSetSizeLimit ?? 10 };
}

export function createTestHierarchyNode({
  id,
  ...props
}: Partial<NonGroupingHierarchyNode> & { id: string }): NonGroupingHierarchyNode {
  return {
    ...props,
    key: props.key ?? { type: "generic", id },
    label: props.label ?? id,
    children: props.children ?? false,
    parentKeys: props.parentKeys ?? [],
  };
}

export function createTestGroupingNode({
  id,
  ...props
}: Partial<GroupingHierarchyNode> & { id: string }): GroupingHierarchyNode {
  return {
    ...props,
    key: props.key ?? { type: "class-grouping", className: "Schema:Class" },
    label: props.label ?? id,
    children: props.children ?? false,
    parentKeys: props.parentKeys ?? [],
    groupedInstanceKeys: props.groupedInstanceKeys ?? [],
  };
}

export function stubVirtualization() {
  beforeEach(() => {
    vi.spyOn(window.HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
    vi.spyOn(window.HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(window.Element.prototype, "getBoundingClientRect").mockReturnValue({
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
}

export type StubbedHierarchyProvider = {
  [P in keyof Omit<HierarchyProvider, "hierarchyChanged">]: ReturnType<typeof vi.fn<HierarchyProvider[P]>>;
} & {
  hierarchyChanged: RaisableEvent<EventListener<HierarchyProvider["hierarchyChanged"]>>;
  [Symbol.dispose]: ReturnType<typeof vi.fn<() => void>>;
};
export function createHierarchyProviderStub(
  customizations?: Partial<StubbedHierarchyProvider>,
): StubbedHierarchyProvider {
  const provider = createHierarchyProvider(() => ({
    getNodes: vi.fn<HierarchyProvider["getNodes"]>(),
    getNodeInstanceKeys: vi.fn<HierarchyProvider["getNodeInstanceKeys"]>(),
    setFormatter: vi.fn<HierarchyProvider["setFormatter"]>(),
    setHierarchySearch: vi.fn<HierarchyProvider["setHierarchySearch"]>(),
    [Symbol.dispose]: vi.fn<() => void>(),
    ...customizations,
  }));
  provider.setFormatter.mockImplementation((arg) =>
    provider.hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: arg } }),
  );
  provider.setHierarchySearch.mockImplementation((arg) =>
    provider.hierarchyChanged.raiseEvent({ searchChange: { newSearch: arg } }),
  );
  return provider;
}

export function getTreeRendererProps(useTreeResult: UseTreeResult) {
  if (useTreeResult.rootErrorRendererProps !== undefined) {
    expect(false).toBe(true);
    return undefined;
  }
  return useTreeResult.treeRendererProps;
}

export function isTreeModelHierarchyNode(
  node: TreeModelHierarchyNode | ErrorInfo | TreeModelRootNode,
): node is TreeModelHierarchyNode {
  return "nodeData" in node && node.nodeData !== undefined;
}
