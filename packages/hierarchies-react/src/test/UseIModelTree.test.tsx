/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import * as td from "testdouble";
import * as presentationHierarchiesModule from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";
import {
  useIModelTree as originalUseIModelTree,
  useIModelUnifiedSelectionTree as originalUseIModelUnifiedSelectionTree,
} from "../presentation-hierarchies-react/UseIModelTree.js";
import { createHierarchyProviderStub, renderHook, waitFor } from "./TestUtils.js";

// this is needed for mocking external module (see `td.replaceEsm` in `stubIModelHierarchyProviderFactory`)
const presentationHierarchiesPath = import.meta.resolve("@itwin/presentation-hierarchies");

describe("useIModelTree", () => {
  type UseIModelTreeProps = Props<typeof originalUseIModelTree>;
  const hierarchyDefinition = {} as presentationHierarchiesModule.HierarchyDefinition;
  const initialProps: UseIModelTreeProps = {
    imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
    getHierarchyDefinition: () => hierarchyDefinition,
    localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
  };

  let stubs: Awaited<ReturnType<typeof stubIModelHierarchyProviderFactory>>;
  let useIModelTree: typeof originalUseIModelTree;
  before(async () => {
    stubs = await stubIModelHierarchyProviderFactory();
    useIModelTree = (await import("../presentation-hierarchies-react/UseIModelTree.js")).useIModelTree;
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
      sinon.match((props: Props<typeof stubs.createIModelHierarchyProvider>) => {
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
  type UseIModelTreeProps = Props<typeof useIModelUnifiedSelectionTree>;
  const hierarchyDefinition = {} as presentationHierarchiesModule.HierarchyDefinition;
  const initialProps: UseIModelTreeProps = {
    imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
    getHierarchyDefinition: () => hierarchyDefinition,
    localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
    sourceName: "test-component",
  };

  let stubs: Awaited<ReturnType<typeof stubIModelHierarchyProviderFactory>>;
  let useIModelUnifiedSelectionTree: typeof originalUseIModelUnifiedSelectionTree;
  before(async () => {
    stubs = await stubIModelHierarchyProviderFactory();
    useIModelUnifiedSelectionTree = (await import("../presentation-hierarchies-react/UseIModelTree.js")).useIModelUnifiedSelectionTree;
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
      sinon.match((props: Props<typeof stubs.createIModelHierarchyProvider>) => {
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
  const hierarchyProvider = createHierarchyProviderStub();
  const factory = sinon.fake<Parameters<typeof presentationHierarchiesModule.createIModelHierarchyProvider>, typeof hierarchyProvider>(() => {
    return hierarchyProvider;
  });

  await td.replaceEsm(presentationHierarchiesPath, {
    ...presentationHierarchiesModule,
    createIModelHierarchyProvider: factory,
  });

  return {
    hierarchyProvider,
    createIModelHierarchyProvider: factory,
    restore: () => {
      td.reset();
    },
  };
}
