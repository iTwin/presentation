/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator, ResolvablePromise, throwingAsyncIterator } from "presentation-test-utilities";
import { PropsWithChildren } from "react";
import sinon from "sinon";
import { BeEvent } from "@itwin/core-bentley";
import * as hierarchiesModule from "@itwin/presentation-hierarchies";
import { IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { createStorage, Selectables, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "@itwin/unified-selection";
import { createNodeId } from "../presentation-hierarchies-react/internal/Utils";
import {
  PresentationGenericInfoNode,
  PresentationHierarchyNode,
  PresentationInfoNode,
  PresentationNoFilterMatchesInfoNode,
  PresentationTreeNode,
} from "../presentation-hierarchies-react/TreeNode";
import { UnifiedSelectionProvider } from "../presentation-hierarchies-react/UnifiedSelectionContext";
import { useTree, useUnifiedSelectionTree } from "../presentation-hierarchies-react/UseTree";
import { act, cleanup, createStub, createTestGroupingNode, createTestHierarchyNode, renderHook, waitFor } from "./TestUtils";

type IModelHierarchyProvider = ReturnType<typeof hierarchiesModule.createIModelHierarchyProvider>;

describe("useTree", () => {
  const hierarchyProvider = {
    getNodes: createStub<hierarchiesModule.HierarchyProvider["getNodes"]>(),
    getNodeInstanceKeys: createStub<hierarchiesModule.HierarchyProvider["getNodeInstanceKeys"]>(),
    setFormatter: createStub<hierarchiesModule.HierarchyProvider["setFormatter"]>(),
    setHierarchyFilter: createStub<hierarchiesModule.HierarchyProvider["setHierarchyFilter"]>(),
    dispose: createStub<() => void>(),
  };
  let createIModelHierarchyProviderStub: sinon.SinonStub<
    Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>,
    ReturnType<typeof hierarchiesModule.createIModelHierarchyProvider>
  >;
  const onHierarchyLoadErrorStub = sinon.stub();

  type UseTreeProps = Parameters<typeof useTree>[0];
  type FilteredPaths = ReturnType<Required<UseTreeProps>["getFilteredPaths"]>;
  const initialProps: UseTreeProps = {
    imodelAccess: {} as UseTreeProps["imodelAccess"],
    getHierarchyDefinition: () => ({}) as hierarchiesModule.HierarchyDefinition,
    onHierarchyLoadError: onHierarchyLoadErrorStub,
  };

  before(() => {
    createIModelHierarchyProviderStub = sinon.stub(hierarchiesModule, "createIModelHierarchyProvider");
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodeInstanceKeys.reset();
    hierarchyProvider.setFormatter.reset();
    hierarchyProvider.setHierarchyFilter.reset();
    hierarchyProvider.dispose.reset();
    onHierarchyLoadErrorStub.reset();
    createIModelHierarchyProviderStub.reset();
    createIModelHierarchyProviderStub.returns(hierarchyProvider);
  });

  it("disposes hierarchy provider on unmount", async () => {
    hierarchyProvider.getNodes.callsFake((props) => createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []));
    const { result, unmount } = renderHook(useTree, { initialProps });
    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });
    unmount();
    await waitFor(() => {
      expect(hierarchyProvider.dispose).to.be.called;
    });
  });

  it("loads root nodes", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })] : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });
  });

  it("loads filtered nodes paths", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const paths: hierarchiesModule.HierarchyNodeIdentifiersPath[] = [[{ id: "0x1", className: "Schema:Class" }]];
    const promise = new ResolvablePromise<hierarchiesModule.HierarchyNodeIdentifiersPath[]>();
    const getFilteredPaths = async () => promise;

    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths } });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.true;
    });

    await act(async () => {
      await promise.resolve(paths);
    });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(hierarchyProvider.setHierarchyFilter).to.be.calledWith({ paths });
    });
  });

  it("loads unfiltered hierarchy when `getFilteredPaths` returns `undefined`", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" })] : []);
    });

    const promise = new ResolvablePromise<FilteredPaths | undefined>();
    const getFilteredPaths = async () => promise;

    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths } });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.true;
    });

    await act(async () => {
      await promise.resolve(undefined);
    });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(hierarchyProvider.setHierarchyFilter).to.be.calledWith(undefined);
    });
  });

  it("loads hierarchy using latest filtered paths", async () => {
    const paths1: hierarchiesModule.HierarchyNodeIdentifiersPath[] = [[{ id: "0x1", className: "Schema:Class" }]];
    const paths2: hierarchiesModule.HierarchyNodeIdentifiersPath[] = [[{ id: "0x2", className: "Schema:Class" }]];

    const rootNode1 = createTestHierarchyNode({ id: "root-1" });
    const rootNode2 = createTestHierarchyNode({ id: "root-2" });

    hierarchyProvider.getNodes.callsFake(() => {
      const activePaths = hierarchyProvider.setHierarchyFilter.lastCall?.args[0]?.paths;
      if (activePaths === paths1) {
        return createAsyncIterator([rootNode1]);
      }
      if (activePaths === paths2) {
        return createAsyncIterator([rootNode2]);
      }
      return createAsyncIterator([]);
    });

    const promise1 = new ResolvablePromise<hierarchiesModule.HierarchyNodeIdentifiersPath[]>();
    const getFilteredPaths1 = sinon.stub().callsFake(async () => promise1);

    const { result, rerender } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths: getFilteredPaths1 } });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.true;
      expect(getFilteredPaths1).to.be.called;
      expect(hierarchyProvider.setHierarchyFilter).to.not.be.called;
    });

    const promise2 = new ResolvablePromise<hierarchiesModule.HierarchyNodeIdentifiersPath[]>();
    const getFilteredPaths2 = sinon.stub().callsFake(async () => promise2);

    rerender({ ...initialProps, getFilteredPaths: getFilteredPaths2 });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.true;
      expect(getFilteredPaths2).to.be.called;
      expect(hierarchyProvider.setHierarchyFilter).to.not.be.called;
    });

    await act(async () => {
      await promise2.resolve(paths2);
    });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.rootNodes![0].id).to.be.eq(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchyFilter).to.be.calledWith({ paths: paths2 });
    });

    await act(async () => {
      await promise1.resolve(paths1);
    });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.rootNodes![0].id).to.be.eq(createNodeId(rootNode2));
      expect(hierarchyProvider.setHierarchyFilter).to.not.be.calledWith({ paths: paths1 });
    });
  });

  it("does not persist tree state when hierarchy is filtered", async () => {
    const rootNodes1 = [createTestHierarchyNode({ id: "root-1", autoExpand: true, children: true })];
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes1);
      }
      return createAsyncIterator([createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })]);
    });

    const { result, rerender } = renderHook(useTree, { initialProps: { ...initialProps } });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
      expect(result.current.rootNodes).to.have.lengthOf(1);
      const rootNode = result.current.rootNodes![0] as PresentationHierarchyNode;
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

    rerender({ ...initialProps, getFilteredPaths: async () => [] });

    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
      expect(result.current.rootNodes).to.have.lengthOf(1);
      const rootNode = result.current.rootNodes![0] as PresentationHierarchyNode;
      expect(rootNode.id).to.be.eq(createNodeId(rootNodes2[0]));
      expect(rootNode.isExpanded).to.be.false;
      expect(rootNode.children).to.be.true;
    });
  });

  it("ignores error during filtered paths loading", async () => {
    hierarchyProvider.getNodes.callsFake(() => {
      return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
    });
    const getFilteredPaths = async () => {
      throw new Error("test error");
    };
    const { result } = renderHook(useTree, { initialProps: { ...initialProps, getFilteredPaths } });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(createIModelHierarchyProviderStub).to.be.calledWith(
        sinon.match((props: Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>[0]) => props.filtering === undefined),
      );
    });
  });

  it("expands node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.be.true;
    });

    act(() => {
      result.current.expandNode(createNodeId(rootNodes[0]), true);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });
  });

  it("selects node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(createNodeId(rootNodes[0]))).to.be.false;
    });

    act(() => {
      result.current.selectNodes([createNodeId(rootNodes[0])], "add");
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(createNodeId(rootNodes[0]))).to.be.true;
    });
  });

  it("sets hierarchy limit", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationInfoNode).type).to.be.eq("ResultSetTooLarge");
    });

    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setSizeLimit(50);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
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
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });

    const filter: hierarchiesModule.GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setInstanceFilter(undefined);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });
  });

  it("applies and removes instance filter", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", autoExpand: true, supportsFiltering: true, children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const filter: hierarchiesModule.GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      result.current.getHierarchyLevelDetails(createNodeId(rootNodes[0]))?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });

    act(() => {
      result.current.getHierarchyLevelDetails(createNodeId(rootNodes[0]))?.setInstanceFilter(undefined);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
      const groupingTreeNode = (result.current.rootNodes![0] as any).children[0] as PresentationHierarchyNode;
      expect(groupingTreeNode.children).to.have.lengthOf(2);
    });

    const filter: hierarchiesModule.GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      result.current.getHierarchyLevelDetails(createNodeId(rootNodes[0]))?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
      const groupingTreeNode = (result.current.rootNodes![0] as any).children[0] as PresentationHierarchyNode;
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.rootNodes![0].id).to.eq(createNodeId(rootNode));
    });

    const filter: hierarchiesModule.GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };
    act(() => {
      result.current.getHierarchyLevelDetails(undefined)?.setInstanceFilter(filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationNoFilterMatchesInfoNode).type).to.eq("NoFilterMatches");
    });
  });

  it("`getHierarchyLevelDetails` returns undefined for invalid node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const details = result.current.getHierarchyLevelDetails("invalid");
    expect(details).to.be.undefined;
  });

  it("`getHierarchyLevelDetails` returns undefined for grouping node", async () => {
    const rootNodes = [createTestGroupingNode({ id: "grouping-node", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "grouped-node-1" }), createTestHierarchyNode({ id: "grouped-node-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const details = result.current.getHierarchyLevelDetails(nodeId);
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const details = result.current.getHierarchyLevelDetails(nodeId);
    expect(details).to.not.be.undefined;
    expect(details?.hierarchyNode).to.be.eq(rootNodes[0]);
    const filter = { rules: { rules: [], operator: "and" }, propertyClassNames: [], relatedInstances: [] } satisfies hierarchiesModule.GenericInstanceFilter;
    const keys = await collect(details?.getInstanceKeysIterator({ instanceFilter: filter, hierarchyLevelSizeLimit: 100 }) ?? []);
    expect(keys).to.have.lengthOf(2);
    expect(hierarchyProvider.getNodeInstanceKeys).to.be.calledWith(
      sinon.match(
        (props: Parameters<typeof hierarchyProvider.getNodeInstanceKeys>[0]) => props.instanceFilter === filter && props.hierarchyLevelSizeLimit === 100,
      ),
    );
  });

  it("reloads tree when `reloadTree` is called", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake((props) => {
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });
  });

  it("notifies hierarchy provider about changed data source when `reloadTree` is called with `dataSourceChanged`", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: false })];
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(createIModelHierarchyProviderStub).to.be.calledWith(sinon.match((props) => props.imodelChanged !== undefined));
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const imodelChangedEvent = createIModelHierarchyProviderStub.args[0][0].imodelChanged as BeEvent<() => void>;
    const imodelChangedSpy = sinon.spy(imodelChangedEvent, "raiseEvent");

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator([...rootNodes, createTestHierarchyNode({ id: "root-2", children: false })]);
      }
      return createAsyncIterator([]);
    });

    act(() => {
      result.current.reloadTree({ dataSourceChanged: true });
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
      expect(imodelChangedSpy).to.be.calledOnce;
    });
  });

  it("handles error during nodes load", async () => {
    hierarchyProvider.getNodes.callsFake(() => {
      return throwingAsyncIterator(new Error("test error"));
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      const node = result.current.rootNodes![0] as PresentationGenericInfoNode;
      expect(node.type).to.be.eq("Unknown");
      expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: undefined, type: "unknown" });
    });
  });

  it("handles timeouts during nodes load", async () => {
    hierarchyProvider.getNodes.callsFake(() => {
      return throwingAsyncIterator(new Error("query too long to execute or server is too busy"));
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      const node = result.current.rootNodes![0] as PresentationGenericInfoNode;
      expect(node.type).to.be.eq("Unknown");
      expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: undefined, type: "timeout" });
    });
  });

  it("sets formatter and recreates hierarchy provider with same formatter", async () => {
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]));
    const { result, rerender } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const formatter = {} as IPrimitiveValueFormatter;
    act(() => {
      result.current.setFormatter(formatter);
    });

    await waitFor(() => {
      expect(hierarchyProvider.setFormatter).to.be.calledOnceWith(formatter);
    });
    createIModelHierarchyProviderStub.resetHistory();

    // cause hierarchy provider to be recreated
    rerender({ ...initialProps, getHierarchyDefinition: () => ({}) as hierarchiesModule.HierarchyDefinition });

    await waitFor(() => {
      expect(createIModelHierarchyProviderStub).to.be.calledOnceWith(
        sinon.match((props: Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>[0]) => props.formatter === formatter),
      );
    });
  });

  it("reloads tree when `getHierarchyDefinition` changes", async () => {
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const newProvider = {
      getNodes: createStub<hierarchiesModule.HierarchyProvider["getNodes"]>(),
      dispose: sinon.stub(),
    };
    newProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes.slice(0, 1));
    });
    createIModelHierarchyProviderStub.reset();
    createIModelHierarchyProviderStub.returns(newProvider as unknown as IModelHierarchyProvider);

    rerender({ ...initialProps, getHierarchyDefinition: () => ({}) as hierarchiesModule.HierarchyDefinition });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
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
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
      const childNode = ((result.current.rootNodes![0] as PresentationHierarchyNode).children as PresentationTreeNode[])[0] as PresentationGenericInfoNode;
      expect(childNode.type).to.be.eq("Unknown");
    });

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator(childNodes);
    });

    act(() => {
      result.current.reloadTree({ parentNodeId: createNodeId(rootNodes[0]) });
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
      const children = (result.current.rootNodes![0] as PresentationHierarchyNode).children as PresentationTreeNode[];
      expect(children).to.containSubset(childNodes.map((n) => ({ id: createNodeId(n) })));
    });
  });
});

describe("useUnifiedSelectionTree", () => {
  const storage = createStorage();
  const imodelKey = "test-key";
  const sourceName = "test-source";
  const changeListener = createStub<StorageSelectionChangesListener>();

  const hierarchyProvider = {
    getNodes: createStub<hierarchiesModule.HierarchyProvider["getNodes"]>(),
    dispose: createStub<() => void>(),
  };
  let createIModelHierarchyProviderStub: sinon.SinonStub<
    Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>,
    ReturnType<typeof hierarchiesModule.createIModelHierarchyProvider>
  >;

  type UseUnifiedSelectionTree = Parameters<typeof useUnifiedSelectionTree>[0];
  const initialProps: UseUnifiedSelectionTree = {
    imodelAccess: {} as UseUnifiedSelectionTree["imodelAccess"],
    getHierarchyDefinition: () => ({}) as hierarchiesModule.HierarchyDefinition,
    imodelKey,
    sourceName,
  };

  function Wrapper(props: PropsWithChildren<{}>) {
    return <UnifiedSelectionProvider storage={storage}>{props.children}</UnifiedSelectionProvider>;
  }

  function createNodeKey(id: string) {
    const instanceKey = { id, className: "Schema:Class" };
    const instancesNodeKey: hierarchiesModule.InstancesNodeKey = {
      type: "instances",
      instanceKeys: [instanceKey],
    };
    return { instanceKey, instancesNodeKey };
  }

  function createHierarchyNodeWithKey(id: string, name: string, children = false) {
    const { instanceKey, instancesNodeKey } = createNodeKey(id);
    const node = createTestHierarchyNode({ id: name, key: instancesNodeKey, autoExpand: true, children });
    const nodeId = createNodeId(node);
    return { nodeId, instanceKey, instancesNodeKey, node };
  }
  before(() => {
    createIModelHierarchyProviderStub = sinon.stub(hierarchiesModule, "createIModelHierarchyProvider");
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
    createIModelHierarchyProviderStub.reset();
    createIModelHierarchyProviderStub.returns(hierarchyProvider as unknown as IModelHierarchyProvider);
    changeListener.reset();
    storage.selectionChangeEvent.addListener(changeListener);
  });

  afterEach(() => {
    cleanup();
    storage.selectionChangeEvent.removeListener(changeListener);
    storage.clearStorage({ imodelKey });
  });

  it("adds nodes to unified selection", async () => {
    const { nodeId: nodeId, instanceKey: instanceKey, node: node } = createHierarchyNodeWithKey("0x1", "root-1");
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps, wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      result.current.selectNodes([nodeId], "add");
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

      expect(result.current.isNodeSelected(nodeId)).to.be.true;
    });
  });

  it("reacts to unified selection changes", async () => {
    const { nodeId: nodeId, instanceKey: instanceKey, node: node } = createHierarchyNodeWithKey("0x1", "root-1");
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps, wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      storage.addToSelection({ imodelKey, source: sourceName, selectables: [instanceKey] });
    });

    await waitFor(() => {
      expect(result.current.isNodeSelected(nodeId)).to.be.true;
    });
  });
});
