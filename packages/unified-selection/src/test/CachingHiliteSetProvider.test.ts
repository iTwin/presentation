/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { CachingHiliteSetProvider, createCachingHiliteSetProvider } from "../unified-selection/CachingHiliteSetProvider";
import * as hiliteSetProvider from "../unified-selection/HiliteSetProvider";
import { IMetadataProvider } from "../unified-selection/queries/ECMetadata";
import { IECSqlQueryExecutor } from "../unified-selection/queries/ECSqlCore";
import { SelectableInstanceKey } from "../unified-selection/Selectable";
import { createStorage, IMODEL_CLOSE_SELECTION_CLEAR_SOURCE, SelectionStorage } from "../unified-selection/SelectionStorage";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

const generateSelection = (): SelectableInstanceKey[] => {
  return [createSelectableInstanceKey(1), createSelectableInstanceKey(2), createSelectableInstanceKey(3)];
};

describe("CachingHiliteSetProvider", () => {
  let factory: sinon.SinonStub<[props: hiliteSetProvider.HiliteSetProviderProps], hiliteSetProvider.HiliteSetProvider>;
  let selectionStorage: SelectionStorage;
  let hiliteSetCache: CachingHiliteSetProvider;
  const provider = {
    getHiliteSet: sinon.stub<[{ iModelKey: string }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
  };
  const iModelProvider = sinon.stub<[string], { queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider }>();
  const iModelKey = "iModelKey";

  async function loadHiliteSet(modelKey: string) {
    const iterator = hiliteSetCache.getHiliteSet({ iModelKey: modelKey });

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

    hiliteSetCache = createCachingHiliteSetProvider({
      selectionStorage,
      iModelProvider,
    });
    iModelProvider.returns({ queryExecutor: {} as IECSqlQueryExecutor, metadataProvider: {} as IMetadataProvider });
    selectionStorage.addToSelection({ iModelKey, source: "test", selectables: generateSelection() });

    provider.getHiliteSet.reset();
    provider.getHiliteSet.callsFake(async function* () {
      yield { models: ["0x1"], subCategories: ["0x1"], elements: ["0x1"] } as hiliteSetProvider.HiliteSet;
      yield { models: ["0x2"], subCategories: ["0x2"], elements: ["0x2"] } as hiliteSetProvider.HiliteSet;
      yield { models: ["0x3"], subCategories: ["0x3"], elements: ["0x3"] } as hiliteSetProvider.HiliteSet;
    });
    factory = sinon.stub(hiliteSetProvider, "createHiliteSetProvider").returns(provider as unknown as hiliteSetProvider.HiliteSetProvider);
  });

  afterEach(() => {
    factory.restore();
  });

  describe("getHiliteSet", () => {
    it("creates provider once for iModel", async () => {
      const executor1 = {} as IECSqlQueryExecutor;
      const executor2 = {} as IECSqlQueryExecutor;
      const metadataProvider = {} as IMetadataProvider;

      hiliteSetCache.getHiliteSet({ iModelKey: "model1" });
      iModelProvider.returns({ queryExecutor: executor1, metadataProvider });
      expect(factory).to.be.calledOnceWith({ queryExecutor: executor1, metadataProvider });
      factory.resetHistory();

      hiliteSetCache.getHiliteSet({ iModelKey: "model1" });
      expect(factory).to.not.be.called;

      hiliteSetCache.getHiliteSet({ iModelKey: "model2" });
      iModelProvider.returns({ queryExecutor: executor2, metadataProvider });
      expect(factory).to.be.calledOnceWith({ queryExecutor: executor2, metadataProvider });
      factory.resetHistory();

      hiliteSetCache.getHiliteSet({ iModelKey: "model1" });
      expect(factory).to.not.be.called;
    });

    it("caches hilite set", async () => {
      const set1 = await loadHiliteSet(iModelKey);
      const set2 = await loadHiliteSet(iModelKey);

      expect(provider.getHiliteSet).to.be.calledOnce;
      expect(set1.models.length).to.be.eq(3);
      expect(set1.subCategories.length).to.be.eq(3);
      expect(set1.elements.length).to.be.eq(3);
      expect(set2.models).to.have.members(set1.models);
      expect(set2.subCategories).to.have.members(set1.subCategories);
      expect(set2.elements).to.have.members(set1.elements);
    });

    it("clears cache on storage selection changes", async () => {
      const set1 = await loadHiliteSet(iModelKey);
      selectionStorage.clearSelection({ iModelKey, source: "test" });
      const set2 = await loadHiliteSet(iModelKey);

      expect(provider.getHiliteSet).to.be.calledTwice;
      expect(set1.models.length).to.be.eq(3);
      expect(set1.subCategories.length).to.be.eq(3);
      expect(set1.elements.length).to.be.eq(3);
      expect(set2.models).to.have.members(set1.models);
      expect(set2.subCategories).to.have.members(set1.subCategories);
      expect(set2.elements).to.have.members(set1.elements);
    });

    it("clears hilite set providers when iModel is closed", async () => {
      const queryExecutor = {} as IECSqlQueryExecutor;
      const metadataProvider = {} as IMetadataProvider;

      hiliteSetCache.getHiliteSet({ iModelKey });
      expect(factory).to.be.calledOnceWith({ queryExecutor, metadataProvider });
      factory.resetHistory();

      selectionStorage.clearSelection({ iModelKey, source: IMODEL_CLOSE_SELECTION_CLEAR_SOURCE });

      hiliteSetCache.getHiliteSet({ iModelKey });
      expect(factory).to.be.calledOnceWith({ queryExecutor, metadataProvider });
    });
  });

  describe("dispose", () => {
    it("unregisters listener from `SelectionStorage`", async () => {
      hiliteSetCache.dispose();
      provider.getHiliteSet.resetHistory();

      hiliteSetCache.getHiliteSet({ iModelKey });
      selectionStorage.clearSelection({ iModelKey, source: "test" });
      hiliteSetCache.getHiliteSet({ iModelKey });

      expect(provider.getHiliteSet).to.be.calledOnce;
    });
  });
});
