/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { CachingHiliteSetProvider, createCachingHiliteSetProvider } from "../unified-selection/CachingHiliteSetProvider";
import * as hiliteSetProvider from "../unified-selection/HiliteSetProvider";
import { SelectableInstanceKey } from "../unified-selection/Selectable";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage";
import { ECSchemaProvider } from "../unified-selection/types/ECMetadata";
import { ECSqlQueryExecutor } from "../unified-selection/types/ECSqlCore";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

const generateSelection = (): SelectableInstanceKey[] => {
  return [createSelectableInstanceKey(1), createSelectableInstanceKey(2), createSelectableInstanceKey(3)];
};

describe("CachingHiliteSetProvider", () => {
  let factory: sinon.SinonStub<[props: hiliteSetProvider.HiliteSetProviderProps], hiliteSetProvider.HiliteSetProvider>;
  let selectionStorage: SelectionStorage;
  let hiliteSetCache: CachingHiliteSetProvider;
  const provider = {
    getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
  };
  const imodelProvider = sinon.stub<[string], ECSchemaProvider & ECSqlQueryExecutor>();
  const imodelKey = "iModelKey";

  async function loadHiliteSet() {
    const iterator = hiliteSetCache.getHiliteSet({ imodelKey });

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

  function stubIModelAccess(): sinon.SinonStubbedInstance<ECSchemaProvider & ECSqlQueryExecutor> {
    return {
      createQueryReader: sinon.stub(),
      getSchema: sinon.stub(),
    };
  }

  beforeEach(() => {
    selectionStorage = createStorage();

    hiliteSetCache = createCachingHiliteSetProvider({
      selectionStorage,
      imodelProvider,
    });
    imodelProvider.returns(stubIModelAccess());
    selectionStorage.addToSelection({ imodelKey, source: "test", selectables: generateSelection() });

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
      const imodel1 = stubIModelAccess();
      const imodel2 = stubIModelAccess();
      imodelProvider.returns(imodel1);

      hiliteSetCache.getHiliteSet({ imodelKey: "model1" });
      expect(factory).to.be.calledOnceWith({ imodelAccess: imodel1 });
      factory.resetHistory();

      hiliteSetCache.getHiliteSet({ imodelKey: "model1" });
      expect(factory).to.not.be.called;

      imodelProvider.returns(imodel2);
      hiliteSetCache.getHiliteSet({ imodelKey: "model2" });
      expect(factory).to.be.calledOnceWith({ imodelAccess: imodel2 });
      factory.resetHistory();

      hiliteSetCache.getHiliteSet({ imodelKey: "model1" });
      expect(factory).to.not.be.called;
    });

    it("caches hilite set", async () => {
      const set1 = await loadHiliteSet();
      const set2 = await loadHiliteSet();

      expect(provider.getHiliteSet).to.be.calledOnce;
      expect(set1.models.length).to.be.eq(3);
      expect(set1.subCategories.length).to.be.eq(3);
      expect(set1.elements.length).to.be.eq(3);
      expect(set2.models).to.have.members(set1.models);
      expect(set2.subCategories).to.have.members(set1.subCategories);
      expect(set2.elements).to.have.members(set1.elements);
    });

    it("clears cache on storage selection changes", async () => {
      const set1 = await loadHiliteSet();
      selectionStorage.clearSelection({ imodelKey, source: "test" });
      const set2 = await loadHiliteSet();

      expect(provider.getHiliteSet).to.be.calledTwice;
      expect(set1.models.length).to.be.eq(3);
      expect(set1.subCategories.length).to.be.eq(3);
      expect(set1.elements.length).to.be.eq(3);
      expect(set2.models).to.have.members(set1.models);
      expect(set2.subCategories).to.have.members(set1.subCategories);
      expect(set2.elements).to.have.members(set1.elements);
    });

    it("clears hilite set providers when iModel is closed", async () => {
      const imodelAccess = stubIModelAccess();
      imodelProvider.returns(imodelAccess);

      hiliteSetCache.getHiliteSet({ imodelKey });
      expect(factory).to.be.calledOnceWith({ imodelAccess });
      factory.resetHistory();

      selectionStorage.clearStorage({ imodelKey });

      hiliteSetCache.getHiliteSet({ imodelKey });
      expect(factory).to.be.calledOnceWith({ imodelAccess });
    });
  });

  describe("dispose", () => {
    it("unregisters listener from `SelectionStorage`", async () => {
      hiliteSetCache.dispose();
      provider.getHiliteSet.resetHistory();

      hiliteSetCache.getHiliteSet({ imodelKey });
      selectionStorage.clearSelection({ imodelKey, source: "test" });
      hiliteSetCache.getHiliteSet({ imodelKey });

      expect(provider.getHiliteSet).to.be.calledOnce;
    });
  });
});
