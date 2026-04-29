/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { BeEvent } from "@itwin/core-bentley";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { useIModelTree, useIModelUnifiedSelectionTree } from "../../presentation-hierarchies-react/UseIModelTree.js";
import { createHierarchyProviderStub, getTreeRendererProps, renderHook, waitFor } from "./TestUtils.js";

import type * as presentationHierarchiesModule from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";

vi.mock("@itwin/presentation-hierarchies", async (importOriginal) => {
  const original = await importOriginal<typeof presentationHierarchiesModule>();
  return { ...original, createIModelHierarchyProvider: vi.fn() };
});

describe("useIModelTree hooks", () => {
  describe("useIModelTree", () => {
    type UseIModelTreeProps = Props<typeof useIModelTree>;
    const hierarchyDefinition = {} as presentationHierarchiesModule.HierarchyDefinition;
    const initialProps: UseIModelTreeProps = {
      imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
      getHierarchyDefinition: () => hierarchyDefinition,
    };

    it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);

      const { result } = renderHook(useIModelTree, { initialProps });
      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
      expect(vi.mocked(createIModelHierarchyProvider)).toHaveBeenCalledWith(
        expect.objectContaining({ imodelAccess: initialProps.imodelAccess, hierarchyDefinition }),
      );
    });

    it("forwards `getSearchPaths` call", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);

      let signal;
      const getSearchPaths = vi
        .fn<Required<Props<typeof useIModelTree>>["getSearchPaths"]>()
        .mockImplementation(async ({ abortSignal }) => {
          signal = abortSignal;
          return undefined;
        });
      const { result } = renderHook(useIModelTree, { initialProps: { ...initialProps, getSearchPaths } });
      await waitFor(() => {
        expect(getTreeRendererProps(result.current)).to.not.be.undefined;
      });
      expect(getSearchPaths).toHaveBeenCalledWith({ imodelAccess: initialProps.imodelAccess, abortSignal: signal });
    });
  });

  describe("useIModelUnifiedSelectionTree", () => {
    type UseIModelTreeProps = Props<typeof useIModelUnifiedSelectionTree>;
    const hierarchyDefinition = {} as presentationHierarchiesModule.HierarchyDefinition;
    const selectionStorage = {
      selectionChangeEvent: new BeEvent(),
    } as unknown as UseIModelTreeProps["selectionStorage"];
    const initialProps: UseIModelTreeProps = {
      imodelAccess: {} as UseIModelTreeProps["imodelAccess"],
      getHierarchyDefinition: () => hierarchyDefinition,
      sourceName: "test-component",
      selectionStorage,
    };

    it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);

      const { result } = renderHook(useIModelUnifiedSelectionTree, { initialProps });
      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
      expect(vi.mocked(createIModelHierarchyProvider)).toHaveBeenCalledWith(
        expect.objectContaining({ imodelAccess: initialProps.imodelAccess, hierarchyDefinition }),
      );
    });

    it("forwards `getSearchPaths` call", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);
      let signal;
      const getSearchPaths = vi
        .fn<Required<Props<typeof useIModelTree>>["getSearchPaths"]>()
        .mockImplementation(async ({ abortSignal }) => {
          signal = abortSignal;
          return undefined;
        });
      const { result } = renderHook(useIModelUnifiedSelectionTree, {
        initialProps: { ...initialProps, getSearchPaths },
      });
      await waitFor(() => {
        expect(getTreeRendererProps(result.current)).to.not.be.undefined;
      });
      expect(getSearchPaths).toHaveBeenCalledWith({ imodelAccess: initialProps.imodelAccess, abortSignal: signal });
    });
  });
});
