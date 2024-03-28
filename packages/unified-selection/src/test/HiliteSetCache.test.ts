/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { createCache, HiliteSetCache } from "../unified-selection/HiliteSetCache";
import { HiliteSet, HiliteSetProvider, HiliteSetProviderProps } from "../unified-selection/HiliteSetProvider";
import { IMetadataProvider } from "../unified-selection/queries/ECMetadata";
import { IECSqlQueryExecutor } from "../unified-selection/queries/ECSqlCore";
import { SelectableInstanceKey } from "../unified-selection/Selectable";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

const generateSelection = (): SelectableInstanceKey[] => {
  return [createSelectableInstanceKey(1), createSelectableInstanceKey(2), createSelectableInstanceKey(3)];
};

describe("HiliteSetCache", () => {
  let factory: sinon.SinonStub<[HiliteSetProviderProps], HiliteSetProvider>;
  let selectionStorage: SelectionStorage;
  let hiliteSetCache: HiliteSetCache;
  let provider = {
    getHiliteSet: sinon.stub<
      [{ iModelKey: string; queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider }],
      AsyncIterableIterator<HiliteSet>
    >(),
  };
  const iModelKey = "iModelKey";

  async function loadHiliteSet(iModelKey: string, queryExecutor: IECSqlQueryExecutor, metadataProvider: IMetadataProvider) {
    const iterator = hiliteSetCache.getHiliteSet({ iModelKey, queryExecutor, metadataProvider });

    const models: string[] = [];
    const subCategories: string[] = [];
    const elements: string[] = [];

    for await (const set of iterator) {
      models.push(...set.models);
      subCategories.push(...set.subCategories);
      elements.push(...set.elements);
    }

    return {
      models,
      subCategories,
      elements,
    };
  }

  beforeEach(() => {
    selectionStorage = createStorage();
    hiliteSetCache = createCache(selectionStorage);
    selectionStorage.addToSelection({ iModelKey, source: "test", selectables: generateSelection() });

    provider = {
      getHiliteSet: sinon.stub<
        [{ iModelKey: string; queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider }],
        AsyncIterableIterator<HiliteSet>
      >(),
    };
    provider.getHiliteSet.callsFake(async function* () {
      yield { models: ["0x1"], subCategories: ["0x1"], elements: ["0x1"] } as HiliteSet;
      yield { models: ["0x2"], subCategories: ["0x2"], elements: ["0x2"] } as HiliteSet;
      yield { models: ["0x3"], subCategories: ["0x3"], elements: ["0x3"] } as HiliteSet;
    });
    factory = sinon.stub(HiliteSetProvider, "create").returns(provider as unknown as HiliteSetProvider);
  });

  afterEach(() => {
    factory.restore();
  });

  describe("getHiliteSet", () => {
    it("creates provider once for iModel", async () => {
      const executor1 = {} as IECSqlQueryExecutor;
      const executor2 = {} as IECSqlQueryExecutor;
      const metadataProvider = {} as IMetadataProvider;

      hiliteSetCache.getHiliteSet({ iModelKey: "model1", queryExecutor: executor1, metadataProvider });
      expect(factory).to.be.calledOnceWith({ queryExecutor: executor1, metadataProvider });
      factory.resetHistory();

      hiliteSetCache.getHiliteSet({ iModelKey: "model1", queryExecutor: executor1, metadataProvider });
      expect(factory).to.not.be.called;

      hiliteSetCache.getHiliteSet({ iModelKey: "model2", queryExecutor: executor2, metadataProvider });
      expect(factory).to.be.calledOnceWith({ queryExecutor: executor2, metadataProvider });
      factory.resetHistory();

      hiliteSetCache.getHiliteSet({ iModelKey: "model1", queryExecutor: executor1, metadataProvider });
      expect(factory).to.not.be.called;
    });

    it("caches hilite set", async () => {
      const queryExecutor = {} as IECSqlQueryExecutor;
      const metadataProvider = {} as IMetadataProvider;

      const set1 = await loadHiliteSet(iModelKey, queryExecutor, metadataProvider);
      const set2 = await loadHiliteSet(iModelKey, queryExecutor, metadataProvider);

      expect(provider.getHiliteSet).to.be.calledOnce;
      expect(set1.models.length).to.be.eq(3);
      expect(set1.subCategories.length).to.be.eq(3);
      expect(set1.elements.length).to.be.eq(3);
      expect(set2.models).to.have.members(set1.models);
      expect(set2.subCategories).to.have.members(set1.subCategories);
      expect(set2.elements).to.have.members(set1.elements);
    });

    it("clears cache on storage selection changes", async () => {
      const queryExecutor = {} as IECSqlQueryExecutor;
      const metadataProvider = {} as IMetadataProvider;

      const set1 = await loadHiliteSet(iModelKey, queryExecutor, metadataProvider);
      selectionStorage.clearSelection({ iModelKey, source: "test" });
      const set2 = await loadHiliteSet(iModelKey, queryExecutor, metadataProvider);

      expect(provider.getHiliteSet).to.be.calledTwice;
      expect(set1.models.length).to.be.eq(3);
      expect(set1.subCategories.length).to.be.eq(3);
      expect(set1.elements.length).to.be.eq(3);
      expect(set2.models).to.have.members(set1.models);
      expect(set2.subCategories).to.have.members(set1.subCategories);
      expect(set2.elements).to.have.members(set1.elements);
    });
  });

  describe("clearCache", () => {
    it("clears provider", () => {
      const queryExecutor = {} as IECSqlQueryExecutor;
      const metadataProvider = {} as IMetadataProvider;

      hiliteSetCache.getHiliteSet({ iModelKey, queryExecutor, metadataProvider });
      expect(factory).to.be.calledOnceWith({ queryExecutor, metadataProvider });
      factory.resetHistory();

      hiliteSetCache.clearCache({ iModelKey });

      hiliteSetCache.getHiliteSet({ iModelKey, queryExecutor, metadataProvider });
      expect(factory).to.be.calledOnceWith({ queryExecutor, metadataProvider });
    });
  });

  describe("dispose", () => {
    it("unregisters listener from `SelectionStorage`", async () => {
      const queryExecutor = {} as IECSqlQueryExecutor;
      const metadataProvider = {} as IMetadataProvider;

      hiliteSetCache.dispose();
      provider.getHiliteSet.resetHistory();

      hiliteSetCache.getHiliteSet({ iModelKey, queryExecutor, metadataProvider });
      selectionStorage.clearSelection({ iModelKey, source: "test" });
      hiliteSetCache.getHiliteSet({ iModelKey, queryExecutor, metadataProvider });

      expect(provider.getHiliteSet).to.be.calledOnce;
    });
  });
});
