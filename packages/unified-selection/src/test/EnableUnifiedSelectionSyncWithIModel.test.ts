/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator, ResolvablePromise, waitFor } from "presentation-test-utilities";
import sinon from "sinon";
import { BeEvent, BeUiEvent } from "@itwin/core-bentley";
import { enableUnifiedSelectionSyncWithIModel, IModelSelectionHandler } from "../unified-selection/EnableUnifiedSelectionSyncWithIModel.js";
import { Selectables } from "../unified-selection/Selectable.js";
import { createStorage } from "../unified-selection/SelectionStorage.js";
import { CoreSelectionSetEventType } from "../unified-selection/types/IModel.js";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

import type { Id64Arg } from "@itwin/core-bentley";
import type { ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow, EventArgs, Props } from "@itwin/presentation-shared";
import type { EnableUnifiedSelectionSyncWithIModelProps } from "../unified-selection/EnableUnifiedSelectionSyncWithIModel.js";
import type { HiliteSet, HiliteSetProvider } from "../unified-selection/HiliteSetProvider.js";
import type { Selectable, SelectableInstanceKey } from "../unified-selection/Selectable.js";
import type { StorageSelectionChangesListener, StorageSelectionChangeType } from "../unified-selection/SelectionChangeEvent.js";
import type { SelectionStorage } from "../unified-selection/SelectionStorage.js";
import type { CoreSelectableIds } from "../unified-selection/types/IModel.js";

describe("enableUnifiedSelectionSyncWithIModel", () => {
  const selectionStorage = {
    selectionChangeEvent: {
      addListener: sinon.stub<[StorageSelectionChangesListener], () => void>(),
      removeListener: sinon.stub<[], void>(),
    },
  };
  const hiliteSetProvider = {
    getHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<HiliteSet>>(),
    [Symbol.dispose]: sinon.stub(),
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
    hiliteSetProvider.getHiliteSet.reset();
    hiliteSetProvider.getHiliteSet.callsFake(() => createAsyncIterator([]));

    resetListeners();
    selectionStorage.selectionChangeEvent.addListener.returns(selectionStorage.selectionChangeEvent.removeListener);
  });

  it("creates and disposes IModelSelectionHandler", async () => {
    const cleanup = enableUnifiedSelectionSyncWithIModel({
      imodelAccess: imodelAccess as unknown as EnableUnifiedSelectionSyncWithIModelProps["imodelAccess"],
      selectionStorage: selectionStorage as unknown as SelectionStorage,
      activeScopeProvider: () => "element",
      cachingHiliteSetProvider: hiliteSetProvider,
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
  const imodelHiliteSetProvider = {
    getHiliteSetProvider: sinon.stub<[{ imodelKey: string }], HiliteSetProvider>(),
    getCurrentHiliteSet: sinon.stub<[{ imodelKey: string }], AsyncIterableIterator<HiliteSet>>(),
    [Symbol.dispose]: sinon.stub(),
  };

  const hiliteSetProvider = {
    getHiliteSet: sinon.stub<[{ selectables: Selectables }], AsyncIterableIterator<HiliteSet>>(),
  };

  function createSelectionStorage() {
    const stub = {
      addToSelection: sinon.stub<[Props<SelectionStorage["addToSelection"]>], void>(),
      removeFromSelection: sinon.stub<[Props<SelectionStorage["removeFromSelection"]>], void>(),
      replaceSelection: sinon.stub<[Props<SelectionStorage["replaceSelection"]>], void>(),
      clearSelection: sinon.stub<[Props<SelectionStorage["clearSelection"]>], void>(),
      getSelection: sinon.stub<[{ imodelKey: string }], Selectables>().returns({ custom: new Map(), instanceKeys: new Map() }),
      getSelectionLevels: sinon.stub<[{ imodelKey: string }], number[]>().returns([]),
      selectionChangeEvent: new BeUiEvent<EventArgs<SelectionStorage["selectionChangeEvent"]>>(),
      clearStorage: sinon.stub<[{ imodelKey: string }], void>(),
    };
    return {
      ...stub,
      resetHistory: () => {
        stub.addToSelection.resetHistory();
        stub.removeFromSelection.resetHistory();
        stub.replaceSelection.resetHistory();
        stub.clearSelection.resetHistory();
        stub.getSelection.resetHistory();
        stub.getSelectionLevels.resetHistory();
        stub.clearStorage.resetHistory();
      },
    };
  }

  function createHiliteSet() {
    const stub = {
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
    return {
      ...stub,
      resetHistory: () => {
        stub.clear.resetHistory();
        stub.elements.addIds.resetHistory();
        stub.elements.deleteIds.resetHistory();
        stub.models.addIds.resetHistory();
        stub.models.deleteIds.resetHistory();
        stub.subcategories.addIds.resetHistory();
        stub.subcategories.deleteIds.resetHistory();
      },
    };
  }

  function createSelectionSetV4() {
    const stub = {
      emptyAll: sinon.stub<[], void>(),
      add: sinon.stub<[Id64Arg | CoreSelectableIds], boolean>(),
      remove: sinon.stub<[Id64Arg | CoreSelectableIds], boolean>(),
      elements: new Set<string>(),
      onChanged: new BeEvent(),
    };
    return {
      ...stub,
      resetHistory: () => {
        stub.emptyAll.resetHistory();
        stub.add.resetHistory();
        stub.remove.resetHistory();
      },
    };
  }
  function createSelectionSetV5() {
    const v4 = createSelectionSetV4();
    const stub = {
      ...v4,
      active: { elements: new Set(), models: new Set(), subcategories: new Set() },
      add: sinon.stub<[CoreSelectableIds], boolean>(),
      remove: sinon.stub<[CoreSelectableIds], boolean>(),
    };
    return {
      ...stub,
      resetHistory: () => {
        v4.resetHistory();
        stub.add.resetHistory();
        stub.remove.resetHistory();
      },
    };
  }

  function createIModelAccess(props?: {
    selectionSet?: ReturnType<typeof createSelectionSetV4> | ReturnType<typeof createSelectionSetV5>;
    hiliteSet?: ReturnType<typeof createHiliteSet>;
  }) {
    return {
      createQueryReader: sinon.stub<[ECSqlQueryDef, ECSqlQueryReaderOptions | undefined], ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
      classDerivesFrom: sinon.stub<[string, string], Promise<boolean> | boolean>(),
      key: "test",
      get hiliteSet() {
        return props?.hiliteSet ?? createHiliteSet();
      },
      get selectionSet() {
        return props?.selectionSet ?? createSelectionSetV5();
      },
    };
  }

  function resetStubs(resettable?: Array<{ resetHistory: () => void }>) {
    hiliteSetProvider.getHiliteSet.reset();
    hiliteSetProvider.getHiliteSet.callsFake(async function* () {});

    imodelHiliteSetProvider.getHiliteSetProvider.reset();
    imodelHiliteSetProvider.getHiliteSetProvider.returns(hiliteSetProvider as unknown as HiliteSetProvider);
    imodelHiliteSetProvider.getCurrentHiliteSet.reset();
    imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {});

    resettable?.forEach((r) => r.resetHistory());
  }

  async function createHandler(
    props: Partial<Omit<EnableUnifiedSelectionSyncWithIModelProps, "imodelAccess" | "imodelHiliteSetProvider">> & {
      selectionStorage?: SelectionStorage;
      imodelAccess?: ReturnType<typeof createIModelAccess>;
    },
  ) {
    const selectionHandler = new IModelSelectionHandler({
      activeScopeProvider: () => "element",
      selectionStorage: props.selectionStorage ?? (createSelectionStorage() as SelectionStorage),
      imodelAccess: (props.imodelAccess ?? createIModelAccess()) as unknown as EnableUnifiedSelectionSyncWithIModelProps["imodelAccess"],
      imodelHiliteSetProvider,
      hiliteSetProvider,
    });
    return selectionHandler;
  }

  afterEach(() => {
    resetStubs();
  });

  describe("reacting to core/tool selection changes", () => {
    let selectionStorageStub: ReturnType<typeof createSelectionStorage>;

    const toQueryResponse = (keys: SelectableInstanceKey[]) => {
      return keys.map((key) => ({ ["ClassName"]: key.className, ["ECInstanceId"]: key.id }));
    };

    async function* createFakeQueryReader<TRow extends object = ECSqlQueryRow>(
      rows: (TRow | Promise<TRow>)[],
    ): ReturnType<ECSqlQueryExecutor["createQueryReader"]> {
      // eslint-disable-next-line @typescript-eslint/await-thenable
      for await (const row of rows) {
        yield row;
      }
    }

    beforeEach(() => {
      selectionStorageStub = createSelectionStorage();
      resetStubs();
    });

    it("uses custom `CachingHiliteSetProvider` and its underlying `HiliteSetProvider`", async () => {
      // ensure the providers are used on create
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
      });
      expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.be.calledOnce;
      imodelHiliteSetProvider.getHiliteSetProvider.resetHistory();
      imodelHiliteSetProvider.getCurrentHiliteSet.resetHistory();
      hiliteSetProvider.getHiliteSet.resetHistory();

      // ensure the providers are used on unified selection changes
      const ev = selectionStorageStub.selectionChangeEvent;
      (["clear", "replace", "add", "remove"] as StorageSelectionChangeType[]).forEach((selectionChangeType) => {
        ev.emit({
          storage: selectionStorageStub,
          changeType: selectionChangeType,
          imodelKey: "test",
          iModelKey: "test",
          source: "",
          level: 0,
          selectables: Selectables.create([]),
          timestamp: new Date(),
        });
        if (selectionChangeType === "clear" || selectionChangeType === "replace") {
          expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.be.calledOnce;
        } else {
          expect(imodelHiliteSetProvider.getHiliteSetProvider).to.be.calledOnce;
          expect(hiliteSetProvider.getHiliteSet).to.be.calledOnce;
        }
        imodelHiliteSetProvider.getHiliteSetProvider.resetHistory();
        imodelHiliteSetProvider.getCurrentHiliteSet.resetHistory();
        hiliteSetProvider.getHiliteSet.resetHistory();
      });
    });

    it("clears selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });
      await waitFor(() => {
        expect(selectionStorageStub.clearSelection).to.be.calledWith({ imodelKey: imodelAccess.key, source: "Tool" });
      });
    });

    it("adds elements to selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as SelectionStorage,
        imodelAccess,
      });

      const addedKeys = [createSelectableInstanceKey(1)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Add, added: addedKeys[0].id, set: selectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.addToSelection).to.be.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: addedKeys });
      });
    });

    it("adds models/subcategories/elements collection to selection", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      const modelKeys = [createSelectableInstanceKey(1, "BisCore.Model")];
      const subcategoryKeys = [createSelectableInstanceKey(2, "BisCore.SubCategory")];
      const elementKeys = [createSelectableInstanceKey(3)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(elementKeys)));

      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Add,
        added: elementKeys[0].id,
        additions: {
          models: modelKeys.map((k) => k.id),
          subcategories: subcategoryKeys.map((k) => k.id),
          elements: elementKeys.map((k) => k.id),
        },
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.addToSelection).to.be.calledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: [...modelKeys, ...subcategoryKeys, ...elementKeys],
        });
      });
    });

    it("removes elements from selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      const removedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(removedKeys)));

      selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Remove, removed: removedKeys.map((k) => k.id), set: selectionSet });

      await waitFor(() => {
        expect(selectionStorageStub.removeFromSelection).to.be.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: removedKeys });
      });
    });

    it("removes models/subcategories/elements collection from selection", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      const modelKeys = [createSelectableInstanceKey(1, "BisCore.Model")];
      const subcategoryKeys = [createSelectableInstanceKey(2, "BisCore.SubCategory")];
      const elementKeys = [createSelectableInstanceKey(3)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(elementKeys)));

      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Remove,
        removed: elementKeys[0].id,
        removals: {
          models: modelKeys.map((k) => k.id),
          subcategories: subcategoryKeys.map((k) => k.id),
          elements: elementKeys.map((k) => k.id),
        },
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.removeFromSelection).to.be.calledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: [...modelKeys, ...subcategoryKeys, ...elementKeys],
        });
      });
    });

    it("replaces elements selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).to.be.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: addedKeys });
      });
    });

    it("replaces models/subcategories/elements collection selection", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      const modelKeys = [createSelectableInstanceKey(1, "BisCore.Model"), createSelectableInstanceKey(4, "BisCore.Model")];
      const subcategoryKeys = [createSelectableInstanceKey(2, "BisCore.SubCategory"), createSelectableInstanceKey(5, "BisCore.SubCategory")];
      const elementKeys = [createSelectableInstanceKey(3), createSelectableInstanceKey(6)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(elementKeys)));

      selectionSet.active = {
        models: new Set(modelKeys.map((k) => k.id)),
        subcategories: new Set(subcategoryKeys.map((k) => k.id)),
        elements: new Set(elementKeys.map((k) => k.id)),
      };
      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: elementKeys[0].id,
        additions: {
          models: modelKeys[0].id,
          subcategories: subcategoryKeys[0].id,
          elements: elementKeys[0].id,
        },
        removed: "0x789",
        removals: {
          models: "0x123",
          subcategories: "0x456",
          elements: "0x789",
        },
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).to.be.calledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: [...modelKeys, ...subcategoryKeys, ...elementKeys],
        });
      });
    });

    it("ignores changes when suspended", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      using _dispose = handler.suspendIModelToolSelectionSync();

      selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });
      await waitFor(() => {
        expect(selectionStorageStub.clearSelection).to.not.be.called;
      });
    });

    it("syncs hilite set if selection storage doesn't change on tool selection change", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      const selectionStorageChangeSpy = sinon.spy();
      selectionStorageStub.selectionChangeEvent.addListener(selectionStorageChangeSpy);

      // set up the request to get current hilite set to return something specific
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(() =>
        createAsyncIterator([
          {
            models: ["0x11"],
            subCategories: ["0x22"],
            elements: ["0x33"],
          } satisfies HiliteSet,
        ]),
      );

      // set up `computeSelection` to return some keys
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      // trigger tool selection change
      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).to.be.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: addedKeys });
        expect(selectionStorageChangeSpy).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          models: ["0x11"],
          subcategories: ["0x22"],
          elements: ["0x33"],
        });
      });
    });

    it("doesn't sync hilite set more than once when tool selection change triggers selection storage change", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({
        selectionStorage: selectionStorageStub as unknown as SelectionStorage,
        imodelAccess,
      });

      // set up `SelectionStorage.replaceSelection` to trigger a selection change event
      selectionStorageStub.replaceSelection.callsFake((args) => {
        selectionStorageStub.selectionChangeEvent.emit({
          imodelKey: imodelAccess.key,
          iModelKey: imodelAccess.key,
          changeType: "replace",
          source: "Tool",
          level: 0,
          selectables: Selectables.create(args.selectables),
          timestamp: new Date(),
          storage: selectionStorageStub as unknown as SelectionStorage,
        });
      });

      // set up the request to get current hilite set to return something specific
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(() =>
        createAsyncIterator([
          {
            elements: ["0x11"],
            models: ["0x22"],
            subCategories: ["0x33"],
          } satisfies HiliteSet,
        ]),
      );

      // set up `computeSelection` to return some keys
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.returns(createFakeQueryReader(toQueryResponse(addedKeys)));

      // trigger tool selection change
      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).to.be.calledWith({ imodelKey: imodelAccess.key, source: "Tool", selectables: addedKeys });
        expect(selectionSet.add).to.be.calledOnce.and.calledWith({
          elements: ["0x11"],
          models: ["0x22"],
          subcategories: ["0x33"],
        });
      });
    });
  });

  describe("reacting to unified selection changes", () => {
    let selectionStorage: SelectionStorage;

    beforeEach(() => {
      selectionStorage = createStorage();
      resetStubs();
    });

    const triggerUnifiedSelectionChange = ({
      changeType = "replace",
      source = "",
      imodelKey,
      selectables = [createSelectableInstanceKey()],
      level = 0,
    }: {
      imodelKey: string;
      changeType?: StorageSelectionChangeType;
      source?: string;
      selectables?: Selectable[];
      level?: number;
    }) => {
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
      const ids = {
        models: ["0x1"],
        subcategories: ["0x2"],
        elements: ["0x3"],
      };
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(() =>
        createAsyncIterator([
          {
            elements: ids.elements,
            models: ids.models,
            subCategories: ids.subcategories,
          } satisfies HiliteSet,
        ]),
      );

      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      await waitFor(() => {
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.be.calledOnceWith(ids);
      });
    });

    it("ignores selection changes to other imodels", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs();
      const hiliteSetSpy = sinon.spy(imodelAccess, "hiliteSet", ["get"]).get;
      const selectionSetSpy = sinon.spy(imodelAccess, "selectionSet", ["get"]).get;
      triggerUnifiedSelectionChange({ imodelKey: "otherIModel" });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.not.be.called;
        expect(hiliteSetSpy).to.not.be.called;
        expect(selectionSetSpy).to.not.be.called;
      });
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs();
      const hiliteSetSpy = sinon.spy(imodelAccess, "hiliteSet", ["get"]).get;
      const selectionSetSpy = sinon.spy(imodelAccess, "selectionSet", ["get"]).get;
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, level: 1 });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.not.be.called;
        expect(hiliteSetSpy).to.not.be.called;
        expect(selectionSetSpy).to.not.be.called;
      });
    });

    ["SomeComponent", "Tool"].forEach((source) => {
      it(`clears selection set after 'clear' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV4();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({ imodelKey: imodelAccess.key, source: "", selectables: [createSelectableInstanceKey()] });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(() => createAsyncIterator([]));
        triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, changeType: "clear", source });

        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(selectionSet.emptyAll).to.be.calledOnce;
        });
      });

      it(`[itwinjs-core@4] sets hilite after 'replace' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV4();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const ids: HiliteSet = {
          models: ["0x1"],
          subCategories: ["0x2"],
          elements: ["0x3"],
        };
        imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(() => createAsyncIterator([ids]));

        triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source });

        await waitFor(() => {
          expect(hiliteSet.clear).to.be.calledOnce;
          expect(hiliteSet.models.addIds).to.be.calledOnceWith(ids.models);
          expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith(ids.subCategories);
          expect(selectionSet.add).to.be.calledOnceWith(ids.elements);
        });
      });

      it(`[itwinjs-core@5] sets hilite after 'replace' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV5();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const ids: HiliteSet = {
          models: ["0x1"],
          subCategories: ["0x2"],
          elements: ["0x3"],
        };
        imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(() => createAsyncIterator([ids]));

        triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source });

        await waitFor(() => {
          if (source === "Tool") {
            expect(selectionSet.emptyAll).to.not.be.called;
          } else {
            expect(selectionSet.emptyAll).to.be.called;
          }
          expect(selectionSet.add).to.be.calledOnceWith({ models: ids.models, subcategories: ids.subCategories, elements: ids.elements });
        });
      });

      it(`[itwinjs-core@4] adds to hilite after 'add' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV4();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const eventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const hilited: HiliteSet = {
          models: ["0x4"],
          subCategories: ["0x5"],
          elements: ["0x6"],
        };
        hiliteSetProvider.getHiliteSet.callsFake(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "add",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).to.be.calledOnceWith({ selectables: Selectables.create(eventSelectables) });
          expect(hiliteSet.clear).to.not.be.called;
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(hiliteSet.models.addIds).to.be.calledOnceWith(hilited.models);
          expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith(hilited.subCategories);
          expect(selectionSet.add).to.be.calledOnceWith(hilited.elements);
        });
      });

      it(`[itwinjs-core@5] adds to hilite after 'add' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV5();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const eventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const hilited: HiliteSet = {
          models: ["0x4"],
          subCategories: ["0x5"],
          elements: ["0x6"],
        };
        hiliteSetProvider.getHiliteSet.callsFake(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "add",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).to.be.calledOnceWith({ selectables: Selectables.create(eventSelectables) });
          expect(hiliteSet.clear).to.not.be.called;
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.add).to.be.calledOnceWith({ models: hilited.models, subcategories: hilited.subCategories, elements: hilited.elements });
        });
      });

      it(`[itwinjs-core@4] removes from hilite after 'remove' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV4();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({ imodelKey: imodelAccess.key, source: "", selectables: [{ className: "BisCore.PhysicalElement", id: "0x3" }] });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const eventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const hilited: HiliteSet = {
          models: ["0x4"],
          subCategories: ["0x5"],
          elements: ["0x6"],
        };
        hiliteSetProvider.getHiliteSet.callsFake(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "remove",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).to.be.calledOnceWith({ selectables: Selectables.create(eventSelectables) });
          expect(hiliteSet.clear).to.not.be.called;
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(hiliteSet.models.deleteIds).to.be.calledOnceWith(hilited.models);
          expect(hiliteSet.subcategories.deleteIds).to.be.calledOnceWith(hilited.subCategories);
          expect(selectionSet.remove).to.be.calledOnceWith(hilited.elements);
        });
      });

      it(`[itwinjs-core@5] removes from hilite after 'remove' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV5();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({ imodelKey: imodelAccess.key, source: "", selectables: [{ className: "BisCore.PhysicalElement", id: "0x3" }] });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const eventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const hilited: HiliteSet = {
          models: ["0x4"],
          subCategories: ["0x5"],
          elements: ["0x6"],
        };
        hiliteSetProvider.getHiliteSet.callsFake(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "remove",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).to.be.calledOnceWith({ selectables: Selectables.create(eventSelectables) });
          expect(hiliteSet.clear).to.not.be.called;
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.be.calledOnceWith({ models: hilited.models, subcategories: hilited.subCategories, elements: hilited.elements });
        });
      });

      it(`removes and re-adds to hilite after 'remove' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV5();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({ imodelKey: imodelAccess.key, source: "", selectables: [{ className: "BisCore.PhysicalElement", id: "0x3" }] });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const removeEventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const removed: HiliteSet = {
          models: ["0x4"],
          subCategories: ["0x5"],
          elements: ["0x6"],
        };
        const readded: HiliteSet = {
          models: ["0x7"],
          subCategories: ["0x8"],
          elements: ["0x9"],
        };

        hiliteSetProvider.getHiliteSet.callsFake(() => createAsyncIterator([removed]));
        imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(() => createAsyncIterator([readded]));

        triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, changeType: "remove", selectables: removeEventSelectables, source });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).to.be.calledOnceWith({ selectables: Selectables.create(removeEventSelectables) });
          expect(hiliteSet.clear).to.not.be.called;
          expect(selectionSet.emptyAll).to.not.be.called;
          expect(selectionSet.remove).to.be.calledOnceWith({ models: removed.models, subcategories: removed.subCategories, elements: removed.elements });
          expect(selectionSet.add)
            .to.be.calledAfter(selectionSet.remove)
            .and.calledOnceWith({ models: readded.models, subcategories: readded.subCategories, elements: readded.elements });
        });
      });
    });

    it("handles hilite set in batches", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const firstElementId = "0x1";
      const secondElementId = "0x2";
      const firstHiliteSetPromise = new ResolvablePromise<HiliteSet>();
      const secondHiliteSetPromise = new ResolvablePromise<HiliteSet>();

      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield await firstHiliteSetPromise;
        yield await secondHiliteSetPromise;
      });

      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key });

      await waitFor(() => {
        expect(selectionSet.emptyAll).to.be.called;
      });
      selectionSet.emptyAll.resetHistory();

      await firstHiliteSetPromise.resolve({ elements: [firstElementId], models: [], subCategories: [] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({ elements: [firstElementId], models: [], subcategories: [] });
      });
      selectionSet.add.resetHistory();

      await secondHiliteSetPromise.resolve({ elements: [secondElementId], models: [], subCategories: [] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({ elements: [secondElementId], models: [], subcategories: [] });
      });
    });

    it("cancels ongoing selection change handling when selection replaced", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const initialHilited = {
        models: ["0x1"],
        subCategories: ["0x2"],
        elements: ["0x3"],
      };
      const initialHilitedPromise = new ResolvablePromise<HiliteSet>();
      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield initialHilited;
        yield await initialHilitedPromise;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "initial",
        selectables: [{ className: "BisCore.Element", id: "0x123" }],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          elements: initialHilited.elements,
          models: initialHilited.models,
          subcategories: initialHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const replaceHilited = {
        models: ["0x4"],
        subCategories: ["0x5"],
        elements: ["0x6"],
      };
      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield replaceHilited;
      });
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source: "next", selectables: [{ className: "BisCore.Element", id: "0x456" }] });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.be.calledOnceWith({
          elements: replaceHilited.elements,
          models: replaceHilited.models,
          subcategories: replaceHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      await initialHilitedPromise.resolve({ elements: ["0x7"], models: ["0x8"], subCategories: ["0x9"] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("cancels ongoing selection change handling when selection cleared", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const initialHilited = {
        models: ["0x1"],
        subCategories: ["0x2"],
        elements: ["0x3"],
      };
      const initialHilitedPromise = new ResolvablePromise<HiliteSet>();
      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield initialHilited;
        yield await initialHilitedPromise;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "initial",
        selectables: [{ className: "BisCore.Element", id: "0x123" }],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          elements: initialHilited.elements,
          models: initialHilited.models,
          subcategories: initialHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const clearHilited = {
        models: ["0x4"],
        subCategories: ["0x5"],
        elements: ["0x6"],
      };
      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield clearHilited;
      });
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source: "next", changeType: "clear", selectables: [] });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          elements: clearHilited.elements,
          models: clearHilited.models,
          subcategories: clearHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      await initialHilitedPromise.resolve({ elements: ["0x7"], models: ["0x8"], subCategories: ["0x9"] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("does not cancel ongoing changes when added or removed from selection", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const initialHilited = {
        models: ["0x1"],
        subCategories: ["0x2"],
        elements: ["0x3"],
      };
      const delayedInitialHilitedPromise = new ResolvablePromise<HiliteSet>();
      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield initialHilited;
        yield await delayedInitialHilitedPromise;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "initial",
        selectables: [{ className: "BisCore.Element", id: "0x123" }],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          elements: initialHilited.elements,
          models: initialHilited.models,
          subcategories: initialHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {});

      const addHilited = {
        models: ["0x4"],
        subCategories: ["0x5"],
        elements: ["0x6"],
      };
      hiliteSetProvider.getHiliteSet.reset();
      hiliteSetProvider.getHiliteSet.callsFake(async function* () {
        yield addHilited;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "next",
        changeType: "add",
        selectables: [{ className: "BisCore.Element", id: "0x456" }],
      });
      await waitFor(() => {
        expect(hiliteSetProvider.getHiliteSet).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          elements: addHilited.elements,
          models: addHilited.models,
          subcategories: addHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const removeHilited = {
        models: ["0x7"],
        subCategories: ["0x8"],
        elements: ["0x9"],
      };
      hiliteSetProvider.getHiliteSet.reset();
      hiliteSetProvider.getHiliteSet.callsFake(async function* () {
        yield removeHilited;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "next",
        changeType: "remove",
        selectables: [{ className: "BisCore.Element", id: "0x456" }],
      });
      await waitFor(() => {
        expect(hiliteSetProvider.getHiliteSet).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.be.calledOnceWith({
          elements: removeHilited.elements,
          models: removeHilited.models,
          subcategories: removeHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const delayedInitialHilited = {
        models: ["0x11"],
        subCategories: ["0x22"],
        elements: ["0x33"],
      };
      await delayedInitialHilitedPromise.resolve(delayedInitialHilited);
      await waitFor(() => {
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          elements: delayedInitialHilited.elements,
          models: delayedInitialHilited.models,
          subcategories: delayedInitialHilited.subCategories,
        });
      });
    });

    it("[itwinjs-core@4] does not clear selection set if unified selection change was caused by viewport", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const replaceHilited = {
        models: ["0x7"],
        subCategories: ["0x8"],
        elements: ["0x9"],
      };
      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield replaceHilited;
      });
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source: "Tool" });

      await waitFor(() => {
        // verify selection set was not cleared, but resulting hilite set was added to it
        expect(hiliteSet.clear).to.be.calledOnce;
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(hiliteSet.models.addIds).to.be.calledOnceWith(replaceHilited.models);
        expect(hiliteSet.subcategories.addIds).to.be.calledOnceWith(replaceHilited.subCategories);
        expect(selectionSet.add).to.be.calledOnceWith(replaceHilited.elements);
      });
    });

    it("[itwinjs-core@5] does not clear selection set if unified selection change was caused by viewport", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const replaceHilited = {
        models: ["0x7"],
        subCategories: ["0x8"],
        elements: ["0x9"],
      };
      imodelHiliteSetProvider.getCurrentHiliteSet.reset();
      imodelHiliteSetProvider.getCurrentHiliteSet.callsFake(async function* () {
        yield replaceHilited;
      });
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source: "Tool" });

      await waitFor(() => {
        // verify selection set was not cleared, but resulting hilite set was added to it
        expect(hiliteSet.clear).to.not.be.called;
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith({
          models: replaceHilited.models,
          subcategories: replaceHilited.subCategories,
          elements: replaceHilited.elements,
        });
      });
    });
  });
});
