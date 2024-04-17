/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ResolvablePromise, waitFor } from "presentation-test-utilities";
import sinon from "sinon";
import { using } from "@itwin/core-bentley";
import * as hiliteSetProvider from "../../unified-selection/HiliteSetProvider";
import { IdArg, IModelConnection, SelectionSet, SelectionSetEvent, SelectionSetEventType } from "../../unified-selection/iModel/IModel";
import { IModelSelectionHandler } from "../../unified-selection/iModel/IModelSelectionHandler";
import { IMetadataProvider } from "../../unified-selection/queries/ECMetadata";
import { ECSqlBinding, ECSqlQueryReader, ECSqlQueryReaderOptions, ECSqlQueryRow } from "../../unified-selection/queries/ECSqlCore";
import { Selectable, SelectableInstanceKey, Selectables } from "../../unified-selection/Selectable";
import { StorageSelectionChangeType } from "../../unified-selection/SelectionChangeEvent";
import { createStorage, SelectionStorage } from "../../unified-selection/SelectionStorage";
import { createSelectableInstanceKey } from "../_helpers/SelectablesCreator";

describe("IModelSelectionHandler", () => {
  let factory: sinon.SinonStub<[hiliteSetProvider.HiliteSetProviderProps], hiliteSetProvider.HiliteSetProvider>;
  let handler: IModelSelectionHandler;
  const cachingProvider = {
    getHiliteSet: sinon.stub<[{ iModelKey: string }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
    dispose: () => {},
  };
  const provider = {
    getHiliteSet: sinon.stub<[{ selectables: Selectables }], AsyncIterableIterator<hiliteSetProvider.HiliteSet>>(),
  };
  const queryExecutor = {
    createQueryReader: sinon.stub<[string, ECSqlBinding[] | undefined, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
  };

  const hilited = {
    clear: sinon.stub<[], void>(),
    elements: {
      addIds: sinon.stub<[IdArg], void>(),
      deleteIds: sinon.stub<[IdArg], void>(),
    },
    models: {
      addIds: sinon.stub<[IdArg], void>(),
      deleteIds: sinon.stub<[IdArg], void>(),
    },
    subcategories: {
      addIds: sinon.stub<[IdArg], void>(),
      deleteIds: sinon.stub<[IdArg], void>(),
    },
  };

  const selectionSet = {
    iModel: {} as IModelConnection,
    emptyAll: sinon.stub<[], void>(),
    add: sinon.stub<[IdArg], void>(),
    remove: sinon.stub<[IdArg], void>(),
    onChanged: {
      addListener: sinon.stub<[(ev: SelectionSetEvent) => void], () => void>(),
    },
  };

  const iModel = {
    key: "iModel",
    hilited,
    selectionSet,
  } as unknown as IModelConnection;

  function resetHilitedStub() {
    hilited.clear.reset();
    hilited.elements.addIds.reset();
    hilited.elements.deleteIds.reset();
    hilited.models.addIds.reset();
    hilited.models.deleteIds.reset();
    hilited.subcategories.addIds.reset();
    hilited.subcategories.deleteIds.reset();
  }

  function resetSelectionSetStub() {
    selectionSet.emptyAll.reset();
    selectionSet.add.reset();
    selectionSet.remove.reset();
    selectionSet.onChanged.addListener.reset();
    selectionSet.onChanged.addListener.returns(() => {});
  }

  function resetProviderStub() {
    async function* emptyGenerator() {}
    cachingProvider.getHiliteSet.reset();
    cachingProvider.getHiliteSet.callsFake(emptyGenerator);
  }

  function createHandler(storage: SelectionStorage): IModelSelectionHandler {
    resetProviderStub();
    resetSelectionSetStub();
    resetHilitedStub();
    return new IModelSelectionHandler({
      iModel,
      selectionStorage: storage,
      cachingHiliteSetProvider: cachingProvider,
      queryExecutor,
      metadataProvider: {} as IMetadataProvider,
      activeScopeProvider: () => "element",
    });
  }

  describe("reacting to iModel selection changes", () => {
    let triggerSelectionChange: (ev: SelectionSetEvent) => void;

    const selectionStorageStub = {
      addToSelection: sinon.spy(),
      removeFromSelection: sinon.spy(),
      clearSelection: sinon.spy(),
      selectionChangeEvent: { addListener: () => () => {} },
    };

    const toQueryResponse = (keys: SelectableInstanceKey[]) => {
      return keys.map((key) => ({ ["ClassName"]: key.className, ["ECInstanceId"]: key.id }));
    };

    async function* createFakeQueryReader<TRow extends {} = ECSqlQueryRow>(rows: (TRow | Promise<TRow>)[]): ECSqlQueryReader {
      for await (const row of rows) {
        yield row;
      }
    }

    beforeEach(() => {
      selectionSet.iModel = iModel;
      handler = createHandler(selectionStorageStub as unknown as SelectionStorage);
      triggerSelectionChange = selectionSet.onChanged.addListener.getCall(0).args[0];
    });

    afterEach(() => {
      selectionStorageStub.addToSelection.resetHistory();
      selectionStorageStub.clearSelection.resetHistory();
      selectionStorageStub.removeFromSelection.resetHistory();
      handler.dispose();
    });

    it("clears selection", async () => {
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      queryExecutor.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      triggerSelectionChange({ type: SelectionSetEventType.Clear, removed: [], set: selectionSet as unknown as SelectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.clearSelection.calledWith({ iModelKey: iModel.key, source: "Tool" })).to.be.true;
      });
    });

    it("adds elements to selection", async () => {
      const addedKeys = [createSelectableInstanceKey(1)];
      queryExecutor.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      triggerSelectionChange({ type: SelectionSetEventType.Add, added: addedKeys[0].id, set: selectionSet as unknown as SelectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.addToSelection.calledWith({ iModelKey: iModel.key, source: "Tool", selectables: addedKeys })).to.be.true;
      });
    });

    it("removes elements from selection", async () => {
      const removedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      queryExecutor.createQueryReader.returns(createFakeQueryReader(toQueryResponse(removedKeys)));

      triggerSelectionChange({ type: SelectionSetEventType.Remove, removed: removedKeys.map((k) => k.id), set: selectionSet as unknown as SelectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.removeFromSelection.getCall(0).calledWith({ iModelKey: iModel.key, source: "Tool", selectables: [removedKeys[0]] })).to.be
          .true;
        expect(selectionStorageStub.removeFromSelection.getCall(1).calledWith({ iModelKey: iModel.key, source: "Tool", selectables: [removedKeys[1]] })).to.be
          .true;
      });
    });

    it("replaces selection", async () => {
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      queryExecutor.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      triggerSelectionChange({
        type: SelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet as unknown as SelectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.clearSelection).to.be.calledOnceWith({ iModelKey: iModel.key, source: "Tool" });
        expect(selectionStorageStub.addToSelection.getCall(0).calledWith({ iModelKey: iModel.key, source: "Tool", selectables: [addedKeys[0]] })).to.be.true;
        expect(selectionStorageStub.addToSelection.getCall(1).calledWith({ iModelKey: iModel.key, source: "Tool", selectables: [addedKeys[1]] })).to.be.true;
      });
    });

    it("ignores changes of other iModels", async () => {
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      queryExecutor.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      selectionSet.iModel = {} as IModelConnection;
      triggerSelectionChange({ type: SelectionSetEventType.Clear, removed: [], set: selectionSet as unknown as SelectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.clearSelection).to.not.be.called;
      });
    });

    it("ignores changes when suspended", async () => {
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      queryExecutor.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      await using(handler.suspendIModelToolSelectionSync(), async (_) => {
        triggerSelectionChange({ type: SelectionSetEventType.Clear, removed: [], set: selectionSet as unknown as SelectionSet });

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
      factory = sinon.stub(hiliteSetProvider, "createHiliteSetProvider").returns(provider as unknown as hiliteSetProvider.HiliteSetProvider);

      selectionSet.iModel = iModel;
      selectionStorage = createStorage();
      selectionStorage.addToSelection({ iModelKey: "iModel", source: "Test", selectables: generateSelection() });
      handler = createHandler(selectionStorage);
      resetProviderStub();
      resetSelectionSetStub();
      resetHilitedStub();
    });

    afterEach(() => {
      selectionSet.emptyAll.reset();
      selectionSet.add.reset();
      selectionSet.remove.reset();
      queryExecutor.createQueryReader.reset();
      handler.dispose();
      factory.restore();
      sinon.restore();
    });

    const triggerSelectionChange = ({
      changeType = "replace",
      source = "",
      iModelKey = "iModel",
      selectables = [createSelectableInstanceKey()],
      level = 0,
    }: {
      iModelKey?: string;
      changeType?: StorageSelectionChangeType;
      source?: string;
      selectables?: Selectable[];
      level?: number;
    } = {}) => {
      switch (changeType) {
        case "add":
          selectionStorage.addToSelection({ iModelKey, source, selectables, level });
          return;
        case "remove":
          selectionStorage.removeFromSelection({ iModelKey, source, selectables, level });
          return;
        case "replace":
          selectionStorage.replaceSelection({ iModelKey, source, selectables, level });
          return;
        case "clear":
          selectionStorage.clearSelection({ iModelKey, source, level });
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
        iModel,
        selectionStorage,
        cachingHiliteSetProvider: cachingProvider,
        queryExecutor,
        metadataProvider: {} as IMetadataProvider,
        activeScopeProvider: () => "element",
      });

      await waitFor(() => {
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.elements.addIds).to.be.calledOnceWith([instanceKey.id]);
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([instanceKey.id]);
      });
    });

    it("ignores selection changes to other imodels", async () => {
      triggerSelectionChange({ iModelKey: "otherIModel" });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.not.be.called;
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.not.be.called;
      });
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      triggerSelectionChange({ level: 1 });

      await waitFor(() => {
        expect(cachingProvider.getHiliteSet).to.not.be.called;
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.not.be.called;
      });
    });

    it("clears selection set when hilite list is empty", async () => {
      async function* generator() {}
      cachingProvider.getHiliteSet.callsFake(() => generator());

      triggerSelectionChange({ changeType: "clear" });

      await waitFor(() => {
        expect(hilited.clear).to.be.calledOnce;
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
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.elements.addIds).to.be.calledOnceWith([id]);
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
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.models.addIds).to.be.calledOnceWith([id]);
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.not.be.calledOnce;
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
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.subcategories.addIds).to.be.calledOnceWith([id]);
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.not.be.calledOnce;
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
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.models.addIds).to.be.calledOnceWith([modelId]);
        expect(hilited.subcategories.addIds).to.be.calledOnceWith([subCategoryId]);
        expect(hilited.elements.addIds).to.be.calledOnceWith([elementId]);
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
        expect(hilited.clear).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([instanceKey.id]);
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
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.be.calledOnceWith([instanceKey.id]);
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
        expect(hilited.clear).to.not.be.called;
        expect(hilited.subcategories.addIds).to.be.calledOnceWith([instanceKey.id]);
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
        expect(hilited.clear).to.not.be.called;
        expect(hilited.elements.deleteIds).to.be.calledOnceWith([instanceKey.id]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.be.calledOnceWith([instanceKey.id]);
      });
    });

    it("removes and reads elements to hilite after remove event", async () => {
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
        expect(hilited.clear).to.not.be.called;
        expect(hilited.elements.deleteIds).to.be.calledOnceWith(removedIds);
        expect(hilited.elements.addIds).to.be.calledAfter(hilited.elements.deleteIds).and.calledOnceWith([hilitedId]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.be.calledOnceWith(removedIds);
        expect(selectionSet.add).to.be.calledAfter(selectionSet.remove).and.calledOnceWith([hilitedId]);
      });
    });

    it("removes and reads models to hilite after remove event", async () => {
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
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.deleteIds).to.be.calledOnceWith(removedIds);
        expect(hilited.models.addIds).to.be.calledAfter(hilited.models.deleteIds).and.calledOnceWith([hilitedId]);
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("removes and reads subcategories to hilite after remove event", async () => {
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
        expect(hilited.clear).to.not.be.called;
        expect(hilited.subcategories.deleteIds).to.be.calledOnceWith(removedIds);
        expect(hilited.subcategories.addIds).to.be.calledAfter(hilited.subcategories.deleteIds).and.calledOnceWith([hilitedId]);
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
        expect(hilited.clear).to.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.not.be.called;
      });

      resetHilitedStub();
      await firstResult.resolve({ elements: [firstElementId], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([firstElementId]);
      });

      resetHilitedStub();
      await secondResult.resolve({ elements: [secondElementId], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([secondElementId]);
      });
    });

    it("cancels ongoing selection change handling when selection changes again", async () => {
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
        expect(hilited.clear).to.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([initialElementId]);
      });

      resetHilitedStub();

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
        expect(hilited.clear).to.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([newElementId]);
      });

      resetHilitedStub();
      await result.resolve({ elements: ["0x2"], models: [], subCategories: [] });

      await waitFor(() => {
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.not.be.called;
      });
    });
  });
});
