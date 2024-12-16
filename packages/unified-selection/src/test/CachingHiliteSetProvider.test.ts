/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import * as td from "testdouble";
import { ECClassHierarchyInspector, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import { createCachingHiliteSetProvider as origCreateCachingHiliteSetProvider } from "../unified-selection/CachingHiliteSetProvider.js";
import { HiliteSet, HiliteSetProvider, HiliteSetProviderProps } from "../unified-selection/HiliteSetProvider.js";
import { SelectableInstanceKey } from "../unified-selection/Selectable.js";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage.js";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

const generateSelection = (): SelectableInstanceKey[] => {
  return [createSelectableInstanceKey(1), createSelectableInstanceKey(2), createSelectableInstanceKey(3)];
};

describe("createCachingHiliteSetProvider", () => {
  let factory: sinon.SinonStub<[props: HiliteSetProviderProps], HiliteSetProvider>;
  let selectionStorage: SelectionStorage;
  let hiliteSetCache: ReturnType<typeof origCreateCachingHiliteSetProvider>;
  const provider = {
    getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<HiliteSet>>(),
  };
  const imodelProvider = sinon.stub<[string], ECClassHierarchyInspector & ECSqlQueryExecutor>();
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

  function stubIModelAccess(): sinon.SinonStubbedInstance<ECClassHierarchyInspector & ECSqlQueryExecutor> {
    return {
      createQueryReader: sinon.stub(),
      classDerivesFrom: sinon.stub(),
    };
  }

  beforeEach(async () => {
    factory = sinon.stub<[props: HiliteSetProviderProps], HiliteSetProvider>().returns(provider as unknown as HiliteSetProvider);
    await td.replaceEsm("../unified-selection/HiliteSetProvider.js", {
      createHiliteSetProvider: factory,
    });

    selectionStorage = createStorage();

    const { createCachingHiliteSetProvider } = await import("../unified-selection/CachingHiliteSetProvider.js");
    hiliteSetCache = createCachingHiliteSetProvider({
      selectionStorage,
      imodelProvider,
    });
    imodelProvider.returns(stubIModelAccess());
    selectionStorage.addToSelection({ imodelKey, source: "test", selectables: generateSelection() });

    provider.getHiliteSet.reset();
    provider.getHiliteSet.callsFake(() =>
      createAsyncIterator([
        { models: ["0x1"], subCategories: ["0x1"], elements: ["0x1"] },
        { models: ["0x2"], subCategories: ["0x2"], elements: ["0x2"] },
        { models: ["0x3"], subCategories: ["0x3"], elements: ["0x3"] },
      ]),
    );
  });

  afterEach(() => {
    td.reset();
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
      hiliteSetCache[Symbol.dispose]();
      provider.getHiliteSet.resetHistory();

      hiliteSetCache.getHiliteSet({ imodelKey });
      selectionStorage.clearSelection({ imodelKey, source: "test" });
      hiliteSetCache.getHiliteSet({ imodelKey });

      expect(provider.getHiliteSet).to.be.calledOnce;
    });
  });
});
