/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator, ResolvablePromise, throwingAsyncIterator } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeEvent } from "@itwin/core-bentley";
import * as hierarchiesModule from "@itwin/presentation-hierarchies";
import { IPrimitiveValueFormatter, Props } from "@itwin/presentation-shared";
import {
  createStorage,
  Selectable,
  Selectables,
  SelectionStorage,
  StorageSelectionChangesListener,
} from "@itwin/unified-selection";
import { createNodeId } from "../presentation-hierarchies-react/internal/Utils.js";
import {
  PresentationGenericInfoNode,
  PresentationHierarchyNode,
  PresentationInfoNode,
  PresentationNoFilterMatchesInfoNode,
  PresentationResultSetTooLargeInfoNode,
  PresentationTreeNode,
} from "../presentation-hierarchies-react/TreeNode.js";
import { useTree, useUnifiedSelectionTree } from "../presentation-hierarchies-react/UseTree.js";
import {
  act,
  cleanup,
  createHierarchyProviderStub,
  createTestGroupingNode,
  createTestHierarchyNode,
  renderHook,
  StubbedHierarchyProvider,
  waitFor,
} from "./TestUtils.js";

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
      expect(result.current.rootNodes).toHaveLength(1);
    });
    unmount();
    await waitFor(() => {
      expect(hierarchyProvider[Symbol.dispose]).toHaveBeenCalled();
    });
  });

  it("unsubscribes from hierarchy changes on unmount", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
    const { result, unmount } = renderHook(useTree, { initialProps });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(hierarchyProvider.hierarchyChanged.numberOfListeners).not.toBe(0);
    unmount();
    await waitFor(() => {
      expect(hierarchyProvider.hierarchyChanged.numberOfListeners).toBe(0);
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
      expect(result.current.rootNodes).toHaveLength(2);
    });
  });

  it("loads root nodes with minimal provider setup", async () => {
    const hierarchyChanged = new BeEvent();
    const customHierarchyProvider: hierarchiesModule.HierarchyProvider = {
      async *getNodes({}) {
        yield createTestHierarchyNode({ id: "root-1" });
      },
      setHierarchyFilter() {},
      async *getNodeInstanceKeys() {},
      setFormatter() {},
      hierarchyChanged,
    };

    const customProps: UseTreeProps = { getHierarchyProvider: () => customHierarchyProvider };

    const { result } = renderHook(useTree, { initialProps: customProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
    });
  });

  it("loads filtered nodes paths", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const paths: hierarchiesModule.HierarchyNodeIdentifiersPath[] = [[{ id: "0x1", className: "Schema:Class" }]];
    const promise = new ResolvablePromise<hierarchiesModule.HierarchyNodeIdentifiersPath[]>();
    const getFilteredPaths = async () => promise;

    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths } });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      await promise.resolve(paths);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.rootNodes).toHaveLength(1);
      expect(hierarchyProvider.setHierarchyFilter).toHaveBeenCalledWith({ paths });
    });
  });

  it("aborts filtered nodes paths loading on useTree cleanup", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const promise = new ResolvablePromise<hierarchiesModule.HierarchyNodeIdentifiersPath[]>();
    let signal: AbortSignal | undefined;
    const getFilteredPaths = async ({ abortSignal }: { abortSignal: AbortSignal }) => {
      signal = abortSignal;
      return promise;
    };

    const { result, unmount } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths } });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
    unmount();
    await waitFor(() => {
      expect(signal?.aborted).toBe(true);
    });
  });

  it("loads unfiltered hierarchy when `getFilteredPaths` returns `undefined`", async () => {
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const promise = new ResolvablePromise<hierarchiesModule.HierarchyFilteringPath[] | undefined>();
    const getFilteredPaths = async () => promise;

    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths } });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      await promise.resolve(undefined);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.rootNodes).toHaveLength(1);
      expect(hierarchyProvider.setHierarchyFilter).toHaveBeenCalledWith(undefined);
    });
  });

  it("loads hierarchy using latest filtered paths", async () => {
    const paths1: hierarchiesModule.HierarchyNodeIdentifiersPath[] = [[{ id: "0x1", className: "Schema:Class" }]];
    const paths2: hierarchiesModule.HierarchyNodeIdentifiersPath[] = [[{ id: "0x2", className: "Schema:Class" }]];

    const rootNode1 = createTestHierarchyNode({ id: "root-1" });
    const rootNode2 = createTestHierarchyNode({ id: "root-2" });

    hierarchyProvider.getNodes.mockImplementation(() => {
      const activePaths = hierarchyProvider.setHierarchyFilter.mock.lastCall?.[0]?.paths;
      if (activePaths === paths1) {
        return createAsyncIterator([rootNode1]);
      }
      if (activePaths === paths2) {
        return createAsyncIterator([rootNode2]);
      }
      return createAsyncIterator([]);
    });

    const promise1 = new ResolvablePromise<hierarchiesModule.HierarchyNodeIdentifiersPath[]>();
    const getFilteredPaths1 = vi.fn().mockImplementation(async () => promise1);

    const { result, rerender } = renderHook(useTree, {
      initialProps: { ...initialProps, getFilteredPaths: getFilteredPaths1 },
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
      expect(getFilteredPaths1).toHaveBeenCalled();
      expect(hierarchyProvider.setHierarchyFilter).not.toHaveBeenCalled();
    });

    const promise2 = new ResolvablePromise<hierarchiesModule.HierarchyNodeIdentifiersPath[]>();
    const getFilteredPaths2 = vi.fn().mockImplementation(async () => promise2);

    rerender({ ...initialProps, getFilteredPaths: getFilteredPaths2 });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
      expect(getFilteredPaths2).toHaveBeenCalled();
      expect(hierarchyProvider.setHierarchyFilter).not.toHaveBeenCalled();
    });

    await act(async () => {
      await promise2.resolve(paths2);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.rootNodes![0].id).toBe(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchyFilter).toHaveBeenCalledWith({ paths: paths2 });
    });

    await act(async () => {
      await promise1.resolve(paths1);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.rootNodes![0].id).toBe(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchyFilter).not.toHaveBeenCalledWith({ paths: paths1 });
    });
  });

  it("does not persist tree state when hierarchy is filtered", async () => {
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
      expect(result.current.isLoading).toBe(false);
      expect(result.current.rootNodes).toHaveLength(1);
      const rootNode = result.current.rootNodes![0] as PresentationHierarchyNode;
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

    rerender({ ...initialProps, getFilteredPaths: async () => [] });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.rootNodes).toHaveLength(1);
      const rootNode = result.current.rootNodes![0] as PresentationHierarchyNode;
      expect(rootNode.id).toBe(createNodeId(rootNodes2[0]));
      expect(rootNode.isExpanded).toBe(false);
      expect(rootNode.children).toBe(true);
    });
  });

  it("ignores error during filtered paths loading", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => {
      return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
    });
    const getFilteredPaths = async () => {
      throw new Error("test error");
    };
    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths } });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect(hierarchyProvider.setHierarchyFilter).toHaveBeenCalledWith(undefined);
    });
  });

  it("`getNode` returns node when `nodeId` refers to a hierarchy node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.getNode(createNodeId(rootNodes[0]))).toMatchObject({
        id: createNodeId(rootNodes[0]),
        nodeData: rootNodes[0],
      });
    });
  });

  it("`getNode` returns undefined when `nodeId` refers to a non-hierarchy node", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => {
      return throwingAsyncIterator(new hierarchiesModule.RowsLimitExceededError(1));
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.getNode(result.current.rootNodes![0].id)).toBeUndefined();
    });
  });

  it("expands node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (hierarchiesModule.HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toBe(true);
    });

    act(() => {
      result.current.expandNode(createNodeId(rootNodes[0]), true);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(1);
    });
  });

  it("selects node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.isNodeSelected(createNodeId(rootNodes[0]))).toBe(false);
    });

    act(() => {
      result.current.selectNodes([createNodeId(rootNodes[0])], "add");
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.isNodeSelected(createNodeId(rootNodes[0]))).toBe(true);
    });
  });

  it("sets hierarchy limit", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.hierarchyLevelSizeLimit === undefined) {
        return throwingAsyncIterator(new hierarchiesModule.RowsLimitExceededError(1));
      }
      if (props.parentNode === undefined && props.hierarchyLevelSizeLimit === 50) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationInfoNode).type).toBe("ResultSetTooLarge");
    });

    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setSizeLimit(50);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(2);
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
      expect(result.current.rootNodes).toHaveLength(2);
    });

    const filter: hierarchiesModule.GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };

    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
    });

    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setInstanceFilter(undefined);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(2);
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
      if (hierarchiesModule.HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
        return createAsyncIterator(props.instanceFilter === undefined ? childNodes : childNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(2);
    });

    const filter: hierarchiesModule.GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };

    act(() => {
      result.current.getHierarchyLevelDetails(createNodeId(rootNodes[0]))?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(1);
    });

    act(() => {
      result.current.getHierarchyLevelDetails(createNodeId(rootNodes[0]))?.setInstanceFilter(undefined);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(2);
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
      if (hierarchiesModule.HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
        return createAsyncIterator([groupingNode]);
      }
      if (hierarchiesModule.HierarchyNodeKey.isClassGrouping(props.parentNode.key)) {
        return createAsyncIterator(props.instanceFilter ? childNodes.slice(0, 1) : childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(1);
      const groupingTreeNode = (result.current.rootNodes![0] as any).children[0] as PresentationHierarchyNode;
      expect(groupingTreeNode.children).toHaveLength(2);
    });

    const filter: hierarchiesModule.GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };

    act(() => {
      result.current.getHierarchyLevelDetails(createNodeId(rootNodes[0]))?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(1);
      const groupingTreeNode = (result.current.rootNodes![0] as any).children[0] as PresentationHierarchyNode;
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
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.rootNodes![0].id).toBe(createNodeId(rootNode));
    });

    const filter: hierarchiesModule.GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };
    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationNoFilterMatchesInfoNode).type).toBe("NoFilterMatches");
    });
  });

  it("`getHierarchyLevelDetails` returns undefined for invalid node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
    });

    const details = result.current.getHierarchyLevelDetails("invalid");
    expect(details).toBeUndefined();
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
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(2);
    });

    const details = result.current.getHierarchyLevelDetails(nodeId);
    expect(details).toBeUndefined();
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
      expect(result.current.rootNodes).toHaveLength(1);
    });

    const details = result.current.getHierarchyLevelDetails(nodeId);
    expect(details).toBeDefined();
    expect(details?.hierarchyNode).toBe(rootNodes[0]);
    const filter = {
      rules: { rules: [], operator: "and" },
      propertyClassNames: [],
      relatedInstances: [],
    } satisfies hierarchiesModule.GenericInstanceFilter;
    const keys = await collect(
      details?.getInstanceKeysIterator({ instanceFilter: filter, hierarchyLevelSizeLimit: 100 }) ?? [],
    );
    expect(keys).toHaveLength(2);
    expect(hierarchyProvider.getNodeInstanceKeys).toHaveBeenCalledWith(
      expect.objectContaining({ instanceFilter: filter, hierarchyLevelSizeLimit: 100 }),
    );
  });

  it("reloads tree when `reloadTree` is called", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(1);
    });

    hierarchyProvider.getNodes.mockReset();
    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });

    act(() => {
      result.current.reloadTree();
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(2);
    });
  });

  it("reports nodes load performance", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
    const onPerformanceMeasuredSpy = vi.fn();
    const { result } = renderHook(useTree, {
      initialProps: { ...initialProps, onPerformanceMeasured: onPerformanceMeasuredSpy },
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toEqual([]);
      expect(onPerformanceMeasuredSpy).toHaveBeenCalledWith("initial-load", expect.any(Number));
    });
  });

  it("reports when hierarchy level size exceeds limit", async () => {
    hierarchyProvider.getNodes.mockImplementation(() => {
      return throwingAsyncIterator(new hierarchiesModule.RowsLimitExceededError(555));
    });
    const onHierarchyLimitExceededSpy = vi.fn();
    const { result } = renderHook(useTree, {
      initialProps: { ...initialProps, onHierarchyLimitExceeded: onHierarchyLimitExceededSpy },
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      const node = result.current.rootNodes![0] as PresentationResultSetTooLargeInfoNode;
      expect(node.type).toBe("ResultSetTooLarge");
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
      expect(result.current.rootNodes).toHaveLength(1);
      const node = result.current.rootNodes![0] as PresentationGenericInfoNode;
      expect(node.type).toBe("Unknown");
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
      expect(result.current.rootNodes).toHaveLength(1);
      const node = result.current.rootNodes![0] as PresentationGenericInfoNode;
      expect(node.type).toBe("Unknown");
      expect(onHierarchyLoadErrorStub).toHaveBeenCalledWith({ parentId: undefined, type: "timeout", error });
    });
  });

  it("sets formatter initially to `undefined` and allows overriding it", async () => {
    hierarchyProvider.getNodes.mockImplementation(() =>
      createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]),
    );
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
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
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(2);
    });

    const newProvider = createHierarchyProviderStub({
      getNodes: vi.fn<hierarchiesModule.HierarchyProvider["getNodes"]>().mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootNodes);
        }
        return createAsyncIterator(childNodes.slice(0, 1));
      }),
    });
    rerender({
      ...initialProps,
      getHierarchyProvider: () => newProvider as unknown as hierarchiesModule.HierarchyProvider,
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(1);
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
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(1);
      const childNode = (
        (result.current.rootNodes![0] as PresentationHierarchyNode).children as PresentationTreeNode[]
      )[0] as PresentationGenericInfoNode;
      expect(childNode.type).toBe("Unknown");
    });

    hierarchyProvider.getNodes.mockReset();
    hierarchyProvider.getNodes.mockImplementation((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });

    act(() => {
      result.current.reloadTree({ parentNodeId: createNodeId(rootNodes[0]) });
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).toHaveLength(2);
      const children = (result.current.rootNodes![0] as PresentationHierarchyNode).children as PresentationTreeNode[];
      expect(children).toMatchObject(childNodes.map((n) => ({ id: createNodeId(n) })));
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
      expect(result.current.rootNodes).toMatchObject([{ id: createNodeId(nodeBefore) }]);
    });

    hierarchyProvider.getNodes.mockReset();
    hierarchyProvider.getNodes.mockImplementation(({ parentNode }) => {
      if (!parentNode) {
        return createAsyncIterator([nodeAfter]);
      }
      return createAsyncIterator([]);
    });
    act(() => {
      hierarchyProvider.hierarchyChanged.raiseEvent();
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toMatchObject([{ id: createNodeId(nodeAfter) }]);
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
    const instanceKey = { id, className: "Schema:Class", imodelKey };
    const instancesNodeKey: hierarchiesModule.InstancesNodeKey = { type: "instances", instanceKeys: [instanceKey] };
    return { instanceKey, instancesNodeKey, imodelKey };
  }

  function createHierarchyNodeWithKey(
    key: hierarchiesModule.NonGroupingHierarchyNode["key"],
    name: string,
    children = false,
  ) {
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
      getHierarchyProvider: () => hierarchyProvider as unknown as hierarchiesModule.HierarchyProvider,
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
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.isNodeSelected(nodeId)).toBe(false);
    });

    act(() => {
      result.current.selectNodes([nodeId], "add");
    });

    await waitFor(() => {
      expect(changeListener).toHaveBeenCalledOnce();
      const callArgs = changeListener.mock.calls[0][0];
      expect(callArgs.changeType).toBe("add");
      expect(callArgs.imodelKey).toBe(imodelKey);
      expect(callArgs.source).toBe(sourceName);
      expect(Selectables.size(callArgs.selectables)).toBe(1);
      expect(Selectables.has(callArgs.selectables, instanceKey)).toBe(true);

      expect(result.current.isNodeSelected(nodeId)).toBe(true);
    });
  });

  it("adds custom selectable to unified selection", async () => {
    const nodeKey: hierarchiesModule.GenericNodeKey = { type: "generic", id: "test-node" };
    const { nodeId: nodeId, node: node } = createHierarchyNodeWithKey(nodeKey, "root-1");
    hierarchyProvider.getNodes.mockImplementation((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const testSelectable: Selectable = { identifier: "test-selectable", data: {}, async *loadInstanceKeys() {} };

    const { result } = renderHook(useUnifiedSelectionTree, {
      initialProps: { ...initialProps, createSelectableForGenericNode: () => testSelectable },
    });

    await waitFor(() => {
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.isNodeSelected(nodeId)).toBe(false);
    });

    act(() => {
      result.current.selectNodes([nodeId], "add");
    });

    await waitFor(() => {
      expect(changeListener).toHaveBeenCalledOnce();
      const callArgs = changeListener.mock.calls[0][0];
      expect(callArgs.changeType).toBe("add");
      expect(callArgs.source).toBe(sourceName);
      expect(Selectables.size(callArgs.selectables)).toBe(1);
      expect(Selectables.has(callArgs.selectables, testSelectable)).toBe(true);

      expect(result.current.isNodeSelected(nodeId)).toBe(true);
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
      expect(result.current.rootNodes).toHaveLength(1);
      expect(result.current.isNodeSelected(nodeId)).toBe(false);
    });

    act(() => {
      storage.addToSelection({ imodelKey, source: sourceName, selectables: [instanceKey] });
    });

    await waitFor(() => {
      expect(result.current.isNodeSelected(nodeId)).toBe(true);
    });
  });
});
