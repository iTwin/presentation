/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator, ResolvablePromise, waitFor } from "presentation-test-utilities";
import sinon from "sinon";
import { BeEvent, Id64Arg, using } from "@itwin/core-bentley";
import { ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow } from "@itwin/presentation-shared";
import { CachingHiliteSetProvider, CachingHiliteSetProviderProps } from "../unified-selection/CachingHiliteSetProvider.js";
import * as cachingHiliteSetProvider from "../unified-selection/CachingHiliteSetProvider.js";
import {
  enableUnifiedSelectionSyncWithIModel,
  EnableUnifiedSelectionSyncWithIModelProps,
  IModelSelectionHandler,
} from "../unified-selection/EnableUnifiedSelectionSyncWithIModel.js";
import { HiliteSet, HiliteSetProvider, HiliteSetProviderProps } from "../unified-selection/HiliteSetProvider.js";
import * as hiliteSetProvider from "../unified-selection/HiliteSetProvider.js";
import { Selectable, SelectableInstanceKey, Selectables } from "../unified-selection/Selectable.js";
import { StorageSelectionChangesListener, StorageSelectionChangeType } from "../unified-selection/SelectionChangeEvent.js";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage.js";
import { CoreSelectionSetEventType } from "../unified-selection/types/IModel.js";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

describe("enableUnifiedSelectionSyncWithIModel", () => {
  const selectionStorage = {
    selectionChangeEvent: {
      addListener: sinon.stub<[StorageSelectionChangesListener], () => void>(),
      removeListener: sinon.stub<[], void>(),
    },
  };
  const provider = {
    getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<HiliteSet>>(),
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

  beforeEach(async () => {
    provider.getHiliteSet.reset();
    provider.getHiliteSet.callsFake(() => createAsyncIterator([]));

    sinon.stub(cachingHiliteSetProvider, "createCachingHiliteSetProvider").returns(provider as unknown as cachingHiliteSetProvider.CachingHiliteSetProvider);

    resetListeners();
    selectionStorage.selectionChangeEvent.addListener.returns(selectionStorage.selectionChangeEvent.removeListener);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("creates and disposes IModelSelectionHandler", async () => {
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
  let hiliteSetProviderFactory: sinon.SinonStub<[HiliteSetProviderProps], HiliteSetProvider>;
  let cachingHiliteSetProviderFactory: sinon.SinonStub<[CachingHiliteSetProviderProps], CachingHiliteSetProvider>;

  const cachingProvider = {
    getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<HiliteSet>>(),
    dispose: () => {},
  };

  const provider = {
    getHiliteSet: sinon.stub<[{ selectables: Selectables }], AsyncIterableIterator<HiliteSet>>(),
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
    onChanged: new BeEvent(),
  };

  const imodelAccess = {
    createQueryReader: sinon.stub<[ECSqlQueryDef, ECSqlQueryReaderOptions | undefined], ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
    classDerivesFrom: sinon.stub<[string, string], Promise<boolean> | boolean>(),
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

  async function createHandler(props: Partial<EnableUnifiedSelectionSyncWithIModelProps> & { selectionStorage: SelectionStorage }) {
    const selectionHandler = new IModelSelectionHandler({
      imodelAccess,
      activeScopeProvider: () => "element",
      ...props,
    });
    return selectionHandler;
  }

  beforeEach(async () => {
    cachingHiliteSetProviderFactory = sinon
      .stub(cachingHiliteSetProvider, "createCachingHiliteSetProvider")
      .returns(cachingProvider as unknown as cachingHiliteSetProvider.CachingHiliteSetProvider);

    hiliteSetProviderFactory = sinon.stub(hiliteSetProvider, "createHiliteSetProvider").returns(provider as unknown as hiliteSetProvider.HiliteSetProvider);
  });

  afterEach(() => {
    hiliteSetProviderFactory.reset();
    cachingHiliteSetProviderFactory.reset();
    resetStubs();
    sinon.restore();
  });

  describe("reacting to core/tool selection changes", () => {
    const selectionStorageStub = {
      addToSelection: sinon.spy(),
      removeFromSelection: sinon.spy(),
      replaceSelection: sinon.spy(),
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
      cachingHiliteSetProviderFactory.resetHistory();
      resetStubs();
    });

    afterEach(() => {
      selectionStorageStub.addToSelection.resetHistory();
      selectionStorageStub.clearSelection.resetHistory();
      selectionStorageStub.replaceSelection.resetHistory();
      selectionStorageStub.removeFromSelection.resetHistory();
    });

    it("uses custom `CachingHiliteSetProvider` when provided", async () => {
      async function* emptyGenerator() {}
      const customCachingHiliteSetProviderStub = {
        getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<HiliteSet>>(),
        dispose: () => {},
      };
      customCachingHiliteSetProviderStub.getHiliteSet.callsFake(emptyGenerator);
      using(
        await createHandler({
          selectionStorage: selectionStorageStub as unknown as SelectionStorage,
          cachingHiliteSetProvider: customCachingHiliteSetProviderStub,
        }),
        (_) => {
          expect(cachingHiliteSetProviderFactory).to.not.be.called;
          expect(customCachingHiliteSetProviderStub.getHiliteSet).to.be.calledOnce;
        },
      );
    });

    it("creates `CachingHiliteSetProvider` when not provided", async () => {
      using(
        await createHandler({
          selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        }),
        (_) => {
          expect(cachingHiliteSetProviderFactory).to.be.calledOnceWith(
            sinon.match(
              (props: CachingHiliteSetProviderProps) =>
                props.selectionStorage === (selectionStorageStub as unknown as SelectionStorage) && props.imodelProvider("not used") === imodelAccess,
            ),
          );
        },
      );
    });

    it("clears selection", async () => {
      await using(
        await createHandler({
          selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        }),
        async (_) => {
          selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });
          await waitFor(() => {
            expect(selectionStorageStub.clearSelection.calledWith({ imodelKey: imodelAccess.key, source: "Tool" })).to.be.true;
          });
        },
      );
    });

    it("adds elements to selection", async () => {
      await using(
        await createHandler({
          selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        }),
        async (_) => {
          const addedKeys = [createSelectableInstanceKey(1)];
          imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

          selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Add, added: addedKeys[0].id, set: selectionSet });

          await waitFor(() => {
            expect(selectionStorageStub.addToSelection.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: addedKeys })).to.be.true;
          });
        },
      );
    });

    it("removes elements from selection", async () => {
      await using(
        await createHandler({
          selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        }),
        async (_) => {
          const removedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
          imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(removedKeys)));

          selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Remove, removed: removedKeys.map((k) => k.id), set: selectionSet });

          await waitFor(() => {
            expect(selectionStorageStub.removeFromSelection.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: removedKeys })).to.be.true;
          });
        },
      );
    });

    it("replaces selection", async () => {
      await using(
        await createHandler({
          selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        }),
        async (_) => {
          const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
          imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

          selectionSet.onChanged.raiseEvent({
            type: CoreSelectionSetEventType.Replace,
            added: new Set<string>(addedKeys.map((k) => k.id)),
            removed: [],
            set: selectionSet,
          });

          await waitFor(() => {
            expect(selectionStorageStub.replaceSelection.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: addedKeys })).to.be.true;
          });
        },
      );
    });

    it("ignores changes when suspended", async () => {
      await using(
        await createHandler({
          selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        }),
        async (handler) => {
          const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
          imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

          await using(handler.suspendIModelToolSelectionSync(), async (_) => {
            selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });

            await waitFor(() => {
              expect(selectionStorageStub.clearSelection).to.not.be.called;
            });
          });
        },
      );
    });
  });

  describe("reacting to unified selection changes", () => {
    let selectionStorage: SelectionStorage;

    const generateSelection = (): SelectableInstanceKey[] => {
      return [createSelectableInstanceKey(1), createSelectableInstanceKey(2), createSelectableInstanceKey(3)];
    };

    beforeEach(() => {
      provider.getHiliteSet.reset();
      provider.getHiliteSet.callsFake(() => createAsyncIterator([]));

      selectionStorage = createStorage();
      selectionStorage.addToSelection({ imodelKey: imodelAccess.key, source: "Test", selectables: generateSelection() });
      resetStubs();
    });

    afterEach(() => {
      selectionSet.emptyAll.reset();
      selectionSet.add.reset();
      selectionSet.remove.reset();
      imodelAccess.createQueryReader.reset();
    });

    const triggerUnifiedSelectionChange = ({
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

    it("applies hilite on current selection on create", async () => {
      const instanceKey = createSelectableInstanceKey();

      cachingProvider.getHiliteSet.callsFake(() =>
        createAsyncIterator([
          {
            elements: [instanceKey.id],
            models: [],
            subCategories: [],
          } satisfies HiliteSet,
        ]),
      );

      await using(await createHandler({ selectionStorage }), async (_) => {
        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(hiliteSet.elements.addIds).to.be.calledOnceWith([instanceKey.id]);
          expect(selectionSet.emptyAll).to.be.called;
          expect(selectionSet.add).to.be.calledOnceWith([instanceKey.id]);
        });
      });
    });

    it("ignores selection changes to other imodels", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();
        triggerUnifiedSelectionChange({ imodelKey: "otherIModel" });
        await waitFor(() => {
          expect(cachingProvider.getHiliteSet).to.not.be.called;
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.models.addIds).to.not.be.called;
          expect(hiliteSet.subcategories.addIds).to.not.be.called;
          expect(hiliteSet.elements.addIds).to.not.be.called;
        });
      });
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();
        triggerUnifiedSelectionChange({ level: 1 });
        await waitFor(() => {
          expect(cachingProvider.getHiliteSet).to.not.be.called;
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.models.addIds).to.not.be.called;
          expect(hiliteSet.subcategories.addIds).to.not.be.called;
          expect(hiliteSet.elements.addIds).to.not.be.called;
        });
      });
    });

    it("clears selection set when hilite list is empty", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        cachingProvider.getHiliteSet.callsFake(() => createAsyncIterator([]));
        triggerUnifiedSelectionChange({ changeType: "clear" });

        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(selectionSet.emptyAll).to.be.calledOnce;
        });
      });
    });

    it("sets elements hilite after replace event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const id = "0x2";
        cachingProvider.getHiliteSet.callsFake(() => createAsyncIterator([{ elements: [id], models: [], subCategories: [] }]));

        triggerUnifiedSelectionChange();

        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(hiliteSet.elements.addIds).to.be.calledOnceWith([id]);
          expect(selectionSet.emptyAll).to.be.called;
          expect(selectionSet.add).to.be.calledOnceWith([id]);
        });
      });
    });

    it("sets models hilite after replace event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const id = "0x1";
        cachingProvider.getHiliteSet.callsFake(() => createAsyncIterator([{ models: [id], subCategories: [], elements: [] }]));

        triggerUnifiedSelectionChange();

        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(hiliteSet.models.addIds).to.be.calledOnceWith([id]);
          expect(selectionSet.emptyAll).to.be.calledOnce;
          expect(selectionSet.add).to.not.be.called;
        });
      });
    });

    it("sets subcategories hilite after replace event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const id = "0x1";
        cachingProvider.getHiliteSet.callsFake(() => createAsyncIterator([{ subCategories: [id], models: [], elements: [] }]));

        triggerUnifiedSelectionChange();

        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith([id]);
          expect(selectionSet.emptyAll).to.be.calledOnce;
          expect(selectionSet.add).to.not.be.called;
        });
      });
    });

    it("sets combined hilite after replace event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const modelId = "0x1";
        const subCategoryId = "0x2";
        const elementId = "0x3";
        cachingProvider.getHiliteSet.callsFake(() => createAsyncIterator([{ models: [modelId], subCategories: [subCategoryId], elements: [elementId] }]));

        triggerUnifiedSelectionChange();

        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(hiliteSet.models.addIds).to.be.calledOnceWith([modelId]);
          expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith([subCategoryId]);
          expect(hiliteSet.elements.addIds).to.be.calledOnceWith([elementId]);
          expect(selectionSet.emptyAll).to.be.called;
          expect(selectionSet.add).to.be.calledOnceWith([elementId]);
        });
      });
    });

    it("adds elements to hilite after add event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const instanceKey = createSelectableInstanceKey(4);
        provider.getHiliteSet.callsFake(() => createAsyncIterator([{ elements: [instanceKey.id], models: [], subCategories: [] }]));

        triggerUnifiedSelectionChange({ changeType: "add", selectables: [instanceKey] });

        await waitFor(() => {
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.elements.addIds).to.be.calledOnceWith([instanceKey.id]);
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.add).to.be.calledOnceWith([instanceKey.id]);
        });
      });
    });

    it("adds models to hilite after add event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const instanceKey = createSelectableInstanceKey(4);
        provider.getHiliteSet.callsFake(() => createAsyncIterator([{ models: [instanceKey.id], subCategories: [], elements: [] }]));

        triggerUnifiedSelectionChange({ changeType: "add", selectables: [instanceKey] });

        await waitFor(() => {
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.models.addIds).to.be.calledOnceWith([instanceKey.id]);
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.not.be.called;
          expect(selectionSet.add).to.not.be.called;
        });
      });
    });

    it("adds subcategories to hilite after add event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const instanceKey = createSelectableInstanceKey(4);
        provider.getHiliteSet.callsFake(() => createAsyncIterator([{ subCategories: [instanceKey.id], models: [], elements: [] }]));

        triggerUnifiedSelectionChange({ changeType: "add", selectables: [instanceKey] });

        await waitFor(() => {
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith([instanceKey.id]);
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.not.be.called;
          expect(selectionSet.add).to.not.be.called;
        });
      });
    });

    it("removes elements from hilite after remove event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const instanceKey = createSelectableInstanceKey();
        provider.getHiliteSet.callsFake(() => createAsyncIterator([{ elements: [instanceKey.id], models: [], subCategories: [] }]));

        triggerUnifiedSelectionChange({ changeType: "remove", selectables: [instanceKey] });

        await waitFor(() => {
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.elements.deleteIds).to.be.calledOnceWith([instanceKey.id]);
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.be.calledOnceWith([instanceKey.id]);
        });
      });
    });

    it("removes and re-adds elements to hilite after remove event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const removedIds = ["0x1", "0x2"];
        const hilitedId = "0x3";

        provider.getHiliteSet.callsFake(() =>
          createAsyncIterator([
            {
              elements: removedIds,
              subCategories: [],
              models: [],
            } satisfies HiliteSet,
          ]),
        );
        cachingProvider.getHiliteSet.callsFake(() =>
          createAsyncIterator([
            {
              elements: [hilitedId],
              subCategories: [],
              models: [],
            } satisfies HiliteSet,
          ]),
        );

        triggerUnifiedSelectionChange({ changeType: "remove", selectables: removedIds.map((id) => ({ className: "TestSchema:TestClass", id })) });

        await waitFor(() => {
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.elements.deleteIds).to.be.calledOnceWith(removedIds);
          expect(hiliteSet.elements.addIds).to.be.calledAfter(hiliteSet.elements.deleteIds).and.calledOnceWith([hilitedId]);
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.be.calledOnceWith(removedIds);
          expect(selectionSet.add).to.be.calledAfter(selectionSet.remove).and.calledOnceWith([hilitedId]);
        });
      });
    });

    it("removes and re-adds models to hilite after remove event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const removedIds = ["0x1", "0x2"];
        const hilitedId = "0x3";

        provider.getHiliteSet.callsFake(() =>
          createAsyncIterator([
            {
              elements: [],
              subCategories: [],
              models: removedIds,
            } satisfies HiliteSet,
          ]),
        );
        cachingProvider.getHiliteSet.callsFake(() =>
          createAsyncIterator([
            {
              elements: [],
              subCategories: [],
              models: [hilitedId],
            } satisfies HiliteSet,
          ]),
        );

        triggerUnifiedSelectionChange({ changeType: "remove", selectables: removedIds.map((id) => ({ className: "TestSchema:TestClass", id })) });

        await waitFor(() => {
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.models.deleteIds).to.be.calledOnceWith(removedIds);
          expect(hiliteSet.models.addIds).to.be.calledAfter(hiliteSet.models.deleteIds).and.calledOnceWith([hilitedId]);
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.not.be.called;
          expect(selectionSet.add).to.not.be.called;
        });
      });
    });

    it("removes and re-adds subcategories to hilite after remove event", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const removedIds = ["0x1", "0x2"];
        const hilitedId = "0x3";

        provider.getHiliteSet.callsFake(() =>
          createAsyncIterator([
            {
              elements: [],
              subCategories: removedIds,
              models: [],
            } satisfies HiliteSet,
          ]),
        );
        cachingProvider.getHiliteSet.callsFake(() =>
          createAsyncIterator([
            {
              elements: [],
              subCategories: [hilitedId],
              models: [],
            } satisfies HiliteSet,
          ]),
        );

        triggerUnifiedSelectionChange({ changeType: "remove", selectables: removedIds.map((id) => ({ className: "TestSchema:TestClass", id })) });

        await waitFor(() => {
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.subcategories.deleteIds).to.be.calledOnceWith(removedIds);
          expect(hiliteSet.subcategories.addIds).to.be.calledAfter(hiliteSet.subcategories.deleteIds).and.calledOnceWith([hilitedId]);
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.not.be.called;
          expect(selectionSet.add).to.not.be.called;
        });
      });
    });

    it("handles hilite set in batches", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const firstElementId = "0x1";
        const secondElementId = "0x2";
        const firstResult = new ResolvablePromise<HiliteSet>();
        const secondResult = new ResolvablePromise<HiliteSet>();

        cachingProvider.getHiliteSet.reset();
        cachingProvider.getHiliteSet.callsFake(async function* () {
          yield await firstResult;
          yield await secondResult;
        });

        triggerUnifiedSelectionChange();

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
    });

    it("cancels ongoing selection change handling when selection replaced", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const initialElementId = "0x1";
        const result = new ResolvablePromise<HiliteSet>();

        cachingProvider.getHiliteSet.reset();
        cachingProvider.getHiliteSet.callsFake(async function* () {
          yield {
            elements: [initialElementId],
            subCategories: [],
            models: [],
          } satisfies HiliteSet;
          yield await result;
        });

        triggerUnifiedSelectionChange({ source: "initial", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

        await waitFor(() => {
          expect(cachingProvider.getHiliteSet).to.be.calledOnce;
          expect(hiliteSet.clear).to.be.called;
          expect(hiliteSet.models.addIds).to.not.be.called;
          expect(hiliteSet.subcategories.addIds).to.not.be.called;
          expect(hiliteSet.elements.addIds).to.be.calledOnceWith([initialElementId]);
        });

        resetHiliteSetStub();

        const newElementId = "0x3";

        cachingProvider.getHiliteSet.reset();
        cachingProvider.getHiliteSet.callsFake(async function* () {
          yield {
            elements: [newElementId],
            subCategories: [],
            models: [],
          } satisfies HiliteSet;
        });

        triggerUnifiedSelectionChange({ source: "next", selectables: [{ className: "BisCore.Element", id: newElementId }] });

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
    });

    it("cancels ongoing selection change handling when selection cleared", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const initialElementId = "0x1";
        const result = new ResolvablePromise<HiliteSet>();

        cachingProvider.getHiliteSet.reset();
        cachingProvider.getHiliteSet.callsFake(async function* () {
          yield {
            elements: [initialElementId],
            subCategories: [],
            models: [],
          } satisfies HiliteSet;
          yield await result;
        });

        triggerUnifiedSelectionChange({ source: "initial", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

        await waitFor(() => {
          expect(cachingProvider.getHiliteSet).to.be.calledOnce;
          expect(hiliteSet.clear).to.be.called;
          expect(hiliteSet.models.addIds).to.not.be.called;
          expect(hiliteSet.subcategories.addIds).to.not.be.called;
          expect(hiliteSet.elements.addIds).to.be.calledOnceWith([initialElementId]);
        });

        resetHiliteSetStub();

        const newElementId = "0x3";

        cachingProvider.getHiliteSet.reset();
        cachingProvider.getHiliteSet.callsFake(async function* () {
          yield {
            elements: [newElementId],
            subCategories: [],
            models: [],
          } satisfies HiliteSet;
        });

        triggerUnifiedSelectionChange({ source: "next", changeType: "clear", selectables: [{ className: "BisCore.Element", id: newElementId }] });

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
    });

    it("does not cancel ongoing changes when added or removed from selection", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const initialElementId = "0x1";
        const result = new ResolvablePromise<HiliteSet>();

        cachingProvider.getHiliteSet.reset();
        cachingProvider.getHiliteSet.callsFake(async function* () {
          yield {
            elements: [initialElementId],
            subCategories: [],
            models: [],
          } satisfies HiliteSet;
          yield await result;
        });

        triggerUnifiedSelectionChange({ source: "initial", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

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
          } satisfies HiliteSet;
        }

        provider.getHiliteSet.reset();
        provider.getHiliteSet.callsFake(() => secondGenerator());

        triggerUnifiedSelectionChange({ source: "next", changeType: "add", selectables: [{ className: "BisCore.Element", id: newElementId }] });

        await waitFor(() => {
          expect(provider.getHiliteSet).to.be.calledOnce;
          expect(hiliteSet.clear).to.not.be.called;
          expect(hiliteSet.models.addIds).to.not.be.called;
          expect(hiliteSet.subcategories.addIds).to.not.be.called;
          expect(hiliteSet.elements.addIds).to.be.calledOnceWith([newElementId]);
        });

        resetHiliteSetStub();

        provider.getHiliteSet.reset();
        provider.getHiliteSet.callsFake(async function* () {
          yield {
            elements: [initialElementId],
            subCategories: [],
            models: [],
          } satisfies HiliteSet;
        });

        cachingProvider.getHiliteSet.reset();
        cachingProvider.getHiliteSet.callsFake(() => secondGenerator());

        triggerUnifiedSelectionChange({ source: "next", changeType: "remove", selectables: [{ className: "BisCore.Element", id: initialElementId }] });

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
    });

    it("does not clear selection set if unified selection change was caused by viewport", async () => {
      await using(await createHandler({ selectionStorage }), async (_) => {
        resetStubs();

        const elementId = "0x1";
        cachingProvider.getHiliteSet.callsFake(() =>
          createAsyncIterator([
            {
              elements: [elementId],
              subCategories: [],
              models: [],
            } satisfies HiliteSet,
          ]),
        );

        // trigger the selection change and wait for event handler to finish
        triggerUnifiedSelectionChange({ source: "Tool" });

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
});
