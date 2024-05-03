/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ResolvablePromise, waitFor } from "presentation-test-utilities";
import sinon from "sinon";
import { Id64Arg, using } from "@itwin/core-bentley";
import { EC, ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow } from "@itwin/presentation-shared";
import * as cachingHiliteSetProvider from "../unified-selection/CachingHiliteSetProvider";
import {
  enableUnifiedSelectionSyncWithIModel,
  EnableUnifiedSelectionSyncWithIModelProps,
  IModelSelectionHandler,
} from "../unified-selection/EnableUnifiedSelectionSyncWithIModel";
import * as hiliteSetProvider from "../unified-selection/HiliteSetProvider";
import { Selectable, SelectableInstanceKey, Selectables } from "../unified-selection/Selectable";
import { StorageSelectionChangesListener, StorageSelectionChangeType } from "../unified-selection/SelectionChangeEvent";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage";
import { CoreSelectionSetEventType, CoreSelectionSetEventUnsafe } from "../unified-selection/types/IModel";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

describe("enableUnifiedSelectionSyncWithIModel", () => {
  const selectionStorage = {
    selectionChangeEvent: {
      addListener: sinon.stub<[StorageSelectionChangesListener], () => void>(),
      removeListener: sinon.stub<[], void>(),
    },
  };
  const provider = {
    getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
    dispose: () => {},
  };
  const imodelAccess = {
    hiliteSet: {
      wantSyncWithSelectionSet: false,
      clear: () => {},
    },
    selectionSet: {
      emptyAll: () => {},
      onChanged: {
        addListener: () => () => {},
      },
    },
  };

  function resetListeners() {
    selectionStorage.selectionChangeEvent.addListener.reset();
    selectionStorage.selectionChangeEvent.removeListener.reset();
  }

  beforeEach(() => {
    async function* emptyGenerator() {}
    provider.getHiliteSet.reset();
    provider.getHiliteSet.callsFake(emptyGenerator);
    sinon.stub(cachingHiliteSetProvider, "createCachingHiliteSetProvider").returns(provider as unknown as cachingHiliteSetProvider.CachingHiliteSetProvider);

    resetListeners();
    selectionStorage.selectionChangeEvent.addListener.returns(selectionStorage.selectionChangeEvent.removeListener);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("creates and disposes IModelSelectionHandler", () => {
    const cleanup = enableUnifiedSelectionSyncWithIModel({
      imodelAccess: imodelAccess as unknown as EnableUnifiedSelectionSyncWithIModelProps["imodelAccess"],
      selectionStorage: selectionStorage as unknown as SelectionStorage,
      activeScopeProvider: () => "element",
    });

    expect(selectionStorage.selectionChangeEvent.addListener).to.be.calledOnce;
    expect(selectionStorage.selectionChangeEvent.removeListener).to.not.be.called;

    resetListeners();
    cleanup();

    expect(selectionStorage.selectionChangeEvent.addListener).to.not.be.called;
    expect(selectionStorage.selectionChangeEvent.removeListener).to.be.calledOnce;
  });
});

describe("IModelSelectionHandler", () => {
  let hiliteSetProviderFactory: sinon.SinonStub<[hiliteSetProvider.HiliteSetProviderProps], hiliteSetProvider.HiliteSetProvider>;
  let cachingHiliteSetProviderFactory: sinon.SinonStub<
    [cachingHiliteSetProvider.CachingHiliteSetProviderProps],
    cachingHiliteSetProvider.CachingHiliteSetProvider
  >;
  let handler: IModelSelectionHandler;
  const cachingProvider = {
    getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
    dispose: () => {},
  };
  const provider = {
    getHiliteSet: sinon.stub<[{ selectables: Selectables }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
  };

  const hiliteSet = {
    wantSyncWithSelectionSet: true,
    clear: sinon.stub<[], void>(),
    elements: {
      addIds: sinon.stub<[Id64Arg], void>(),
      deleteIds: sinon.stub<[Id64Arg], void>(),
    },
    models: {
      addIds: sinon.stub<[Id64Arg], void>(),
      deleteIds: sinon.stub<[Id64Arg], void>(),
    },
    subcategories: {
      addIds: sinon.stub<[Id64Arg], void>(),
      deleteIds: sinon.stub<[Id64Arg], void>(),
    },
  };

  const selectionSet = {
    emptyAll: sinon.stub<[], void>(),
    add: sinon.stub<[Id64Arg], boolean>(),
    remove: sinon.stub<[Id64Arg], boolean>(),
    elements: new Set<string>(),
    onChanged: {
      addListener: sinon.stub<[(ev: CoreSelectionSetEventUnsafe) => void], () => void>(),
      removeListener: () => true,
    },
  };

  const imodelAccess = {
    createQueryReader: sinon.stub<[ECSqlQueryDef, ECSqlQueryReaderOptions | undefined], ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
    getSchema: sinon.stub<[string], Promise<EC.Schema | undefined>>(),
    key: "test",
    hiliteSet,
    selectionSet,
  };

  function resetHiliteSetStub() {
    hiliteSet.clear.reset();
    hiliteSet.elements.addIds.reset();
    hiliteSet.elements.deleteIds.reset();
    hiliteSet.models.addIds.reset();
    hiliteSet.models.deleteIds.reset();
    hiliteSet.subcategories.addIds.reset();
    hiliteSet.subcategories.deleteIds.reset();
  }

  function resetSelectionSetStub() {
    selectionSet.emptyAll.reset();
    selectionSet.add.reset();
    selectionSet.remove.reset();
    selectionSet.onChanged.addListener.reset();
    selectionSet.onChanged.addListener.returns(() => {});
  }

  function resetCachingProviderStub() {
    async function* emptyGenerator() {}
    cachingProvider.getHiliteSet.reset();
    cachingProvider.getHiliteSet.callsFake(emptyGenerator);
  }

  function resetStubs() {
    resetCachingProviderStub();
    resetSelectionSetStub();
    resetHiliteSetStub();
  }

  function createHandler(storage: SelectionStorage): IModelSelectionHandler {
    resetStubs();

    const selectionHandler = new IModelSelectionHandler({
      imodelAccess,
      selectionStorage: storage,
      activeScopeProvider: () => "element",
    });

    return selectionHandler;
  }

  beforeEach(() => {
    cachingHiliteSetProviderFactory = sinon
      .stub(cachingHiliteSetProvider, "createCachingHiliteSetProvider")
      .returns(cachingProvider as unknown as cachingHiliteSetProvider.CachingHiliteSetProvider);

    hiliteSetProviderFactory = sinon.stub(hiliteSetProvider, "createHiliteSetProvider").returns(provider as unknown as hiliteSetProvider.HiliteSetProvider);
  });

  afterEach(() => {
    cachingHiliteSetProviderFactory.reset();
    hiliteSetProviderFactory.reset();
    handler.dispose();
    sinon.restore();
  });

  describe("reacting to core/tool selection changes", () => {
    let triggerSelectionChange: (ev: CoreSelectionSetEventUnsafe) => void;

    const selectionStorageStub = {
      addToSelection: sinon.spy(),
      removeFromSelection: sinon.spy(),
      clearSelection: sinon.spy(),
      selectionChangeEvent: { addListener: () => () => {} },
    };

    const toQueryResponse = (keys: SelectableInstanceKey[]) => {
      return keys.map((key) => ({ ["ClassName"]: key.className, ["ECInstanceId"]: key.id }));
    };

    async function* createFakeQueryReader<TRow extends {} = ECSqlQueryRow>(
      rows: (TRow | Promise<TRow>)[],
    ): ReturnType<ECSqlQueryExecutor["createQueryReader"]> {
      for await (const row of rows) {
        yield row;
      }
    }

    beforeEach(() => {
      handler = createHandler(selectionStorageStub as unknown as SelectionStorage);
      triggerSelectionChange = selectionSet.onChanged.addListener.getCall(0).args[0];

      cachingHiliteSetProviderFactory.resetHistory();
      resetStubs();
    });

    afterEach(() => {
      selectionStorageStub.addToSelection.resetHistory();
      selectionStorageStub.clearSelection.resetHistory();
      selectionStorageStub.removeFromSelection.resetHistory();
    });

    it("uses custom `CachingHiliteSetProvider` when provided", () => {
      async function* emptyGenerator() {}
      const customCachingHiliteSetProviderStub = {
        getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
        dispose: () => {},
      };
      customCachingHiliteSetProviderStub.getHiliteSet.callsFake(emptyGenerator);
      handler = new IModelSelectionHandler({
        imodelAccess,
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        activeScopeProvider: () => "element",
        cachingHiliteSetProvider: customCachingHiliteSetProviderStub,
      });

      expect(cachingHiliteSetProviderFactory).to.not.be.called;
      expect(customCachingHiliteSetProviderStub.getHiliteSet).to.be.calledOnce;
    });

    it("creates `CachingHiliteSetProvider` when not provided", () => {
      handler = new IModelSelectionHandler({
        imodelAccess,
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        activeScopeProvider: () => "element",
      });
      expect(cachingHiliteSetProviderFactory).to.be.calledOnceWith(
        sinon.match(
          (props: cachingHiliteSetProvider.CachingHiliteSetProviderProps) =>
            props.selectionStorage === (selectionStorageStub as unknown as SelectionStorage) && props.imodelProvider("not used") === imodelAccess,
        ),
      );
    });

    it("clears selection", async () => {
      triggerSelectionChange({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.clearSelection.calledWith({ imodelKey: imodelAccess.key, source: "Tool" })).to.be.true;
      });
    });

    it("adds elements to selection", async () => {
      const addedKeys = [createSelectableInstanceKey(1)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      triggerSelectionChange({ type: CoreSelectionSetEventType.Add, added: addedKeys[0].id, set: selectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.addToSelection.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: addedKeys })).to.be.true;
      });
    });

    it("removes elements from selection", async () => {
      const removedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(removedKeys)));

      triggerSelectionChange({ type: CoreSelectionSetEventType.Remove, removed: removedKeys.map((k) => k.id), set: selectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.removeFromSelection.getCall(0).calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: [removedKeys[0]] }))
          .to.be.true;
        expect(selectionStorageStub.removeFromSelection.getCall(1).calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: [removedKeys[1]] }))
          .to.be.true;
      });
    });

    it("replaces selection", async () => {
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      triggerSelectionChange({
        type: CoreSelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.clearSelection).to.be.calledOnceWith({ imodelKey: imodelAccess.key, source: "Tool" });
        expect(selectionStorageStub.addToSelection.getCall(0).calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: [addedKeys[0]] })).to.be
          .true;
        expect(selectionStorageStub.addToSelection.getCall(1).calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: [addedKeys[1]] })).to.be
          .true;
      });
    });

    it("ignores changes when suspended", async () => {
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      await using(handler.suspendIModelToolSelectionSync(), async (_) => {
        triggerSelectionChange({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });

        await waitFor(() => {
          expect(selectionStorageStub.clearSelection).to.not.be.called;
        });
      });
    });
  });

  describe("reacting to unified selection changes", () => {
    let selectionStorage: SelectionStorage;

    const generateSelection = (): SelectableInstanceKey[] => {
      return [createSelectableInstanceKey(1), createSelectableInstanceKey(2), createSelectableInstanceKey(3)];
    };

    beforeEach(() => {
      async function* emptyGenerator() {}
      provider.getHiliteSet.reset();
      provider.getHiliteSet.callsFake(emptyGenerator);

      selectionStorage = createStorage();
      selectionStorage.addToSelection({ imodelKey: imodelAccess.key, source: "Test", selectables: generateSelection() });
      handler = createHandler(selectionStorage);
      resetStubs();
    });

    afterEach(() => {
      selectionSet.emptyAll.reset();
      selectionSet.add.reset();
      selectionSet.remove.reset();
      imodelAccess.createQueryReader.reset();
    });

    const triggerSelectionChange = ({
      changeType = "replace",
      source = "",
      imodelKey = imodelAccess.key,
      selectables = [createSelectableInstanceKey()],
      level = 0,
    }: {
      imodelKey?: string;
      changeType?: StorageSelectionChangeType;
      source?: string;
      selectables?: Selectable[];
      level?: number;
    } = {}) => {
      switch (changeType) {
        case "add":
          selectionStorage.addToSelection({ imodelKey, source, selectables, level });
          return;
        case "remove":
          selectionStorage.removeFromSelection({ imodelKey, source, selectables, level });
          return;
        case "replace":
          selectionStorage.replaceSelection({ imodelKey, source, selectables, level });
          return;
        case "clear":
          selectionStorage.clearSelection({ imodelKey, source, level });
          return;
      }
    };

    it("applies hilite on current selection", async () => {
      const instanceKey = createSelectableInstanceKey();

      async function* generator() {
        yield {
          elements: [instanceKey.id],
        } as hiliteSetProvider.HiliteSet;
      }
      cachingProvider.getHiliteSet.callsFake(() => generator());

      handler = new IModelSelectionHandler({
        imodelAccess,
        selectionStorage,
        activeScopeProvider: () => "element",
      });

      await waitFor(() => {
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([instanceKey.id]);
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([instanceKey.id]);
      });
    });

    it("ignores selection changes to other imodels", async () => {
      triggerSelectionChange({ imodelKey: "otherIModel" });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.not.be.called;
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.not.be.called;
      });
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      triggerSelectionChange({ level: 1 });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.not.be.called;
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.not.be.called;
      });
    });

    it("clears selection set when hilite list is empty", async () => {
      async function* generator() {}
      cachingProvider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange({ changeType: "clear" });

      await waitFor(() => {
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.be.calledOnce;
      });
    });

    it("sets elements hilite after replace event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          elements: [id],
        } as hiliteSetProvider.HiliteSet;
      }
      cachingProvider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange();

      await waitFor(() => {
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([id]);
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([id]);
      });
    });

    it("sets models hilite after replace event", async () => {
      const id = "0x1";
      async function* generator() {
        yield {
          models: [id],
        } as hiliteSetProvider.HiliteSet;
      }
      cachingProvider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange();

      await waitFor(() => {
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(hiliteSet.models.addIds).to.be.calledOnceWith([id]);
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("sets subcategories hilite after replace event", async () => {
      const id = "0x1";
      async function* generator() {
        yield {
          subCategories: [id],
        } as hiliteSetProvider.HiliteSet;
      }
      cachingProvider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange();

      await waitFor(() => {
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith([id]);
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("sets combined hilite after replace event", async () => {
      const modelId = "0x1";
      const subCategoryId = "0x2";
      const elementId = "0x3";
      async function* generator() {
        yield {
          models: [modelId],
          subCategories: [subCategoryId],
          elements: [elementId],
        } as hiliteSetProvider.HiliteSet;
      }
      cachingProvider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange();

      await waitFor(() => {
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(hiliteSet.models.addIds).to.be.calledOnceWith([modelId]);
        expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith([subCategoryId]);
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([elementId]);
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([elementId]);
      });
    });

    it("adds elements to hilite after add event", async () => {
      const instanceKey = createSelectableInstanceKey(4);
      async function* generator() {
        yield {
          elements: [instanceKey.id],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }
      provider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange({ changeType: "add", selectables: [instanceKey] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([instanceKey.id]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([instanceKey.id]);
      });
    });

    it("adds models to hilite after add event", async () => {
      const instanceKey = createSelectableInstanceKey(4);
      async function* generator() {
        yield {
          elements: [],
          subCategories: [],
          models: [instanceKey.id],
        } as hiliteSetProvider.HiliteSet;
      }
      provider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange({ changeType: "add", selectables: [instanceKey] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.be.calledOnceWith([instanceKey.id]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("adds subcategories to hilite after add event", async () => {
      const instanceKey = createSelectableInstanceKey(4);
      async function* generator() {
        yield {
          elements: [],
          subCategories: [instanceKey.id],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }
      provider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange({ changeType: "add", selectables: [instanceKey] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith([instanceKey.id]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("removes elements from hilite after remove event", async () => {
      const instanceKey = createSelectableInstanceKey();
      async function* generator() {
        yield {
          elements: [instanceKey.id],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }
      provider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange({ changeType: "remove", selectables: [instanceKey] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.elements.deleteIds).to.be.calledOnceWith([instanceKey.id]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.be.calledOnceWith([instanceKey.id]);
      });
    });

    it("removes and re-adds elements to hilite after remove event", async () => {
      const removedIds = ["0x1", "0x2"];
      const hilitedId = "0x3";

      async function* removedGenerator() {
        yield {
          elements: removedIds,
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }
      async function* currentGenerator() {
        yield {
          elements: [hilitedId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }
      provider.getHiliteSet.callsFake(() => removedGenerator());
      cachingProvider.getHiliteSet.callsFake(() => currentGenerator());

      triggerSelectionChange({ changeType: "remove", selectables: removedIds.map((id) => ({ className: "TestSchema:TestClass", id })) });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.elements.deleteIds).to.be.calledOnceWith(removedIds);
        expect(hiliteSet.elements.addIds).to.be.calledAfter(hiliteSet.elements.deleteIds).and.calledOnceWith([hilitedId]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.be.calledOnceWith(removedIds);
        expect(selectionSet.add).to.be.calledAfter(selectionSet.remove).and.calledOnceWith([hilitedId]);
      });
    });

    it("removes and re-adds models to hilite after remove event", async () => {
      const removedIds = ["0x1", "0x2"];
      const hilitedId = "0x3";

      async function* removedGenerator() {
        yield {
          elements: [],
          subCategories: [],
          models: removedIds,
        } as hiliteSetProvider.HiliteSet;
      }

      async function* currentGenerator() {
        yield {
          elements: [],
          subCategories: [],
          models: [hilitedId],
        } as hiliteSetProvider.HiliteSet;
      }

      provider.getHiliteSet.callsFake(() => removedGenerator());
      cachingProvider.getHiliteSet.callsFake(() => currentGenerator());

      triggerSelectionChange({ changeType: "remove", selectables: removedIds.map((id) => ({ className: "TestSchema:TestClass", id })) });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.deleteIds).to.be.calledOnceWith(removedIds);
        expect(hiliteSet.models.addIds).to.be.calledAfter(hiliteSet.models.deleteIds).and.calledOnceWith([hilitedId]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("removes and re-adds subcategories to hilite after remove event", async () => {
      const removedIds = ["0x1", "0x2"];
      const hilitedId = "0x3";

      async function* removedGenerator() {
        yield {
          elements: [],
          subCategories: removedIds,
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }

      async function* currentGenerator() {
        yield {
          subCategories: [hilitedId],
        } as hiliteSetProvider.HiliteSet;
      }

      provider.getHiliteSet.callsFake(() => removedGenerator());
      cachingProvider.getHiliteSet.callsFake(() => currentGenerator());

      triggerSelectionChange({ changeType: "remove", selectables: removedIds.map((id) => ({ className: "TestSchema:TestClass", id })) });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.subcategories.deleteIds).to.be.calledOnceWith(removedIds);
        expect(hiliteSet.subcategories.addIds).to.be.calledAfter(hiliteSet.subcategories.deleteIds).and.calledOnceWith([hilitedId]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("handles hilite set in batches", async () => {
      const firstElementId = "0x1";
      const secondElementId = "0x2";
      const firstResult = new ResolvablePromise<hiliteSetProvider.HiliteSet>();
      const secondResult = new ResolvablePromise<hiliteSetProvider.HiliteSet>();

      async function* generator() {
        yield await firstResult;
        yield await secondResult;
      }
      cachingProvider.getHiliteSet.reset();
      cachingProvider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange();

      await waitFor(() => {
        expect(hiliteSet.clear).to.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.not.be.called;
      });

      resetHiliteSetStub();
      await firstResult.resolve({ elements: [firstElementId], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([firstElementId]);
      });

      resetHiliteSetStub();
      await secondResult.resolve({ elements: [secondElementId], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([secondElementId]);
      });
    });

    it("cancels ongoing selection change handling when selection replaced", async () => {
      const initialElementId = "0x1";
      const result = new ResolvablePromise<hiliteSetProvider.HiliteSet>();
      async function* initialGenerator() {
        yield {
          elements: [initialElementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
        yield await result;
      }

      cachingProvider.getHiliteSet.reset();
      cachingProvider.getHiliteSet.callsFake(() => initialGenerator());

      triggerSelectionChange({ source: "initial", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.be.calledOnce;
        expect(hiliteSet.clear).to.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([initialElementId]);
      });

      resetHiliteSetStub();

      const newElementId = "0x3";
      async function* secondGenerator() {
        yield {
          elements: [newElementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }

      cachingProvider.getHiliteSet.reset();
      cachingProvider.getHiliteSet.callsFake(() => secondGenerator());

      triggerSelectionChange({ source: "next", selectables: [{ className: "BisCore.Element", id: newElementId }] });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.be.calledOnce;
        expect(hiliteSet.clear).to.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([newElementId]);
      });

      resetHiliteSetStub();
      await result.resolve({ elements: ["0x2"], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.not.be.called;
      });
    });

    it("cancels ongoing selection change handling when selection cleared", async () => {
      const initialElementId = "0x1";
      const result = new ResolvablePromise<hiliteSetProvider.HiliteSet>();
      async function* initialGenerator() {
        yield {
          elements: [initialElementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
        yield await result;
      }

      cachingProvider.getHiliteSet.reset();
      cachingProvider.getHiliteSet.callsFake(() => initialGenerator());

      triggerSelectionChange({ source: "initial", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.be.calledOnce;
        expect(hiliteSet.clear).to.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([initialElementId]);
      });

      resetHiliteSetStub();

      const newElementId = "0x3";
      async function* secondGenerator() {
        yield {
          elements: [newElementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }

      cachingProvider.getHiliteSet.reset();
      cachingProvider.getHiliteSet.callsFake(() => secondGenerator());

      triggerSelectionChange({ source: "next", changeType: "clear", selectables: [{ className: "BisCore.Element", id: newElementId }] });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.be.calledOnce;
        expect(hiliteSet.clear).to.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([newElementId]);
      });

      resetHiliteSetStub();
      await result.resolve({ elements: ["0x2"], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.not.be.called;
      });
    });

    it("does not cancel ongoing changes when added or removed from selection", async () => {
      const initialElementId = "0x1";
      const result = new ResolvablePromise<hiliteSetProvider.HiliteSet>();
      async function* initialGenerator() {
        yield {
          elements: [initialElementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
        yield await result;
      }

      cachingProvider.getHiliteSet.reset();
      cachingProvider.getHiliteSet.callsFake(() => initialGenerator());

      triggerSelectionChange({ source: "initial", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.be.calledOnce;
        expect(hiliteSet.clear).to.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([initialElementId]);
      });

      cachingProvider.getHiliteSet.reset();
      resetHiliteSetStub();

      const newElementId = "0x3";
      async function* secondGenerator() {
        yield {
          elements: [newElementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }

      provider.getHiliteSet.reset();
      provider.getHiliteSet.callsFake(() => secondGenerator());

      triggerSelectionChange({ source: "next", changeType: "add", selectables: [{ className: "BisCore.Element", id: newElementId }] });

      await waitFor(() => {
        expect(provider.getHiliteSet).to.be.calledOnce;
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([newElementId]);
      });

      resetHiliteSetStub();

      async function* thirdGenerator() {
        yield {
          elements: [initialElementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }

      provider.getHiliteSet.reset();
      provider.getHiliteSet.callsFake(() => thirdGenerator());

      cachingProvider.getHiliteSet.reset();
      cachingProvider.getHiliteSet.callsFake(() => secondGenerator());

      triggerSelectionChange({ source: "next", changeType: "remove", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

      await waitFor(() => {
        expect(provider.getHiliteSet).to.be.calledOnce;
        expect(cachingProvider.getHiliteSet).to.be.calledOnce;
        expect(hiliteSet.clear).to.not.be.called;
        expect(hiliteSet.models.deleteIds).to.not.be.called;
        expect(hiliteSet.subcategories.deleteIds).to.not.be.called;
        expect(hiliteSet.elements.deleteIds).to.be.calledOnceWith([initialElementId]);
      });

      resetHiliteSetStub();
      await result.resolve({ elements: ["0x2"], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hiliteSet.models.addIds).to.not.be.called;
        expect(hiliteSet.subcategories.addIds).to.not.be.called;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith(["0x2"]);
      });
    });

    it("does not clear selection set if unified selection change was caused by viewport", async () => {
      const elementId = "0x1";
      async function* generator() {
        yield {
          elements: [elementId],
          subCategories: [],
          models: [],
        } as hiliteSetProvider.HiliteSet;
      }

      cachingProvider.getHiliteSet.callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ source: "Tool" });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(hiliteSet.elements.addIds).to.be.calledOnceWith([elementId]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([elementId]);
      });
    });
  });
});
