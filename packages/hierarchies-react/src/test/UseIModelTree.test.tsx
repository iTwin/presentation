/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator } from "presentation-test-utilities";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as presentationHierarchiesModule from "@itwin/presentation-hierarchies";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";
import { useIModelTree, useIModelUnifiedSelectionTree } from "../presentation-hierarchies-react/UseIModelTree.js";
import { createHierarchyProviderStub, renderHook, waitFor } from "./TestUtils.js";

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
      localizedStrings: {} as UseIModelTreeProps["localizedStrings"],
    };

    beforeAll(() => {
      const hierarchyProvider = createHierarchyProviderStub();
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);
    });

    it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);

      const { result } = renderHook(useIModelTree, { initialProps });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(vi.mocked(createIModelHierarchyProvider)).toHaveBeenCalledWith(
        expect.objectContaining({
          imodelAccess: initialProps.imodelAccess,
          hierarchyDefinition,
          localizedStrings: initialProps.localizedStrings,
        }),
      );
    });

    it("forwards `getFilteredPaths` call", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);

      let signal;
      const getFilteredPaths = vi.fn().mockImplementation(async ({ abortSignal }: { abortSignal: AbortSignal }) => {
        signal = abortSignal;
        return undefined;
      });
      const { result } = renderHook(useIModelTree, { initialProps: { ...initialProps, getFilteredPaths } });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(getFilteredPaths).toHaveBeenCalledWith({ imodelAccess: initialProps.imodelAccess, abortSignal: signal });
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

    beforeAll(() => {
      const hierarchyProvider = createHierarchyProviderStub();
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);
    });

    it("creates imodel hierarchy provider using given imodel and hierarchy definition", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);

      const { result } = renderHook(useIModelUnifiedSelectionTree, { initialProps });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(vi.mocked(createIModelHierarchyProvider)).toHaveBeenCalledWith(
        expect.objectContaining({
          imodelAccess: initialProps.imodelAccess,
          hierarchyDefinition,
          localizedStrings: initialProps.localizedStrings,
        }),
      );
    });

    it("forwards `getFilteredPaths` call", async () => {
      const hierarchyProvider = createHierarchyProviderStub();
      hierarchyProvider.getNodes.mockImplementation(() => createAsyncIterator([]));
      vi.mocked(createIModelHierarchyProvider).mockImplementation(() => hierarchyProvider as any);

      let signal;
      const getFilteredPaths = vi.fn().mockImplementation(async ({ abortSignal }: { abortSignal: AbortSignal }) => {
        signal = abortSignal;
        return undefined;
      });
      const { result } = renderHook(useIModelUnifiedSelectionTree, {
        initialProps: { ...initialProps, getFilteredPaths },
      });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(getFilteredPaths).toHaveBeenCalledWith({ imodelAccess: initialProps.imodelAccess, abortSignal: signal });
    });
  });
});
