/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { mock } from "node:test";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import * as presentationHierarchiesModule from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";
import { createHierarchyProviderStub, renderHook, waitFor } from "./TestUtils.js";
import type {
  useIModelTree as originalUseIModelTree,
  useIModelUnifiedSelectionTree as originalUseIModelUnifiedSelectionTree,
} from "../presentation-hierarchies-react/UseIModelTree.js";

describe("useIModelTree hooks", () => {
  let stubs: Awaited<ReturnType<typeof stubIModelHierarchyProviderFactory>>;
  let useIModelTree: typeof originalUseIModelTree;
  let useIModelUnifiedSelectionTree: typeof originalUseIModelUnifiedSelectionTree;

  before(async () => {
    stubs = await stubIModelHierarchyProviderFactory();
    const testedModule = await import("../presentation-hierarchies-react/UseIModelTree.js");
    useIModelTree = testedModule.useIModelTree;
    useIModelUnifiedSelectionTree = testedModule.useIModelUnifiedSelectionTree;
  });

  after(() => {
    stubs.restore();
  });

  afterEach(() => {
    stubs.createIModelHierarchyProvider.resetHistory();
  });

  describe("useIModelTree", () => {
    type UseIModelTreeProps = Props<typeof originalUseIModelTree>;
    const hierarchyDefinition = {} as presentationHierarchiesModule.HierarchyDefinition;
    const initialProps: UseIModelTreeProps = {
      imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
      getHierarchyDefinition: () => hierarchyDefinition,
      localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
    };

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
      let signal;
      const getFilteredPaths = sinon.stub().callsFake(async ({ abortSignal }) => {
        signal = abortSignal;
        return undefined;
      });
      const { result } = renderHook(useIModelTree, { initialProps: { ...initialProps, getFilteredPaths } });
      await waitFor(() => {
        expect(result.current.isLoading).to.be.false;
      });
      expect(getFilteredPaths).to.be.calledWith({ imodelAccess: initialProps.imodelAccess, abortSignal: signal });
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
      let signal;
      const getFilteredPaths = sinon.stub().callsFake(async ({ abortSignal }) => {
        signal = abortSignal;
        return undefined;
      });
      const { result } = renderHook(useIModelUnifiedSelectionTree, { initialProps: { ...initialProps, getFilteredPaths } });
      await waitFor(() => {
        expect(result.current.isLoading).to.be.false;
      });
      expect(getFilteredPaths).to.be.calledWith({ imodelAccess: initialProps.imodelAccess, abortSignal: signal });
    });
  });

  async function stubIModelHierarchyProviderFactory() {
    const hierarchyProvider = createHierarchyProviderStub();
    const factory = sinon.fake<Parameters<typeof presentationHierarchiesModule.createIModelHierarchyProvider>, typeof hierarchyProvider>(() => {
      return hierarchyProvider;
    });

    const presentationHierarchiesMock = mock.module("@itwin/presentation-hierarchies", {
      namedExports: {
        ...presentationHierarchiesModule,
        createIModelHierarchyProvider: factory,
      },
    });

    return {
      hierarchyProvider,
      createIModelHierarchyProvider: factory,
      restore: () => {
        presentationHierarchiesMock.restore();
      },
    };
  }
});
