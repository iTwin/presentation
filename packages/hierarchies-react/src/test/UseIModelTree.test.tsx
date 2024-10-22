/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { BeEvent } from "@itwin/core-bentley";
import * as presentationHierarchiesModule from "@itwin/presentation-hierarchies";
import { useIModelTree, useIModelUnifiedSelectionTree } from "../presentation-hierarchies-react/UseIModelTree.js";
import { createStub, renderHook, waitFor } from "./TestUtils.js";

describe("useIModelTree", () => {
  type UseIModelTreeProps = Parameters<typeof useIModelTree>[0];
  const hierarchyDefinition = {} as presentationHierarchiesModule.HierarchyDefinition;
  const initialProps: UseIModelTreeProps = {
    imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
    getHierarchyDefinition: () => hierarchyDefinition,
    localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
  };

  let stubs: Awaited<ReturnType<typeof stubIModelHierarchyProviderFactory>>;
  before(async () => {
    stubs = await stubIModelHierarchyProviderFactory();
  });
  afterEach(() => {
    stubs.createIModelHierarchyProvider.resetHistory();
  });
  after(() => {
    stubs.restore();
  });

  it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
    stubs.hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const { result } = renderHook(useIModelTree, { initialProps });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(stubs.createIModelHierarchyProvider).to.be.calledWith(
      sinon.match((props: Parameters<typeof stubs.createIModelHierarchyProvider>[0]) => {
        return (
          props.imodelAccess === initialProps.imodelAccess &&
          props.hierarchyDefinition === hierarchyDefinition &&
          props.localizedStrings === initialProps.localizedStrings
        );
      }),
    );
  });

  it("forwards `getFilteredPaths` call", async () => {
    stubs.hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const getFilteredPaths = sinon.stub().callsFake(async () => undefined);
    const { result } = renderHook(useIModelTree, { initialProps: { ...initialProps, getFilteredPaths } });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(getFilteredPaths).to.be.calledWith({ imodelAccess: initialProps.imodelAccess });
  });
});

describe("useIModelUnifiedSelectionTree", () => {
  type UseIModelTreeProps = Parameters<typeof useIModelUnifiedSelectionTree>[0];
  const hierarchyDefinition = {} as presentationHierarchiesModule.HierarchyDefinition;
  const initialProps: UseIModelTreeProps = {
    imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
    getHierarchyDefinition: () => hierarchyDefinition,
    localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
    sourceName: "test-component",
  };

  let stubs: Awaited<ReturnType<typeof stubIModelHierarchyProviderFactory>>;
  before(async () => {
    stubs = await stubIModelHierarchyProviderFactory();
  });
  afterEach(() => {
    stubs.createIModelHierarchyProvider.resetHistory();
  });
  after(() => {
    stubs.restore();
  });

  it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
    stubs.hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const { result } = renderHook(useIModelUnifiedSelectionTree, { initialProps });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(stubs.createIModelHierarchyProvider).to.be.calledWith(
      sinon.match((props: Parameters<typeof stubs.createIModelHierarchyProvider>[0]) => {
        return (
          props.imodelAccess === initialProps.imodelAccess &&
          props.hierarchyDefinition === hierarchyDefinition &&
          props.localizedStrings === initialProps.localizedStrings
        );
      }),
    );
  });

  it("forwards `getFilteredPaths` call", async () => {
    stubs.hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const getFilteredPaths = sinon.stub().callsFake(async () => undefined);
    const { result } = renderHook(useIModelUnifiedSelectionTree, { initialProps: { ...initialProps, getFilteredPaths } });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(getFilteredPaths).to.be.calledWith({ imodelAccess: initialProps.imodelAccess });
  });
});

async function stubIModelHierarchyProviderFactory() {
  const hierarchyProvider = {
    hierarchyChanged: new BeEvent(),
    getNodes: createStub<presentationHierarchiesModule.HierarchyProvider["getNodes"]>(),
    getNodeInstanceKeys: createStub<presentationHierarchiesModule.HierarchyProvider["getNodeInstanceKeys"]>(),
    setFormatter: createStub<presentationHierarchiesModule.HierarchyProvider["setFormatter"]>(),
    setHierarchyFilter: createStub<presentationHierarchiesModule.HierarchyProvider["setHierarchyFilter"]>(),
    dispose: createStub<() => void>(),
  };
  const factory = sinon.stub(presentationHierarchiesModule, "createIModelHierarchyProvider").returns(hierarchyProvider);
  return {
    hierarchyProvider,
    createIModelHierarchyProvider: factory,
    restore: () => {
      sinon.restore();
    },
  };
}
