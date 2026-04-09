/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator, ResolvablePromise, throwingAsyncIterator } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeEvent } from "@itwin/core-bentley";
import {
  createHierarchyProvider,
  HierarchyNodeKey,
  HierarchySearchTree,
  RowsLimitExceededError,
} from "@itwin/presentation-hierarchies";
import { createStorage, Selectables } from "@itwin/unified-selection";
import { createNodeId } from "../presentation-hierarchies-react/internal/Utils.js";
import { useTree, useUnifiedSelectionTree } from "../presentation-hierarchies-react/UseTree.js";
import {
  act,
  cleanup,
  createHierarchyProviderStub,
  createTestGroupingNode,
  createTestHierarchyNode,
  getTreeRendererProps,
  renderHook,
  waitFor,
} from "./TestUtils.js";

import type {
  GenericInstanceFilter,
  GenericNodeKey,
  HierarchyProvider,
  InstancesNodeKey,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import type { IPrimitiveValueFormatter, Props } from "@itwin/presentation-shared";
import type { Selectable, SelectionStorage, StorageSelectionChangesListener } from "@itwin/unified-selection";
import type { TreeNode } from "../presentation-hierarchies-react/TreeNode.js";
import type { StubbedHierarchyProvider } from "./TestUtils.js";

describe("useTree", () => {
  let hierarchyProvider: StubbedHierarchyProvider;
  const onHierarchyLoadErrorStub = vi.fn();

  type UseTreeProps = Props<typeof useTree>;
  const initialProps: UseTreeProps = {
    getHierarchyProvider: () => hierarchyProvider,
    onHierarchyLoadError: onHierarchyLoadErrorStub,
  };

  beforeEach(() => {
    hierarchyProvider = createHierarchyProviderStub();
  });

  it("disposes hierarchy provider on unmount", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) =>
      createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []),
    );
    const { result, unmount } = renderHook(useTree, { initialProps });
    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
    });
    unmount();
    await waitFor(() => {
      expect(hierarchyProvider[Symbol.dispose]).toHaveBeenCalled();
    });
  });

  it("unsubscribes from hierarchy changes on unmount", async () => {
    const hierarchyChanged = new BeEvent();
    hierarchyProvider.hierarchyChanged = hierarchyChanged;
    hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));

    const { result, unmount } = renderHook(useTree, { initialProps });
    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).toBeDefined();
    });
    expect(hierarchyChanged.numberOfListeners).to.not.eq(0);
    unmount();
    await waitFor(() => {
      expect(hierarchyChanged.numberOfListeners).to.eq(0);
    });
  });

  it("loads root nodes", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(
        props.parentNode === undefined
          ? [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]
          : [],
      );
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(2);
    });
  });

  it("loads root nodes with minimal provider setup", async () => {
    const customHierarchyProvider = createHierarchyProvider(() => ({
      async *getNodes({}) {
        yield createTestHierarchyNode({ id: "root-1" });
      },
    }));

    const customProps: UseTreeProps = { getHierarchyProvider: () => customHierarchyProvider };

    const { result } = renderHook(useTree, { initialProps: customProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
    });
  });

  it("loads and sets custom error to root nodes with minimal provider setup", async () => {
    const customHierarchyProvider = createHierarchyProvider(() => ({
      async *getNodes({}) {
        yield createTestHierarchyNode({ id: "root-1" });
      },
    }));

    const customProps: UseTreeProps = {
      getHierarchyProvider: () => customHierarchyProvider,
      getTreeNodeErrors: (node) => {
        return [{ id: `${node.label}-error`, type: "Unknown", message: "Test error" }];
      },
    };

    const { result } = renderHook(useTree, { initialProps: customProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].errors[0]).to.deep.equal({
        id: "root-1-error",
        type: "Unknown",
        message: "Test error",
      });
    });
  });

  it("loads searched nodes paths", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const searchTree = await HierarchySearchTree.createFromPathsList([[{ id: "0x1", className: "Schema:Class" }]]);
    const promise = new ResolvablePromise<HierarchySearchTree[]>();
    const getSearchPaths = async () => promise;

    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.undefined;
    });

    await act(async () => {
      await promise.resolve(searchTree);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.not.undefined;
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(hierarchyProvider.setHierarchySearch).toHaveBeenCalledWith({ paths: searchTree });
    });
  });

  it("sets 'isReloading' to false only after root nodes are loaded", async () => {
    const rootNode1 = createTestHierarchyNode({ id: "root-1" });
    const rootNode2 = createTestHierarchyNode({ id: "root-2" });
    let getNodesCallCount = 0;
    const customHierarchyProvider = createHierarchyProvider(({ hierarchyChanged }) => ({
      async *getNodes() {
        if (getNodesCallCount < 1) {
          ++getNodesCallCount;
          yield rootNode1;
          yield rootNode2;
        } else {
          await new Promise((res) => setTimeout(res, 50));
          yield rootNode1;
        }
      },
      setHierarchySearch(newSearch) {
        hierarchyChanged.raiseEvent({ searchChange: { newSearch } });
      },
    }));

    const promise = new ResolvablePromise<HierarchySearchTree[]>();
    const { result, rerender } = renderHook(useTree, {
      initialProps: { getHierarchyProvider: () => customHierarchyProvider, getSearchPaths: () => promise },
    });
    await waitFor(() => {
      expect(getNodesCallCount).to.eq(0);
      expect(result.current.isReloading).toBe(true);
    });
    await waitFor(async () => {
      await promise.resolve([]);
      expect(getNodesCallCount).to.eq(1);
      expect(result.current.isReloading).toBe(false);
    });
    let treeRenderProps = getTreeRendererProps(result.current);
    expect(treeRenderProps?.rootNodes).toHaveLength(2);

    rerender({ getHierarchyProvider: () => customHierarchyProvider, getSearchPaths: () => promise });
    await waitFor(() => {
      expect(getNodesCallCount).to.eq(1);
      expect(result.current.isReloading).toBe(true);
    });

    await waitFor(async () => {
      await promise.resolve([]);
      expect(result.current.isReloading).toBe(false);
    });
    treeRenderProps = getTreeRendererProps(result.current);
    expect(treeRenderProps?.rootNodes).toHaveLength(1);
  });

  it("aborts search nodes paths loading on useTree cleanup", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const promise = new ResolvablePromise<HierarchySearchTree[]>();
    let signal: AbortSignal | undefined;
    const getSearchPaths = async ({ abortSignal }: { abortSignal: AbortSignal }) => {
      signal = abortSignal;
      return promise;
    };

    const { result, unmount } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths } });

    await waitFor(() => {
      expect(result.current.isReloading).toBe(true);
    });
    unmount();
    await waitFor(() => {
      expect(signal?.aborted).toBe(true);
    });
  });

  it("loads default hierarchy when `getSearchPaths` returns `undefined`", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const promise = new ResolvablePromise<HierarchySearchTree[] | undefined>();
    const getSearchPaths = async () => promise;

    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.undefined;
    });

    await act(async () => {
      await promise.resolve(undefined);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(hierarchyProvider.setHierarchySearch).toHaveBeenCalledWith(undefined);
    });
  });

  it("loads hierarchy using latest search paths", async () => {
    const searchTree1 = await HierarchySearchTree.createFromPathsList([[{ id: "0x1", className: "Schema:Class" }]]);
    const searchTree2 = await HierarchySearchTree.createFromPathsList([[{ id: "0x2", className: "Schema:Class" }]]);

    const rootNode1 = createTestHierarchyNode({ id: "root-1" });
    const rootNode2 = createTestHierarchyNode({ id: "root-2" });

    hierarchyProvider.getNodes.mockImplementation(() => {
      const activePaths =
        hierarchyProvider.setHierarchySearch.mock.calls[hierarchyProvider.setHierarchySearch.mock.calls.length - 1][0]
          ?.paths;
      if (activePaths === searchTree1) {
        return createAsyncIterator([rootNode1]);
      }
      if (activePaths === searchTree2) {
        return createAsyncIterator([rootNode2]);
      }
      return createAsyncIterator([]);
    });

    const promise1 = new ResolvablePromise<HierarchySearchTree[]>();
    const getSearchPaths1 = vi.fn().mockImplementation(async () => promise1);

    const { result, rerender } = renderHook(useTree, {
      initialProps: { ...initialProps, getSearchPaths: getSearchPaths1 },
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.undefined;
      expect(getSearchPaths1).to.be.called;
      expect(hierarchyProvider.setHierarchySearch).to.not.be.called;
    });

    const promise2 = new ResolvablePromise<HierarchySearchTree[]>();
    const getSearchPaths2 = vi.fn().mockImplementation(async () => promise2);

    rerender({ ...initialProps, getSearchPaths: getSearchPaths2 });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.undefined;
      expect(getSearchPaths2).to.be.called;
      expect(hierarchyProvider.setHierarchySearch).to.not.be.called;
    });

    await act(async () => {
      await promise2.resolve(searchTree2);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].id).toBe(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchySearch).toHaveBeenCalledWith({ paths: searchTree2 });
    });

    await act(async () => {
      await promise1.resolve(searchTree1);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].id).toBe(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchySearch).to.not.be.calledWith({ paths: searchTree1 });
    });
  });

  it("does not persist tree state when hierarchy is search", async () => {
    const rootNodes1 = [createTestHierarchyNode({ id: "root-1", autoExpand: true, children: true })];
    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes1);
      }
      return createAsyncIterator([
        createTestHierarchyNode({ id: "child-1" }),
        createTestHierarchyNode({ id: "child-2" }),
      ]);
    });

    const { result, rerender } = renderHook(useTree, { initialProps: { ...initialProps } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      const rootNode = treeRenderProps!.rootNodes[0];
      expect(rootNode.id).toBe(createNodeId(rootNodes1[0]));
      expect(rootNode.isExpanded).toBe(true);
      expect(rootNode.children).toHaveLength(2);
    });

    const rootNodes2 = [createTestHierarchyNode({ id: "root-2", autoExpand: false, children: true })];
    hierarchyProvider.getNodes.mockReset();
    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes2);
      }
      return createAsyncIterator([
        createTestHierarchyNode({ id: "child-1" }),
        createTestHierarchyNode({ id: "child-2" }),
      ]);
    });

    rerender({ ...initialProps, getSearchPaths: async () => [] });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      const rootNode = treeRenderProps!.rootNodes[0];
      expect(rootNode.id).toBe(createNodeId(rootNodes2[0]));
      expect(rootNode.isExpanded).toBe(false);
      expect(rootNode.children).toBe(true);
    });
  });

  it("ignores error during search paths loading", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => {
      return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
    });
    const getSearchPaths = async () => {
      throw new Error("test error");
    };
    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(hierarchyProvider.setHierarchySearch).toHaveBeenCalledWith(undefined);
    });
  });

  it("`getNode` returns node when `nodeId` refers to a hierarchy node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(result.current.getNode(createNodeId(rootNodes[0]))).to.containSubset({
        id: createNodeId(rootNodes[0]),
        nodeData: rootNodes[0],
      });
    });
  });

  it("`getNode` returns undefined when `nodeId` refers to non existing node", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => {
      return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(result.current.getNode("test-id")).to.be.undefined;
    });
  });

  it("expands node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toBe(true);
    });

    act(() => {
      getTreeRendererProps(result.current)!.expandNode(createNodeId(rootNodes[0]), true);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(1);
    });
  });

  it("selects node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.isNodeSelected(createNodeId(rootNodes[0]))).toBe(false);
    });

    act(() => {
      getTreeRendererProps(result.current)!.selectNodes([createNodeId(rootNodes[0])], "add");
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.isNodeSelected(createNodeId(rootNodes[0]))).toBe(true);
    });
  });

  it("sets hierarchy limit", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.hierarchyLevelSizeLimit === undefined) {
        return throwingAsyncIterator(new RowsLimitExceededError(1));
      }
      if (props.parentNode === undefined && props.hierarchyLevelSizeLimit === 50) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps!.error.type).toBe("ResultSetTooLarge");
    });

    act(() => {
      result.current.rootErrorRendererProps!.getHierarchyLevelDetails(undefined)?.setSizeLimit(50);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(2);
    });
  });

  it("applies and removes instance filter on tree root", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(props.instanceFilter === undefined ? rootNodes : rootNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(2);
    });

    const filter: GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };

    act(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      treeRenderProps!.getHierarchyLevelDetails(undefined)!.setInstanceFilter(filter);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
    });

    act(() => {
      getTreeRendererProps(result.current)!.getHierarchyLevelDetails(undefined)?.setInstanceFilter(undefined);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(2);
    });
  });

  it("applies and removes instance filter", async () => {
    const rootNodes = [
      createTestHierarchyNode({ id: "root-1", autoExpand: true, supportsFiltering: true, children: true }),
    ];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
        return createAsyncIterator(props.instanceFilter === undefined ? childNodes : childNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(2);
    });

    const filter: GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };

    act(() => {
      getTreeRendererProps(result.current)!
        .getHierarchyLevelDetails(createNodeId(rootNodes[0]))
        ?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(1);
    });

    act(() => {
      getTreeRendererProps(result.current)!
        .getHierarchyLevelDetails(createNodeId(rootNodes[0]))!
        .setInstanceFilter(undefined);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(2);
    });
  });

  it("applies instance filter on grouping node parent", async () => {
    const rootNodes = [
      createTestHierarchyNode({ id: "root-1", autoExpand: true, children: true, supportsFiltering: true }),
    ];
    const groupingNode = createTestGroupingNode({
      id: "grouping-node",
      key: { type: "class-grouping", className: "Schema:Class" },
      nonGroupingAncestor: rootNodes[0],
      autoExpand: true,
    });
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
        return createAsyncIterator([groupingNode]);
      }
      if (HierarchyNodeKey.isClassGrouping(props.parentNode.key)) {
        return createAsyncIterator(props.instanceFilter ? childNodes.slice(0, 1) : childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(1);
      const groupingTreeNode = (treeRenderProps!.rootNodes[0] as any).children[0] as TreeNode;
      expect(groupingTreeNode.children).toHaveLength(2);
    });

    const filter: GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };

    act(() => {
      getTreeRendererProps(result.current)!
        .getHierarchyLevelDetails(createNodeId(rootNodes[0]))!
        .setInstanceFilter(filter);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(1);
      const groupingTreeNode = (treeRenderProps?.rootNodes[0] as any).children[0] as TreeNode;
      expect(groupingTreeNode.children).toHaveLength(1);
    });
  });

  it("handles empty nodes list after applying instance filter", async () => {
    const rootNode = createTestHierarchyNode({ id: "root-1" });
    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(props.instanceFilter === undefined ? [rootNode] : []);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].id).to.eq(createNodeId(rootNode));
    });

    const filter: GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };
    act(() => {
      getTreeRendererProps(result.current)!.getHierarchyLevelDetails(undefined)!.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).toBeDefined();
      expect(result.current.rootErrorRendererProps!.error.type).to.eq("NoFilterMatches");
    });
  });

  it("`getHierarchyLevelDetails` returns undefined for invalid node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)!.rootNodes).toHaveLength(1);
    });

    const details = getTreeRendererProps(result.current)!.getHierarchyLevelDetails("invalid");
    expect(details).to.be.undefined;
  });

  it("`getHierarchyLevelDetails` returns undefined for grouping node", async () => {
    const rootNodes = [createTestGroupingNode({ id: "grouping-node", children: true, autoExpand: true })];
    const childNodes = [
      createTestHierarchyNode({ id: "grouped-node-1" }),
      createTestHierarchyNode({ id: "grouped-node-1" }),
    ];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(2);
    });

    const details = getTreeRendererProps(result.current)!.getHierarchyLevelDetails(nodeId);
    expect(details).to.be.undefined;
  });

  it("`getHierarchyLevelDetails` returns options for hierarchy node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) =>
      createAsyncIterator(props.parentNode === undefined ? rootNodes : []),
    );
    hierarchyProvider.getNodeInstanceKeys.mockImplementation(() =>
      createAsyncIterator([
        { id: "0x1", className: "Schema:Class" },
        { id: "0x2", className: "Schema:Class" },
      ]),
    );
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)?.rootNodes).toHaveLength(1);
    });

    const details = getTreeRendererProps(result.current)!.getHierarchyLevelDetails(nodeId);
    expect(details).toBeDefined();
    expect(details!.hierarchyNode).toBe(rootNodes[0]);
    const filter = {
      rules: { rules: [], operator: "and" },
      propertyClassNames: [],
      relatedInstances: [],
    } satisfies GenericInstanceFilter;
    const keys = await collect(
      details?.getInstanceKeysIterator({ instanceFilter: filter, hierarchyLevelSizeLimit: 100 }) ?? [],
    );
    expect(keys).toHaveLength(2);
    const callArgs = hierarchyProvider.getNodeInstanceKeys.mock.calls[0][0];
    expect(callArgs.instanceFilter).toEqual(filter);
    expect(callArgs.hierarchyLevelSizeLimit).toBe(100);
  });

  it("reloads tree when `reloadTree` is called", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes.slice(0, 1));
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(1);
    });

    hierarchyProvider.getNodes.mockReset();
    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });

    act(() => {
      getTreeRendererProps(result.current)!.reloadTree();
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(2);
    });
  });

  it("reports nodes load performance", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
    const onPerformanceMeasuredSpy = vi.fn();
    const { result } = renderHook(useTree, {
      initialProps: { ...initialProps, onPerformanceMeasured: onPerformanceMeasuredSpy },
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.deep.eq([]);
      expect(onPerformanceMeasuredSpy).toHaveBeenCalledWith("initial-load", expect.any(Number));
    });
  });

  it("reports when hierarchy level size exceeds limit", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => {
      return throwingAsyncIterator(new RowsLimitExceededError(555));
    });
    const onHierarchyLimitExceededSpy = vi.fn();
    const { result } = renderHook(useTree, {
      initialProps: { ...initialProps, onHierarchyLimitExceeded: onHierarchyLimitExceededSpy },
    });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).toBeDefined();
      const errorInfo = result.current.rootErrorRendererProps?.error;
      expect(errorInfo!.type).toBe("ResultSetTooLarge");
      expect(onHierarchyLimitExceededSpy).toHaveBeenCalledWith({ parentId: undefined, filter: undefined, limit: 555 });
    });
  });

  it("handles error during nodes load", async () => {
    const error = new Error("test error");
    hierarchyProvider.getNodes.mockImplementation(() => {
      return throwingAsyncIterator(error);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).toBeDefined();
      const errorInfo = result.current.rootErrorRendererProps?.error;
      expect(errorInfo!.type).toBe("ChildrenLoad");
      expect(onHierarchyLoadErrorStub).toHaveBeenCalledWith({ parentId: undefined, type: "unknown", error });
    });
  });

  it("handles timeouts during nodes load", async () => {
    const error = new Error("query too long to execute or server is too busy");
    hierarchyProvider.getNodes.mockImplementation(() => {
      return throwingAsyncIterator(error);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).toBeDefined();
      const errorInfo = result.current.rootErrorRendererProps?.error;
      expect(errorInfo!.type).toBe("ChildrenLoad");
      expect(onHierarchyLoadErrorStub).toHaveBeenCalledWith({ parentId: undefined, type: "timeout", error });
    });
  });

  it("sets formatter initially to `undefined` and allows overriding it", async () => {
    hierarchyProvider.getNodes.mockImplementation(() =>
      createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]),
    );
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)!.rootNodes).toHaveLength(1);
    });
    expect(hierarchyProvider.setFormatter).toHaveBeenCalledWith(undefined);

    const formatter = {} as IPrimitiveValueFormatter;
    act(() => {
      result.current.setFormatter(formatter);
    });

    await waitFor(() => {
      expect(hierarchyProvider.setFormatter).toHaveBeenCalledWith(formatter);
    });
  });

  it("reloads tree when `getHierarchyProvider` changes", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });
    const { rerender, result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(2);
    });

    const newProvider = createHierarchyProviderStub({
      getNodes: vi.fn<HierarchyProvider["getNodes"]>().mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootNodes);
        }
        return createAsyncIterator(childNodes.slice(0, 1));
      }),
    });
    rerender({ ...initialProps, getHierarchyProvider: () => newProvider as unknown as HierarchyProvider });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(1);
    });
  });

  it("reloads sub tree when `reloadTree` is called with parent id", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return throwingAsyncIterator(new Error("test error"));
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].errors).toBeDefined();
      expect(treeRenderProps!.rootNodes[0].errors[0].type).toBe("ChildrenLoad");
    });

    hierarchyProvider.getNodes.mockReset();
    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });

    act(() => {
      getTreeRendererProps(result.current)!.reloadTree({ parentNodeId: createNodeId(rootNodes[0]) });
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].children).toHaveLength(2);
      const children = treeRenderProps!.rootNodes[0].children;
      expect(children).to.containSubset(childNodes.map((n) => ({ id: createNodeId(n) })));
    });
  });

  it("reloads tree when hierarchy provider raises `hierarchyChanged` event", async () => {
    const nodeBefore = createTestHierarchyNode({ id: "root-before" });
    const nodeAfter = createTestHierarchyNode({ id: "root-after" });

    hierarchyProvider.getNodes.mockImplementation(({ parentNode }) => {
      if (!parentNode) {
        return createAsyncIterator([nodeBefore]);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toMatchObject([{ id: createNodeId(nodeBefore) }]);
    });

    hierarchyProvider.getNodes.mockReset();
    hierarchyProvider.getNodes.mockImplementation(({ parentNode }) => {
      if (!parentNode) {
        return createAsyncIterator([nodeAfter]);
      }
      return createAsyncIterator([]);
    });
    act(() => {
      hierarchyProvider.hierarchyChanged.raiseEvent({});
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes).toMatchObject([{ id: createNodeId(nodeAfter) }]);
    });
  });

  it("getTreeNodeErrors merges errors", async () => {
    hierarchyProvider.getNodes.mockImplementation(({ parentNode }) => {
      if (!parentNode) {
        return createAsyncIterator([createTestHierarchyNode({ id: "root-1", children: true })]);
      }
      return throwingAsyncIterator(new Error("Children load failed"));
    });

    const { result } = renderHook(useTree, {
      initialProps: {
        ...initialProps,
        getTreeNodeErrors: () => [{ id: "custom-error", type: "Unknown", message: "Custom error" }],
      },
    });

    // Children are not loaded yet, so only custom error is expected
    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.rootNodes[0].errors[0]?.type).to.eq("Unknown");
    });

    // Try loading children to trigger error
    const initialTreeRenderProps = getTreeRendererProps(result.current)!;
    await act(async () => {
      initialTreeRenderProps.expandNode(initialTreeRenderProps.rootNodes[0].id, true);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current)!;
      expect(treeRenderProps.rootNodes[0].errors.length).toBe(2);
      expect(treeRenderProps.rootNodes[0].errors[0]?.type).toBe("ChildrenLoad");
    });
  });
});

describe("useUnifiedSelectionTree", () => {
  let storage: SelectionStorage;
  const sourceName = "test-source";
  const changeListener = vi.fn<StorageSelectionChangesListener>();
  const hierarchyProvider = createHierarchyProviderStub();
  let initialProps: Props<typeof useUnifiedSelectionTree>;

  function createNodeKey(id: string) {
    const imodelKey = "test-imodel-key";
    const instanceKey = { id, className: "Schema:Class" as const, imodelKey };
    const instancesNodeKey: InstancesNodeKey = { type: "instances", instanceKeys: [instanceKey] };
    return { instanceKey, instancesNodeKey, imodelKey };
  }

  function createHierarchyNodeWithKey(key: NonGroupingHierarchyNode["key"], name: string, children = false) {
    const node = createTestHierarchyNode({ id: name, key, autoExpand: true, children });
    const nodeId = createNodeId(node);
    return { nodeId, node };
  }

  beforeEach(() => {
    hierarchyProvider.getNodes.mockReset();
    changeListener.mockReset();
    storage = createStorage();
    storage.selectionChangeEvent.addListener(changeListener);
    initialProps = {
      getHierarchyProvider: () => hierarchyProvider as unknown as HierarchyProvider,
      sourceName,
      selectionStorage: storage,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("adds instance node to unified selection", async () => {
    const { instanceKey, instancesNodeKey, imodelKey } = createNodeKey("0x1");
    const { nodeId: nodeId, node: node } = createHierarchyNodeWithKey(instancesNodeKey, "root-1");
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.isNodeSelected(nodeId)).toBe(false);
    });

    act(() => {
      getTreeRendererProps(result.current)!.selectNodes([nodeId], "add");
    });

    await waitFor(() => {
      expect(changeListener).toHaveBeenCalledOnce();
      const callArgs = changeListener.mock.calls[0][0];
      expect(callArgs.changeType).toBe("add");
      expect(callArgs.imodelKey).toBe(imodelKey);
      expect(callArgs.source).toBe(sourceName);
      expect(Selectables.size(callArgs.selectables)).toBe(1);
      expect(Selectables.has(callArgs.selectables, instanceKey)).toBe(true);

      expect(getTreeRendererProps(result.current)!.isNodeSelected(nodeId)).toBe(true);
    });
  });

  it("adds custom selectable to unified selection", async () => {
    const nodeKey: GenericNodeKey = { type: "generic", id: "test-node" };
    const { nodeId: nodeId, node: node } = createHierarchyNodeWithKey(nodeKey, "root-1");
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const testSelectable: Selectable = { identifier: "test-selectable", data: {}, async *loadInstanceKeys() {} };

    const { result } = renderHook(useUnifiedSelectionTree, {
      initialProps: { ...initialProps, createSelectableForGenericNode: () => testSelectable },
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.isNodeSelected(nodeId)).toBe(false);
    });

    act(() => {
      getTreeRendererProps(result.current)!.selectNodes([nodeId], "add");
    });

    await waitFor(() => {
      expect(changeListener).toHaveBeenCalledOnce();
      const callArgs = changeListener.mock.calls[0][0];
      expect(callArgs.changeType).toBe("add");
      expect(callArgs.source).toBe(sourceName);
      expect(Selectables.size(callArgs.selectables)).toBe(1);
      expect(Selectables.has(callArgs.selectables, testSelectable)).toBe(true);

      expect(getTreeRendererProps(result.current)!.isNodeSelected(nodeId)).toBe(true);
    });
  });

  it("reacts to unified selection changes", async () => {
    const { instanceKey, instancesNodeKey, imodelKey } = createNodeKey("0x1");
    const { nodeId: nodeId, node: node } = createHierarchyNodeWithKey(instancesNodeKey, "root-1");
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).toHaveLength(1);
      expect(treeRenderProps!.isNodeSelected(nodeId)).toBe(false);
    });

    act(() => {
      storage.addToSelection({ imodelKey, source: sourceName, selectables: [instanceKey] });
    });

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)!.isNodeSelected(nodeId)).toBe(true);
    });
  });
});
