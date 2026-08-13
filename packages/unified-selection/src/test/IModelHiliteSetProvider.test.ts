/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator } from "presentation-test-utilities";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ECClassHierarchyInspector, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import { HiliteSet, HiliteSetProvider, HiliteSetProviderProps } from "../unified-selection/HiliteSetProvider.js";
import { createIModelHiliteSetProvider } from "../unified-selection/IModelHiliteSetProvider.js";
import { SelectableInstanceKey } from "../unified-selection/Selectable.js";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage.js";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

const generateSelection = (): SelectableInstanceKey[] => {
  return [createSelectableInstanceKey(1), createSelectableInstanceKey(2), createSelectableInstanceKey(3)];
};

describe("createIModelHiliteSetProvider", () => {
  let factory: Mock<(props: HiliteSetProviderProps) => HiliteSetProvider>;
  let selectionStorage: SelectionStorage;
  let hiliteSetCache: ReturnType<typeof createIModelHiliteSetProvider>;
  const provider = { getHiliteSet: vi.fn<(props: { imodelKey: string }) => AsyncIterableIterator<HiliteSet>>() };
  const imodelProvider = vi.fn<(imodelKey: string) => ECClassHierarchyInspector & ECSqlQueryExecutor>();
  const imodelKey = "iModelKey";

  async function loadHiliteSet() {
    const iterator = hiliteSetCache.getCurrentHiliteSet({ imodelKey });

    const models: string[] = [];
    const subCategories: string[] = [];
    const elements: string[] = [];

    for await (const set of iterator) {
      models.push(...set.models);
      subCategories.push(...set.subCategories);
      elements.push(...set.elements);
    }

    return { models, subCategories, elements };
  }

  function stubIModelAccess() {
    return { createQueryReader: vi.fn(), classDerivesFrom: vi.fn() };
  }

  beforeEach(async () => {
    selectionStorage = createStorage();

    factory = vi
      .fn<(props: HiliteSetProviderProps) => HiliteSetProvider>()
      .mockReturnValue(provider as unknown as HiliteSetProvider);
    hiliteSetCache = createIModelHiliteSetProvider({
      selectionStorage,
      imodelProvider,
      createHiliteSetProvider: factory,
    });
    imodelProvider.mockReturnValue(stubIModelAccess());
    selectionStorage.addToSelection({ imodelKey, source: "test", selectables: generateSelection() });

    provider.getHiliteSet.mockImplementation(() =>
      createAsyncIterator([
        { models: ["0x1"], subCategories: ["0x1"], elements: ["0x1"] },
        { models: ["0x2"], subCategories: ["0x2"], elements: ["0x2"] },
        { models: ["0x3"], subCategories: ["0x3"], elements: ["0x3"] },
      ]),
    );
  });

  describe("getHiliteSet", () => {
    it("creates provider once for iModel", async () => {
      const imodel1 = stubIModelAccess();
      const imodel2 = stubIModelAccess();
      imodelProvider.mockReturnValue(imodel1);

      hiliteSetCache.getCurrentHiliteSet({ imodelKey: "model1" });
      expect(factory).toHaveBeenCalledExactlyOnceWith({ imodelAccess: imodel1 });
      factory.mockClear();

      hiliteSetCache.getCurrentHiliteSet({ imodelKey: "model1" });
      expect(factory).not.toHaveBeenCalled();

      imodelProvider.mockReturnValue(imodel2);
      hiliteSetCache.getCurrentHiliteSet({ imodelKey: "model2" });
      expect(factory).toHaveBeenCalledExactlyOnceWith({ imodelAccess: imodel2 });
      factory.mockClear();

      hiliteSetCache.getCurrentHiliteSet({ imodelKey: "model1" });
      expect(factory).not.toHaveBeenCalled();
    });

    it("caches hilite set", async () => {
      const set1 = await loadHiliteSet();
      const set2 = await loadHiliteSet();

      expect(provider.getHiliteSet).toHaveBeenCalledOnce();
      expect(set1.models).toHaveLength(3);
      expect(set1.subCategories).toHaveLength(3);
      expect(set1.elements).toHaveLength(3);
      expect(set2.models).toEqual(expect.arrayContaining(set1.models));
      expect(set2.subCategories).toEqual(expect.arrayContaining(set1.subCategories));
      expect(set2.elements).toEqual(expect.arrayContaining(set1.elements));
    });

    it("clears cache on storage selection changes", async () => {
      const set1 = await loadHiliteSet();
      selectionStorage.clearSelection({ imodelKey, source: "test" });
      const set2 = await loadHiliteSet();

      expect(provider.getHiliteSet).toHaveBeenCalledTimes(2);
      expect(set1.models).toHaveLength(3);
      expect(set1.subCategories).toHaveLength(3);
      expect(set1.elements).toHaveLength(3);
      expect(set2.models).toEqual(expect.arrayContaining(set1.models));
      expect(set2.subCategories).toEqual(expect.arrayContaining(set1.subCategories));
      expect(set2.elements).toEqual(expect.arrayContaining(set1.elements));
    });

    it("clears hilite set providers when iModel is closed", async () => {
      const imodelAccess = stubIModelAccess();
      imodelProvider.mockReturnValue(imodelAccess);

      hiliteSetCache.getCurrentHiliteSet({ imodelKey });
      expect(factory).toHaveBeenCalledExactlyOnceWith({ imodelAccess });
      factory.mockClear();

      selectionStorage.clearStorage({ imodelKey });

      hiliteSetCache.getCurrentHiliteSet({ imodelKey });
      expect(factory).toHaveBeenCalledExactlyOnceWith({ imodelAccess });
    });
  });

  describe("dispose", () => {
    it("unregisters listener from `SelectionStorage`", async () => {
      hiliteSetCache[Symbol.dispose]();
      provider.getHiliteSet.mockClear();

      hiliteSetCache.getCurrentHiliteSet({ imodelKey });
      selectionStorage.clearSelection({ imodelKey, source: "test" });
      hiliteSetCache.getCurrentHiliteSet({ imodelKey });

      expect(provider.getHiliteSet).toHaveBeenCalledOnce();
    });
  });
});
