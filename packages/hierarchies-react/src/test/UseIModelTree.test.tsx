/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import * as hierarchiesModule from "@itwin/presentation-hierarchies";
import { useIModelTree, useIModelUnifiedSelectionTree } from "../presentation-hierarchies-react/UseIModelTree";
import { createStub, renderHook, waitFor } from "./TestUtils";

describe("useIModelTree", () => {
  const hierarchyProvider = {
    getNodes: createStub<hierarchiesModule.HierarchyProvider["getNodes"]>(),
    getNodeInstanceKeys: createStub<hierarchiesModule.HierarchyProvider["getNodeInstanceKeys"]>(),
    setFormatter: createStub<hierarchiesModule.HierarchyProvider["setFormatter"]>(),
    setHierarchyFilter: createStub<hierarchiesModule.HierarchyProvider["setHierarchyFilter"]>(),
    dispose: createStub<() => void>(),
  };
  const hierarchyDefinition = {} as hierarchiesModule.HierarchyDefinition;

  let createIModelHierarchyProviderStub: sinon.SinonStub<
    Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>,
    ReturnType<typeof hierarchiesModule.createIModelHierarchyProvider>
  >;

  type UseIModelTreeProps = Parameters<typeof useIModelTree>[0];
  const initialProps: UseIModelTreeProps = {
    imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
    getHierarchyDefinition: () => hierarchyDefinition,
    localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
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
    createIModelHierarchyProviderStub.reset();
    createIModelHierarchyProviderStub.returns(hierarchyProvider);
  });

  it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const { result } = renderHook(useIModelTree, { initialProps });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(createIModelHierarchyProviderStub).to.be.calledWith(
      sinon.match((props: Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>[0]) => {
        return (
          props.imodelAccess === initialProps.imodelAccess &&
          props.hierarchyDefinition === hierarchyDefinition &&
          props.localizedStrings === initialProps.localizedStrings
        );
      }),
    );
  });

  it("forwards `getFilteredPaths` call", async () => {
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const getFilteredPaths = sinon.stub().callsFake(async () => undefined);
    const { result } = renderHook(useIModelTree, { initialProps: { ...initialProps, getFilteredPaths } });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(getFilteredPaths).to.be.calledWith({ imodelAccess: initialProps.imodelAccess });
  });
});

describe("useIModelUnifiedSelectionTree", () => {
  const hierarchyProvider = {
    getNodes: createStub<hierarchiesModule.HierarchyProvider["getNodes"]>(),
    getNodeInstanceKeys: createStub<hierarchiesModule.HierarchyProvider["getNodeInstanceKeys"]>(),
    setFormatter: createStub<hierarchiesModule.HierarchyProvider["setFormatter"]>(),
    setHierarchyFilter: createStub<hierarchiesModule.HierarchyProvider["setHierarchyFilter"]>(),
    dispose: createStub<() => void>(),
  };
  const hierarchyDefinition = {} as hierarchiesModule.HierarchyDefinition;

  let createIModelHierarchyProviderStub: sinon.SinonStub<
    Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>,
    ReturnType<typeof hierarchiesModule.createIModelHierarchyProvider>
  >;

  type UseIModelTreeProps = Parameters<typeof useIModelUnifiedSelectionTree>[0];
  const initialProps: UseIModelTreeProps = {
    imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
    getHierarchyDefinition: () => hierarchyDefinition,
    localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
    sourceName: "test-component",
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
    createIModelHierarchyProviderStub.reset();
    createIModelHierarchyProviderStub.returns(hierarchyProvider);
  });

  it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const { result } = renderHook(useIModelUnifiedSelectionTree, { initialProps });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(createIModelHierarchyProviderStub).to.be.calledWith(
      sinon.match((props: Parameters<typeof hierarchiesModule.createIModelHierarchyProvider>[0]) => {
        return (
          props.imodelAccess === initialProps.imodelAccess &&
          props.hierarchyDefinition === hierarchyDefinition &&
          props.localizedStrings === initialProps.localizedStrings
        );
      }),
    );
  });

  it("forwards `getFilteredPaths` call", async () => {
    hierarchyProvider.getNodes.callsFake(() => createAsyncIterator([]));
    const getFilteredPaths = sinon.stub().callsFake(async () => undefined);
    const { result } = renderHook(useIModelUnifiedSelectionTree, { initialProps: { ...initialProps, getFilteredPaths } });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(getFilteredPaths).to.be.calledWith({ imodelAccess: initialProps.imodelAccess });
  });
});
