/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { TreeModelNode, TreeNodeItem, UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { NodePathElement } from "@itwin/presentation-common";
import {
  useFilteredNodeLoader,
  UseFilteredNodeLoaderProps,
  useNodeHighlightingProps,
} from "../../../presentation-components/tree/controlled/UseControlledTreeFiltering";
import { FilteredPresentationTreeDataProvider } from "../../../presentation-components/tree/FilteredDataProvider";
import { IFilteredPresentationTreeDataProvider, IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider";
import { ResolvablePromise } from "../../_helpers/Promises";
import { createTestPropertyRecord, createTestTreeNodeItem } from "../../_helpers/UiComponents";
import { act, renderHook, waitFor } from "../../TestUtils";

describe("useFilteredNodeLoader", () => {
  const dataProviderMock = moq.Mock.ofType<IPresentationTreeDataProvider>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();

  before(() => {
    sinon.stub(UiComponents, "localization").get(() => new EmptyLocalization());
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    imodelMock.reset();

    dataProviderMock.reset();
    dataProviderMock.setup((x) => x.imodel).returns(() => imodelMock.object);
    dataProviderMock.setup((x) => x.rulesetId).returns(() => "rulesetId");
  });

  it("does not start filtering if filter is not provided", () => {
    const { result } = renderHook(useFilteredNodeLoader, { initialProps: { dataProvider: dataProviderMock.object } });
    expect(result.current.isFiltering).to.be.false;
  });

  it("starts filtering if filter is provided", async () => {
    const pathsResult1 = new ResolvablePromise<NodePathElement[]>();
    dataProviderMock.setup(async (x) => x.getFilteredNodePaths("test")).returns(async () => pathsResult1);

    const { result } = renderHook(useFilteredNodeLoader, {
      initialProps: { dataProvider: dataProviderMock.object, filter: "test", activeMatchIndex: 0 },
    });
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    await act(async () => pathsResult1.resolve([]));

    await waitFor(() => expect(result.current.isFiltering).to.be.false);
  });

  it("does not start new filtering request while previous is still in progress", async () => {
    const clock = sinon.useFakeTimers();
    const pathsResult1 = new ResolvablePromise<NodePathElement[]>();
    const pathsResult2 = new ResolvablePromise<NodePathElement[]>();
    dataProviderMock.setup(async (x) => x.getFilteredNodePaths("test")).returns(async () => pathsResult1);
    dataProviderMock.setup(async (x) => x.getFilteredNodePaths("last")).returns(async () => pathsResult2);

    const initialProps: UseFilteredNodeLoaderProps = {
      dataProvider: dataProviderMock.object,
      filter: "test",
    };
    const { result, rerender } = renderHook(useFilteredNodeLoader, { initialProps });

    // give time to start request
    await act(async () => clock.tickAsync(1));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.once());
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // render with new filter and verify that new request was not started
    rerender({ ...initialProps, filter: "changed" });

    // give time to start request if necessary
    await act(async () => clock.tickAsync(1));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.once());
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // render with new filter again and verify that new request was not started
    rerender({ ...initialProps, filter: "last" });

    // give time to start request if necessary
    await act(async () => clock.tickAsync(1));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.once());
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    clock.restore();
    // resolve first request and verify that new filtering request started
    await act(async () => pathsResult1.resolve([]));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.exactly(2));
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // resolve second request and verify state
    await act(async () => pathsResult2.resolve([]));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.exactly(2));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths("test"), moq.Times.once());
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths("last"), moq.Times.once());

    await waitFor(() => expect(result.current.isFiltering).to.be.false);
    expect(result.current.filteredNodeLoader).to.not.be.undefined;
    const filteredProvider = result.current.filteredProvider;
    expect(filteredProvider).to.be.instanceOf(FilteredPresentationTreeDataProvider);
    expect((filteredProvider as FilteredPresentationTreeDataProvider).filter).to.be.eq("last");
  });

  it("clears filtering request still in progress", async () => {
    const clock = sinon.useFakeTimers();
    const pathsResult = new ResolvablePromise<NodePathElement[]>();
    dataProviderMock.setup(async (x) => x.getFilteredNodePaths("test")).returns(async () => pathsResult);

    const initialProps: UseFilteredNodeLoaderProps = {
      dataProvider: dataProviderMock.object,
      filter: "test",
    };
    const { result, rerender } = renderHook(useFilteredNodeLoader, { initialProps });

    // give time to start request if necessary
    await act(async () => clock.tickAsync(1));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.once());
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // render without filter
    rerender({ ...initialProps, filter: "" });

    // give time to start request if necessary
    await act(async () => clock.tickAsync(1));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.once());
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.false;

    clock.restore();
    // resolve first request verify that filtering was not applied
    await act(async () => pathsResult.resolve([]));
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAnyString()), moq.Times.exactly(1));
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.false;
    expect(result.current.filteredNodeLoader).to.be.undefined;
    expect(result.current.matchesCount).to.be.undefined;
  });

  it("filters when dataProvider changes", async () => {
    const pathsResult = new ResolvablePromise<NodePathElement[]>();
    const filter = "test";
    dataProviderMock.setup(async (x) => x.getFilteredNodePaths(filter)).returns(async () => pathsResult);

    const initialProps: UseFilteredNodeLoaderProps = {
      dataProvider: dataProviderMock.object,
      filter,
    };
    const { result, rerender } = renderHook(useFilteredNodeLoader, { initialProps });

    await act(async () => pathsResult.resolve([]));
    await waitFor(() => expect(result.current.isFiltering).to.be.false);
    expect(result.current.filteredNodeLoader).to.not.be.undefined;
    dataProviderMock.verify(async (x) => x.getFilteredNodePaths(filter), moq.Times.once());

    const newProvider = moq.Mock.ofType<IPresentationTreeDataProvider>();
    const newPathsResult = new ResolvablePromise<NodePathElement[]>();
    newProvider.setup(async (x) => x.getFilteredNodePaths(moq.It.isAnyString())).returns(async () => newPathsResult);

    rerender({ ...initialProps, dataProvider: newProvider.object });

    await act(async () => newPathsResult.resolve([]));
    await waitFor(() => expect(result.current.isFiltering).to.be.false);
    expect(result.current.filteredNodeLoader).to.not.be.undefined;
    newProvider.verify(async (x) => x.getFilteredNodePaths(filter), moq.Times.once());
  });

  it("returns `filteredNodeLoader` with model whose root node's `numRootNodes` is undefined and `loadNode` method returns result with an empty `loadedNodes` array when filtering", async () => {
    const testModelNode: TreeModelNode = {
      id: "test",
      checkbox: {
        isDisabled: false,
        isVisible: true,
        state: 0,
      },
      depth: 0,
      description: "",
      isExpanded: false,
      isSelected: false,
      item: createTestTreeNodeItem(),
      label: createTestPropertyRecord(),
      numChildren: 3,
      parentId: "parentId",
    };
    const initialProps: UseFilteredNodeLoaderProps = {
      dataProvider: dataProviderMock.object,
      filter: "test",
    };

    dataProviderMock.setup(async (x) => x.getFilteredNodePaths("test")).returns(async () => []);
    const { result } = renderHook(useFilteredNodeLoader, { initialProps });

    const nodeLoader = await waitFor(() => {
      expect(result.current.isFiltering).to.be.true;
      expect(result.current.filteredNodeLoader).to.not.be.undefined;
      expect(result.current.filteredNodeLoader!.modelSource.getModel().getRootNode().numChildren).to.be.undefined;
      return result.current.filteredNodeLoader!;
    });

    let loadedNodes: TreeNodeItem[] | undefined;
    nodeLoader.loadNode(testModelNode, 0).subscribe({
      next: (res) => {
        loadedNodes = res.loadedNodes;
      },
    });
    await waitFor(() => {
      expect(loadedNodes).to.not.be.undefined;
      expect(loadedNodes).to.have.lengthOf(0);
    });
  });

  it("resets filtered node loader when filter changes", async () => {
    const initialPathsResult = new ResolvablePromise<NodePathElement[]>();
    dataProviderMock.setup(async (x) => x.getFilteredNodePaths("test")).returns(async () => initialPathsResult);
    const changedPathsResult = new ResolvablePromise<NodePathElement[]>();
    dataProviderMock.setup(async (x) => x.getFilteredNodePaths("changed")).returns(async () => changedPathsResult);

    const initialProps: UseFilteredNodeLoaderProps = {
      dataProvider: dataProviderMock.object,
      filter: "test",
    };
    const { result, rerender } = renderHook(useFilteredNodeLoader, { initialProps });

    await act(async () => initialPathsResult.resolve([]));
    await waitFor(() => expect(result.current.isFiltering).to.be.false);

    expect(result.current.filteredProvider).to.be.instanceOf(FilteredPresentationTreeDataProvider);

    rerender({ ...initialProps, filter: "changed" });
    expect(result.current.filteredProvider).to.be.instanceOf(FilteredPresentationTreeDataProvider);

    // wait until filtered node loader is reset
    await waitFor(() => {
      expect(result.current.isFiltering).to.be.true;
      expect(result.current.filteredNodeLoader!).to.not.be.undefined;
      expect(result.current.filteredNodeLoader!.modelSource.getModel().getRootNode().numChildren).to.be.undefined;
    });

    await act(async () => changedPathsResult.resolve([]));
    await waitFor(() => expect(result.current.isFiltering).to.be.false);

    expect(result.current.filteredProvider).to.be.instanceOf(FilteredPresentationTreeDataProvider);
  });
});

describe("useNodeHighlightingProps", () => {
  interface Props {
    filter?: string;
    dataProvider?: IFilteredPresentationTreeDataProvider;
    activeMatchIndex?: number;
  }
  const getActiveMatchStub = sinon.stub<
    Parameters<IFilteredPresentationTreeDataProvider["getActiveMatch"]>,
    ReturnType<IFilteredPresentationTreeDataProvider["getActiveMatch"]>
  >();
  const provider = {
    getActiveMatch: getActiveMatchStub,
  } as unknown as IFilteredPresentationTreeDataProvider;

  beforeEach(() => {
    getActiveMatchStub.reset();
  });

  it("returns `undefined` if data provider is not supplied", () => {
    const { result } = renderHook((props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex), {
      initialProps: { filter: "test", activeMatchIndex: 1 },
    });
    expect(result.current).to.be.undefined;
  });

  it("returns `undefined` if filter is not supplied", () => {
    const { result } = renderHook((props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex), {
      initialProps: { dataProvider: provider, activeMatchIndex: 1 },
    });
    expect(result.current).to.be.undefined;
  });

  it("returns highlighting props with active match `undefined` if active match index is not supplied", () => {
    const { result } = renderHook((props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex), {
      initialProps: { filter: "test", dataProvider: provider },
    });
    expect(result.current).to.not.be.undefined;
    expect(result.current!.activeMatch).to.be.undefined;
    expect(result.current!.searchText).to.be.eq("test");
  });

  it("returns highlighting props", () => {
    getActiveMatchStub.returns({
      matchIndex: 2,
      nodeId: "test-node",
    });

    const { result } = renderHook((props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex), {
      initialProps: { filter: "test", dataProvider: provider, activeMatchIndex: 1 },
    });
    expect(result.current).to.not.be.undefined;
    expect(result.current!.activeMatch).to.be.deep.eq({
      matchIndex: 2,
      nodeId: "test-node",
    });
    expect(result.current!.searchText).to.be.eq("test");
  });
});
