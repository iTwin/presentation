/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { ResolvablePromise } from "presentation-test-utilities";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import {
  useFilteredNodeLoader,
  useNodeHighlightingProps,
} from "../../../presentation-components/tree/controlled/UseControlledTreeFiltering.js";
import { FilteredPresentationTreeDataProvider } from "../../../presentation-components/tree/FilteredDataProvider.js";
import { createTestPropertyRecord, createTestTreeNodeItem } from "../../_helpers/UiComponents.js";
import { act, createStub, renderHook, waitFor } from "../../TestUtils.js";

import type { TreeModelNode, TreeNodeItem } from "@itwin/components-react";
import type { IModelConnection } from "@itwin/core-frontend";
import type { NodePathElement } from "@itwin/presentation-common";
import type {
  IFilteredPresentationTreeDataProvider,
  IPresentationTreeDataProvider,
} from "../../../presentation-components/tree/IPresentationTreeDataProvider.js";

describe("useFilteredNodeLoader", () => {
  const imodel = {} as IModelConnection;
  const dataProvider = {
    imodel,
    getFilteredNodePaths: createStub<IPresentationTreeDataProvider["getFilteredNodePaths"]>(),
  };
  const initialProps = { dataProvider: dataProvider as unknown as IPresentationTreeDataProvider };

  beforeAll(async () => {
    await UiComponents.initialize(new EmptyLocalization());
  });

  afterAll(() => {
    UiComponents.terminate();
  });

  beforeEach(() => {
    dataProvider.getFilteredNodePaths.mockReset();
  });

  it("does not start filtering if filter is not provided", () => {
    const { result } = renderHook(useFilteredNodeLoader, { initialProps: { ...initialProps } });
    expect(result.current.isFiltering).to.be.false;
  });

  it("starts filtering if filter is provided", async () => {
    const pathsResult1 = new ResolvablePromise<NodePathElement[]>();
    dataProvider.getFilteredNodePaths.mockReturnValue(pathsResult1);

    const { result } = renderHook(useFilteredNodeLoader, {
      initialProps: { ...initialProps, filter: "test", activeMatchIndex: 0 },
    });
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    await act(async () => pathsResult1.resolve([]));

    await waitFor(() => expect(result.current.isFiltering).to.be.false);
  });

  it("does not start new filtering request while previous is still in progress", async () => {
    vi.useFakeTimers();
    const pathsResult1 = new ResolvablePromise<NodePathElement[]>();
    const pathsResult2 = new ResolvablePromise<NodePathElement[]>();

    dataProvider.getFilteredNodePaths.mockImplementation(async (filter) => {
      if (filter === "test") {
        return pathsResult1;
      }
      if (filter === "last") {
        return pathsResult2;
      }
      return [];
    });

    const { result, rerender } = renderHook(useFilteredNodeLoader, {
      initialProps: { ...initialProps, filter: "test" },
    });

    // give time to start request
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledOnce();
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // render with new filter and verify that new request was not started
    rerender({ ...initialProps, filter: "changed" });

    // give time to start request if necessary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledOnce();
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // render with new filter again and verify that new request was not started
    rerender({ ...initialProps, filter: "last" });

    // give time to start request if necessary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledOnce();
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    vi.useRealTimers();
    // resolve first request and verify that new filtering request started
    await act(async () => {
      await pathsResult1.resolve([]);
    });
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledTimes(2);
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // resolve second request and verify state
    await act(async () => {
      await pathsResult2.resolve([]);
    });

    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledTimes(2);
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledWith("test");
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledWith("last");

    await waitFor(() => expect(result.current.isFiltering).to.be.false);
    expect(result.current.filteredNodeLoader).to.not.be.undefined;
    const filteredProvider = result.current.filteredProvider;
    expect(filteredProvider).to.be.instanceOf(FilteredPresentationTreeDataProvider);
    expect((filteredProvider as FilteredPresentationTreeDataProvider).filter).to.be.eq("last");
  });

  it("clears filtering request still in progress", async () => {
    vi.useFakeTimers();
    const pathsResult = new ResolvablePromise<NodePathElement[]>();
    dataProvider.getFilteredNodePaths.mockReturnValue(pathsResult);

    const { result, rerender } = renderHook(useFilteredNodeLoader, {
      initialProps: { ...initialProps, filter: "test" },
    });

    // give time to start request if necessary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledOnce();
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.true;

    // render without filter
    rerender({ ...initialProps, filter: "" });

    // give time to start request if necessary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledOnce();
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.false;

    vi.useRealTimers();
    // resolve first request verify that filtering was not applied
    await act(async () => pathsResult.resolve([]));
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledOnce();
    expect(result.current).to.not.be.undefined;
    expect(result.current.isFiltering).to.be.false;
    expect(result.current.filteredNodeLoader).to.be.undefined;
    expect(result.current.matchesCount).to.be.undefined;
  });

  it("filters when dataProvider changes", async () => {
    const pathsResult = new ResolvablePromise<NodePathElement[]>();
    const filter = "test";
    dataProvider.getFilteredNodePaths.mockReturnValue(pathsResult);

    const { result, rerender } = renderHook(useFilteredNodeLoader, { initialProps: { ...initialProps, filter } });

    await act(async () => pathsResult.resolve([]));
    await waitFor(() => expect(result.current.isFiltering).to.be.false);
    expect(result.current.filteredNodeLoader).to.not.be.undefined;
    expect(dataProvider.getFilteredNodePaths).toHaveBeenCalledOnce();

    const newProvider = { getFilteredNodePaths: createStub<IPresentationTreeDataProvider["getFilteredNodePaths"]>() };
    const newPathsResult = new ResolvablePromise<NodePathElement[]>();
    newProvider.getFilteredNodePaths.mockReturnValue(newPathsResult);

    rerender({ ...initialProps, filter, dataProvider: newProvider as unknown as IPresentationTreeDataProvider });

    await act(async () => newPathsResult.resolve([]));
    await waitFor(() => expect(result.current.isFiltering).to.be.false);
    expect(result.current.filteredNodeLoader).to.not.be.undefined;
    expect(newProvider.getFilteredNodePaths).toHaveBeenCalledOnce();
  });

  it("returns `filteredNodeLoader` with model whose root node's `numRootNodes` is undefined and `loadNode` method returns result with an empty `loadedNodes` array when filtering", async () => {
    const testModelNode: TreeModelNode = {
      id: "test",
      checkbox: { isDisabled: false, isVisible: true, state: 0 },
      depth: 0,
      description: "",
      isExpanded: false,
      isSelected: false,
      item: createTestTreeNodeItem(),
      label: createTestPropertyRecord(),
      numChildren: 3,
      parentId: "parentId",
    };

    dataProvider.getFilteredNodePaths.mockResolvedValue([]);
    const { result } = renderHook(useFilteredNodeLoader, { initialProps: { ...initialProps, filter: "test" } });

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
    const changedPathsResult = new ResolvablePromise<NodePathElement[]>();
    dataProvider.getFilteredNodePaths.mockImplementation(async (filter) => {
      if (filter === "test") {
        return initialPathsResult;
      }
      if (filter === "changed") {
        return changedPathsResult;
      }
      return [];
    });

    const { result, rerender } = renderHook(useFilteredNodeLoader, {
      initialProps: { ...initialProps, filter: "test" },
    });

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
  const getActiveMatchStub = vi.fn<IFilteredPresentationTreeDataProvider["getActiveMatch"]>();
  const provider = { getActiveMatch: getActiveMatchStub } as unknown as IFilteredPresentationTreeDataProvider;

  beforeEach(() => {
    getActiveMatchStub.mockReset();
  });

  it("returns `undefined` if data provider is not supplied", () => {
    const { result } = renderHook(
      (props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex),
      { initialProps: { filter: "test", activeMatchIndex: 1 } },
    );
    expect(result.current).to.be.undefined;
  });

  it("returns `undefined` if filter is not supplied", () => {
    const { result } = renderHook(
      (props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex),
      { initialProps: { dataProvider: provider, activeMatchIndex: 1 } },
    );
    expect(result.current).to.be.undefined;
  });

  it("returns highlighting props with active match `undefined` if active match index is not supplied", () => {
    const { result } = renderHook(
      (props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex),
      { initialProps: { filter: "test", dataProvider: provider } },
    );
    expect(result.current).to.not.be.undefined;
    expect(result.current!.activeMatch).to.be.undefined;
    expect(result.current!.searchText).to.be.eq("test");
  });

  it("returns highlighting props", () => {
    getActiveMatchStub.mockReturnValue({ matchIndex: 2, nodeId: "test-node" });

    const { result } = renderHook(
      (props: Props) => useNodeHighlightingProps(props.filter, props.dataProvider, props.activeMatchIndex),
      { initialProps: { filter: "test", dataProvider: provider, activeMatchIndex: 1 } },
    );
    expect(result.current).to.not.be.undefined;
    expect(result.current!.activeMatch).to.be.deep.eq({ matchIndex: 2, nodeId: "test-node" });
    expect(result.current!.searchText).to.be.eq("test");
  });
});
