/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator, ResolvablePromise, throwingAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { BeEvent } from "@itwin/core-bentley";
import { createHierarchyProvider, HierarchyNodeKey, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { createStorage, Selectables } from "@itwin/unified-selection";
import { createNodeId } from "../presentation-hierarchies-react/internal/Utils.js";
import { useTree, useUnifiedSelectionTree } from "../presentation-hierarchies-react/UseTree.js";
import {
  act,
  cleanup,
  createHierarchyProviderStub,
  createStub,
  createTestGroupingNode,
  createTestHierarchyNode,
  getTreeRendererProps,
  renderHook,
  waitFor,
} from "./TestUtils.js";

import type {
  GenericInstanceFilter,
  GenericNodeKey,
  HierarchyNodeIdentifiersPath,
  HierarchyProvider,
  HierarchySearchPath,
  InstancesNodeKey,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import type { IPrimitiveValueFormatter, Props } from "@itwin/presentation-shared";
import type { Selectable, SelectionStorage, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "@itwin/unified-selection";
import type { TreeNode } from "../presentation-hierarchies-react/TreeNode.js";
import type { StubbedHierarchyProvider } from "./TestUtils.js";

describe("useTree", () => {
  let hierarchyProvider: StubbedHierarchyProvider;
  const onHierarchyLoadErrorStub = sinon.stub();

  type UseTreeProps = Props<typeof useTree>;
  const initialProps: UseTreeProps = {
    getHierarchyProvider: () => hierarchyProvider,
    onHierarchyLoadError: onHierarchyLoadErrorStub,
  };

  beforeEach(() => {
    hierarchyProvider = createHierarchyProviderStub();
    onHierarchyLoadErrorStub.reset();
  });

  it("disposes hierarchy provider on unmount", async () => {
    hierarchyProvider.getNodes.callsFake((props) => createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []));
    const { result, unmount } = renderHook(useTree, { initialProps });
    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
    });
    unmount();
    await waitFor(() => {
      expect(hierarchyProvider[Symbol.dispose]).to.be.called;
    });
  });

  it("unsubscribes from hierarchy changes on unmount", async () => {
    const hierarchyChanged = new BeEvent();
    hierarchyProvider.hierarchyChanged = hierarchyChanged;
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));

    const { result, unmount } = renderHook(useTree, { initialProps });
    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.not.be.undefined;
    });
    expect(hierarchyChanged.numberOfListeners).to.not.eq(0);
    unmount();
    await waitFor(() => {
      expect(hierarchyChanged.numberOfListeners).to.eq(0);
    });
  });

  it("loads root nodes", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })] : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(2);
    });
  });

  it("loads root nodes with minimal provider setup", async () => {
    const customHierarchyProvider = createHierarchyProvider(() => ({
      async *getNodes({}) {
        yield createTestHierarchyNode({ id: "root-1" });
      },
    }));

    const customProps: UseTreeProps = {
      getHierarchyProvider: () => customHierarchyProvider,
    };

    const { result } = renderHook(useTree, { initialProps: customProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
    });
  });

  it("loads searched nodes paths", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const paths: HierarchyNodeIdentifiersPath[] = [[{ id: "0x1", className: "Schema:Class" }]];
    const promise = new ResolvablePromise<HierarchyNodeIdentifiersPath[]>();
    const getSearchPaths = async () => promise;

    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.undefined;
    });

    await act(async () => {
      await promise.resolve(paths);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.not.undefined;
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(hierarchyProvider.setHierarchySearch).to.be.calledWith({ paths });
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

    const promise = new ResolvablePromise<HierarchyNodeIdentifiersPath[]>();
    const { result, rerender } = renderHook(useTree, {
      initialProps: { getHierarchyProvider: () => customHierarchyProvider, getSearchPaths: () => promise },
    });
    await waitFor(() => {
      expect(getNodesCallCount).to.eq(0);
      expect(result.current.isReloading).to.be.true;
    });
    await waitFor(async () => {
      await promise.resolve([]);
      expect(getNodesCallCount).to.eq(1);
      expect(result.current.isReloading).to.be.false;
    });
    let treeRenderProps = getTreeRendererProps(result.current);
    expect(treeRenderProps?.rootNodes).to.have.lengthOf(2);

    rerender({ getHierarchyProvider: () => customHierarchyProvider, getSearchPaths: () => promise });
    await waitFor(() => {
      expect(getNodesCallCount).to.eq(1);
      expect(result.current.isReloading).to.be.true;
    });

    await waitFor(async () => {
      await promise.resolve([]);
      expect(result.current.isReloading).to.be.false;
    });
    treeRenderProps = getTreeRendererProps(result.current);
    expect(treeRenderProps?.rootNodes).to.have.lengthOf(1);
  });

  it("aborts search nodes paths loading on useTree cleanup", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const promise = new ResolvablePromise<HierarchyNodeIdentifiersPath[]>();
    let signal: AbortSignal | undefined;
    const getSearchPaths = async ({ abortSignal }: { abortSignal: AbortSignal }) => {
      signal = abortSignal;
      return promise;
    };

    const { result, unmount } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths } });

    await waitFor(() => {
      expect(result.current.isReloading).to.be.true;
    });
    unmount();
    await waitFor(() => {
      expect(signal?.aborted).to.be.true;
    });
  });

  it("loads default hierarchy when `getSearchPaths` returns `undefined`", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const promise = new ResolvablePromise<HierarchySearchPath[] | undefined>();
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
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(hierarchyProvider.setHierarchySearch).to.be.calledWith(undefined);
    });
  });

  it("loads hierarchy using latest search paths", async () => {
    const paths1: HierarchyNodeIdentifiersPath[] = [[{ id: "0x1", className: "Schema:Class" }]];
    const paths2: HierarchyNodeIdentifiersPath[] = [[{ id: "0x2", className: "Schema:Class" }]];

    const rootNode1 = createTestHierarchyNode({ id: "root-1" });
    const rootNode2 = createTestHierarchyNode({ id: "root-2" });

    hierarchyProvider.getNodes.callsFake(() => {
      const activePaths = hierarchyProvider.setHierarchySearch.lastCall.args[0]?.paths;
      if (activePaths === paths1) {
        return createAsyncIterator([rootNode1]);
      }
      if (activePaths === paths2) {
        return createAsyncIterator([rootNode2]);
      }
      return createAsyncIterator([]);
    });

    const promise1 = new ResolvablePromise<HierarchyNodeIdentifiersPath[]>();
    const getSearchPaths1 = sinon.stub().callsFake(async () => promise1);

    const { result, rerender } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths: getSearchPaths1 } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.undefined;
      expect(getSearchPaths1).to.be.called;
      expect(hierarchyProvider.setHierarchySearch).to.not.be.called;
    });

    const promise2 = new ResolvablePromise<HierarchyNodeIdentifiersPath[]>();
    const getSearchPaths2 = sinon.stub().callsFake(async () => promise2);

    rerender({ ...initialProps, getSearchPaths: getSearchPaths2 });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps).to.be.undefined;
      expect(getSearchPaths2).to.be.called;
      expect(hierarchyProvider.setHierarchySearch).to.not.be.called;
    });

    await act(async () => {
      await promise2.resolve(paths2);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].id).to.be.eq(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchySearch).to.be.calledWith({ paths: paths2 });
    });

    await act(async () => {
      await promise1.resolve(paths1);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].id).to.be.eq(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchySearch).to.not.be.calledWith({ paths: paths1 });
    });
  });

  it("does not persist tree state when hierarchy is search", async () => {
    const rootNodes1 = [createTestHierarchyNode({ id: "root-1", autoExpand: true, children: true })];
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes1);
      }
      return createAsyncIterator([createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })]);
    });

    const { result, rerender } = renderHook(useTree, { initialProps: { ...initialProps } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      const rootNode = treeRenderProps!.rootNodes[0];
      expect(rootNode.id).to.be.eq(createNodeId(rootNodes1[0]));
      expect(rootNode.isExpanded).to.be.true;
      expect(rootNode.children).to.have.lengthOf(2);
    });

    const rootNodes2 = [createTestHierarchyNode({ id: "root-2", autoExpand: false, children: true })];
    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes2);
      }
      return createAsyncIterator([createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })]);
    });

    rerender({ ...initialProps, getSearchPaths: async () => [] });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      const rootNode = treeRenderProps!.rootNodes[0];
      expect(rootNode.id).to.be.eq(createNodeId(rootNodes2[0]));
      expect(rootNode.isExpanded).to.be.false;
      expect(rootNode.children).to.be.true;
    });
  });

  it("ignores error during search paths loading", async () => {
    hierarchyProvider.getNodes.callsFake(() => {
      return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
    });
    const getSearchPaths = async () => {
      throw new Error("test error");
    };
    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getSearchPaths } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(hierarchyProvider.setHierarchySearch).to.be.calledWith(undefined);
    });
  });

  it("`getNode` returns node when `nodeId` refers to a hierarchy node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(result.current.getNode(createNodeId(rootNodes[0]))).to.containSubset({
        id: createNodeId(rootNodes[0]),
        nodeData: rootNodes[0],
      });
    });
  });

  it("`getNode` returns undefined when `nodeId` refers to non existing node", async () => {
    hierarchyProvider.getNodes.callsFake(() => {
      return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(result.current.getNode("test-id")).to.be.undefined;
    });
  });

  it("expands node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.be.true;
    });

    act(() => {
      getTreeRendererProps(result.current)!.expandNode(createNodeId(rootNodes[0]), true);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(1);
    });
  });

  it("selects node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.isNodeSelected(createNodeId(rootNodes[0]))).to.be.false;
    });

    act(() => {
      getTreeRendererProps(result.current)!.selectNodes([createNodeId(rootNodes[0])], "add");
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.isNodeSelected(createNodeId(rootNodes[0]))).to.be.true;
    });
  });

  it("sets hierarchy limit", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(result.current.rootErrorRendererProps!.error.type).to.be.eq("ResultSetTooLarge");
    });

    act(() => {
      result.current.rootErrorRendererProps!.getHierarchyLevelDetails(undefined)?.setSizeLimit(50);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(2);
    });
  });

  it("applies and removes instance filter on tree root", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(props.instanceFilter === undefined ? rootNodes : rootNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(2);
    });

    const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      treeRenderProps!.getHierarchyLevelDetails(undefined)!.setInstanceFilter(filter);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
    });

    act(() => {
      getTreeRendererProps(result.current)!.getHierarchyLevelDetails(undefined)?.setInstanceFilter(undefined);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(2);
    });
  });

  it("applies and removes instance filter", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", autoExpand: true, supportsFiltering: true, children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(2);
    });

    const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      getTreeRendererProps(result.current)!.getHierarchyLevelDetails(createNodeId(rootNodes[0]))?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(1);
    });

    act(() => {
      getTreeRendererProps(result.current)!.getHierarchyLevelDetails(createNodeId(rootNodes[0]))!.setInstanceFilter(undefined);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(2);
    });
  });

  it("applies instance filter on grouping node parent", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", autoExpand: true, children: true, supportsFiltering: true })];
    const groupingNode = createTestGroupingNode({
      id: "grouping-node",
      key: { type: "class-grouping", className: "Schema:Class" },
      nonGroupingAncestor: rootNodes[0],
      autoExpand: true,
    });
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(1);
      const groupingTreeNode = (treeRenderProps!.rootNodes[0] as any).children[0] as TreeNode;
      expect(groupingTreeNode.children).to.have.lengthOf(2);
    });

    const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      getTreeRendererProps(result.current)!.getHierarchyLevelDetails(createNodeId(rootNodes[0]))!.setInstanceFilter(filter);
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(1);
      const groupingTreeNode = (treeRenderProps?.rootNodes[0] as any).children[0] as TreeNode;
      expect(groupingTreeNode.children).to.have.lengthOf(1);
    });
  });

  it("handles empty nodes list after applying instance filter", async () => {
    const rootNode = createTestHierarchyNode({ id: "root-1" });
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(props.instanceFilter === undefined ? [rootNode] : []);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].id).to.eq(createNodeId(rootNode));
    });

    const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };
    act(() => {
      getTreeRendererProps(result.current)!.getHierarchyLevelDetails(undefined)!.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).to.not.be.undefined;
      expect(result.current.rootErrorRendererProps!.error.type).to.eq("NoFilterMatches");
    });
  });

  it("`getHierarchyLevelDetails` returns undefined for invalid node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)!.rootNodes).to.have.lengthOf(1);
    });

    const details = getTreeRendererProps(result.current)!.getHierarchyLevelDetails("invalid");
    expect(details).to.be.undefined;
  });

  it("`getHierarchyLevelDetails` returns undefined for grouping node", async () => {
    const rootNodes = [createTestGroupingNode({ id: "grouping-node", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "grouped-node-1" }), createTestHierarchyNode({ id: "grouped-node-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(2);
    });

    const details = getTreeRendererProps(result.current)!.getHierarchyLevelDetails(nodeId);
    expect(details).to.be.undefined;
  });

  it("`getHierarchyLevelDetails` returns options for hierarchy node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => createAsyncIterator(props.parentNode === undefined ? rootNodes : []));
    hierarchyProvider.getNodeInstanceKeys.callsFake(() =>
      createAsyncIterator([
        { id: "0x1", className: "Schema:Class" },
        { id: "0x2", className: "Schema:Class" },
      ]),
    );
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)?.rootNodes).to.have.lengthOf(1);
    });

    const details = getTreeRendererProps(result.current)!.getHierarchyLevelDetails(nodeId);
    expect(details).to.not.be.undefined;
    expect(details!.hierarchyNode).to.be.eq(rootNodes[0]);
    const filter = { rules: { rules: [], operator: "and" }, propertyClassNames: [], relatedInstances: [] } satisfies GenericInstanceFilter;
    const keys = await collect(details?.getInstanceKeysIterator({ instanceFilter: filter, hierarchyLevelSizeLimit: 100 }) ?? []);
    expect(keys).to.have.lengthOf(2);
    expect(hierarchyProvider.getNodeInstanceKeys).to.be.calledWith(
      sinon.match((props: Props<typeof hierarchyProvider.getNodeInstanceKeys>) => props.instanceFilter === filter && props.hierarchyLevelSizeLimit === 100),
    );
  });

  it("reloads tree when `reloadTree` is called", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes.slice(0, 1));
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(1);
    });

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(2);
    });
  });

  it("reports nodes load performance", async () => {
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const onPerformanceMeasuredSpy = sinon.spy();
    const { result } = renderHook(useTree, { initialProps: { ...initialProps, onPerformanceMeasured: onPerformanceMeasuredSpy } });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.deep.eq([]);
      expect(onPerformanceMeasuredSpy).to.be.calledWith("initial-load", sinon.match.number);
    });
  });

  it("reports when hierarchy level size exceeds limit", async () => {
    hierarchyProvider.getNodes.callsFake(() => {
      return throwingAsyncIterator(new RowsLimitExceededError(555));
    });
    const onHierarchyLimitExceededSpy = sinon.spy();
    const { result } = renderHook(useTree, { initialProps: { ...initialProps, onHierarchyLimitExceeded: onHierarchyLimitExceededSpy } });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).to.not.be.undefined;
      const errorInfo = result.current.rootErrorRendererProps?.error;
      expect(errorInfo!.type).to.be.eq("ResultSetTooLarge");
      expect(onHierarchyLimitExceededSpy).to.be.calledWith({ parentId: undefined, filter: undefined, limit: 555 });
    });
  });

  it("handles error during nodes load", async () => {
    const error = new Error("test error");
    hierarchyProvider.getNodes.callsFake(() => {
      return throwingAsyncIterator(error);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).to.not.be.undefined;
      const errorInfo = result.current.rootErrorRendererProps?.error;
      expect(errorInfo!.type).to.be.eq("ChildrenLoad");
      expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: undefined, type: "unknown", error });
    });
  });

  it("handles timeouts during nodes load", async () => {
    const error = new Error("query too long to execute or server is too busy");
    hierarchyProvider.getNodes.callsFake(() => {
      return throwingAsyncIterator(error);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootErrorRendererProps).to.not.be.undefined;
      const errorInfo = result.current.rootErrorRendererProps?.error;
      expect(errorInfo!.type).to.be.eq("ChildrenLoad");
      expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: undefined, type: "timeout", error });
    });
  });

  it("sets formatter initially to `undefined` and allows overriding it", async () => {
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]));
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)!.rootNodes).to.have.lengthOf(1);
    });
    expect(hierarchyProvider.setFormatter).to.be.calledWith(undefined);

    const formatter = {} as IPrimitiveValueFormatter;
    act(() => {
      result.current.setFormatter(formatter);
    });

    await waitFor(() => {
      expect(hierarchyProvider.setFormatter).to.be.calledWith(formatter);
    });
  });

  it("reloads tree when `getHierarchyProvider` changes", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });
    const { rerender, result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(2);
    });

    const newProvider = createHierarchyProviderStub({
      getNodes: createStub<HierarchyProvider["getNodes"]>().callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootNodes);
        }
        return createAsyncIterator(childNodes.slice(0, 1));
      }),
    });
    rerender({ ...initialProps, getHierarchyProvider: () => newProvider as unknown as HierarchyProvider });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(1);
    });
  });

  it("reloads sub tree when `reloadTree` is called with parent id", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return throwingAsyncIterator(new Error("test error"));
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].error).to.not.be.undefined;
      expect(treeRenderProps!.rootNodes[0].error!.type).to.be.eq("ChildrenLoad");
    });

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.rootNodes[0].children).to.have.lengthOf(2);
      const children = treeRenderProps!.rootNodes[0].children;
      expect(children).to.containSubset(childNodes.map((n) => ({ id: createNodeId(n) })));
    });
  });

  it("reloads tree when hierarchy provider raises `hierarchyChanged` event", async () => {
    const nodeBefore = createTestHierarchyNode({ id: "root-before" });
    const nodeAfter = createTestHierarchyNode({ id: "root-after" });

    hierarchyProvider.getNodes.callsFake(({ parentNode }) => {
      if (!parentNode) {
        return createAsyncIterator([nodeBefore]);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes)
        .to.have.lengthOf(1)
        .and.containSubset([{ id: createNodeId(nodeBefore) }]);
    });

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake(({ parentNode }) => {
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
      expect(treeRenderProps!.rootNodes)
        .to.have.lengthOf(1)
        .and.containSubset([{ id: createNodeId(nodeAfter) }]);
    });
  });
});

describe("useUnifiedSelectionTree", () => {
  let storage: SelectionStorage;
  const sourceName = "test-source";
  const changeListener = createStub<StorageSelectionChangesListener>();
  const hierarchyProvider = createHierarchyProviderStub();
  let initialProps: Props<typeof useUnifiedSelectionTree>;

  function createNodeKey(id: string) {
    const imodelKey = "test-imodel-key";
    const instanceKey = { id, className: "Schema:Class", imodelKey };
    const instancesNodeKey: InstancesNodeKey = {
      type: "instances",
      instanceKeys: [instanceKey],
    };
    return { instanceKey, instancesNodeKey, imodelKey };
  }

  function createHierarchyNodeWithKey(key: NonGroupingHierarchyNode["key"], name: string, children = false) {
    const node = createTestHierarchyNode({ id: name, key, autoExpand: true, children });
    const nodeId = createNodeId(node);
    return { nodeId, node };
  }

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
    changeListener.reset();
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
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      getTreeRendererProps(result.current)!.selectNodes([nodeId], "add");
    });

    await waitFor(() => {
      expect(changeListener).to.be.calledOnceWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "add" &&
            args.imodelKey === imodelKey &&
            args.source === sourceName &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      expect(getTreeRendererProps(result.current)!.isNodeSelected(nodeId)).to.be.true;
    });
  });

  it("adds custom selectable to unified selection", async () => {
    const nodeKey: GenericNodeKey = { type: "generic", id: "test-node" };
    const { nodeId: nodeId, node: node } = createHierarchyNodeWithKey(nodeKey, "root-1");
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const testSelectable: Selectable = {
      identifier: "test-selectable",
      data: {},
      async *loadInstanceKeys() {},
    };

    const { result } = renderHook(useUnifiedSelectionTree, {
      initialProps: {
        ...initialProps,
        createSelectableForGenericNode: () => testSelectable,
      },
    });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      getTreeRendererProps(result.current)!.selectNodes([nodeId], "add");
    });

    await waitFor(() => {
      expect(changeListener).to.be.calledOnceWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "add" &&
            args.source === sourceName &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, testSelectable)
          );
        }),
      );

      expect(getTreeRendererProps(result.current)!.isNodeSelected(nodeId)).to.be.true;
    });
  });

  it("reacts to unified selection changes", async () => {
    const { instanceKey, instancesNodeKey, imodelKey } = createNodeKey("0x1");
    const { nodeId: nodeId, node: node } = createHierarchyNodeWithKey(instancesNodeKey, "root-1");
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps });

    await waitFor(() => {
      const treeRenderProps = getTreeRendererProps(result.current);
      expect(treeRenderProps!.rootNodes).to.have.lengthOf(1);
      expect(treeRenderProps!.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      storage.addToSelection({ imodelKey, source: sourceName, selectables: [instanceKey] });
    });

    await waitFor(() => {
      expect(getTreeRendererProps(result.current)!.isNodeSelected(nodeId)).to.be.true;
    });
  });
});
