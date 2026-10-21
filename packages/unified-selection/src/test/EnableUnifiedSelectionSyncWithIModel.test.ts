/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator, ResolvablePromise, waitFor } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeEvent, BeUiEvent, type Id64Arg } from "@itwin/core-bentley";
import {
  enableUnifiedSelectionSyncWithIModel,
  IModelSelectionHandler,
} from "../unified-selection/EnableUnifiedSelectionSyncWithIModel.js";
import { Selectables } from "../unified-selection/Selectable.js";
import { createStorage } from "../unified-selection/SelectionStorage.js";
import { CoreSelectionSetEventType } from "../unified-selection/types/IModel.js";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

import type { ECSqlQueryExecutor, ECSqlQueryRow, EventListener } from "@itwin/presentation-shared";
import type { EnableUnifiedSelectionSyncWithIModelProps } from "../unified-selection/EnableUnifiedSelectionSyncWithIModel.js";
import type { HiliteSet, HiliteSetProvider } from "../unified-selection/HiliteSetProvider.js";
import type { Selectable, SelectableInstanceKey } from "../unified-selection/Selectable.js";
import type {
  StorageSelectionChangesListener,
  StorageSelectionChangeType,
} from "../unified-selection/SelectionChangeEvent.js";
import type { SelectionStorage } from "../unified-selection/SelectionStorage.js";
import type { CoreSelectableIds } from "../unified-selection/types/IModel.js";

describe("enableUnifiedSelectionSyncWithIModel", () => {
  const selectionStorage = {
    selectionChangeEvent: {
      addListener: vi.fn<(listener: StorageSelectionChangesListener) => () => void>(),
      removeListener: vi.fn<() => void>(),
    },
  };
  const hiliteSetProvider = {
    getHiliteSet: vi.fn<(props: { imodelKey: string }) => AsyncIterableIterator<HiliteSet>>(),
    [Symbol.dispose]: vi.fn(),
  };
  const imodelAccess = {
    hiliteSet: { wantSyncWithSelectionSet: false, clear: () => {} },
    selectionSet: { emptyAll: () => {}, onChanged: { addListener: () => () => {} } },
  };

  function resetListeners() {
    selectionStorage.selectionChangeEvent.addListener.mockReset();
    selectionStorage.selectionChangeEvent.removeListener.mockReset();
  }

  beforeEach(async () => {
    hiliteSetProvider.getHiliteSet.mockReset();
    hiliteSetProvider.getHiliteSet.mockImplementation(() => createAsyncIterator([]));

    selectionStorage.selectionChangeEvent.addListener.mockReturnValue(
      selectionStorage.selectionChangeEvent.removeListener,
    );
  });

  it("creates and disposes IModelSelectionHandler", async () => {
    const cleanup = enableUnifiedSelectionSyncWithIModel({
      imodelAccess: imodelAccess as unknown as EnableUnifiedSelectionSyncWithIModelProps["imodelAccess"],
      selectionStorage: selectionStorage as unknown as SelectionStorage,
      activeScopeProvider: () => "element",
      cachingHiliteSetProvider: hiliteSetProvider,
    });

    expect(selectionStorage.selectionChangeEvent.addListener).toHaveBeenCalledOnce();
    expect(selectionStorage.selectionChangeEvent.removeListener).not.toHaveBeenCalled();

    resetListeners();
    cleanup();

    expect(selectionStorage.selectionChangeEvent.addListener).not.toHaveBeenCalled();
    expect(selectionStorage.selectionChangeEvent.removeListener).toHaveBeenCalledOnce();
  });
});

describe("IModelSelectionHandler", () => {
  const imodelHiliteSetProvider = {
    getHiliteSetProvider: vi.fn<(props: { imodelKey: string }) => HiliteSetProvider>(),
    getCurrentHiliteSet: vi.fn<(props: { imodelKey: string }) => AsyncIterableIterator<HiliteSet>>(),
    [Symbol.dispose]: vi.fn(),
  };

  const hiliteSetProvider = {
    getHiliteSet: vi.fn<(props: { selectables: Selectables }) => AsyncIterableIterator<HiliteSet>>(),
  };

  function createSelectionStorage() {
    const stub = {
      addToSelection: vi.fn<SelectionStorage["addToSelection"]>(),
      removeFromSelection: vi.fn<SelectionStorage["removeFromSelection"]>(),
      replaceSelection: vi.fn<SelectionStorage["replaceSelection"]>(),
      clearSelection: vi.fn<SelectionStorage["clearSelection"]>(),
      getSelection: vi
        .fn<SelectionStorage["getSelection"]>()
        .mockReturnValue({ custom: new Map(), instanceKeys: new Map() }),
      getSelectionLevels: vi.fn<SelectionStorage["getSelectionLevels"]>().mockReturnValue([]),
      selectionChangeEvent: new BeUiEvent<Parameters<EventListener<SelectionStorage["selectionChangeEvent"]>>[0]>(),
      clearStorage: vi.fn<SelectionStorage["clearStorage"]>(),
    };
    return {
      ...stub,
      resetHistory: () => {
        stub.addToSelection.mockClear();
        stub.removeFromSelection.mockClear();
        stub.replaceSelection.mockClear();
        stub.clearSelection.mockClear();
        stub.getSelection.mockClear();
        stub.getSelectionLevels.mockClear();
        stub.clearStorage.mockClear();
      },
    };
  }

  function createHiliteSet() {
    const stub = {
      wantSyncWithSelectionSet: true,
      clear: vi.fn<() => void>(),
      elements: { addIds: vi.fn<(ids: Id64Arg) => void>(), deleteIds: vi.fn<(ids: Id64Arg) => void>() },
      models: { addIds: vi.fn<(ids: Id64Arg) => void>(), deleteIds: vi.fn<(ids: Id64Arg) => void>() },
      subcategories: { addIds: vi.fn<(ids: Id64Arg) => void>(), deleteIds: vi.fn<(ids: Id64Arg) => void>() },
    };
    return {
      ...stub,
      resetHistory: () => {
        stub.clear.mockClear();
        stub.elements.addIds.mockClear();
        stub.elements.deleteIds.mockClear();
        stub.models.addIds.mockClear();
        stub.models.deleteIds.mockClear();
        stub.subcategories.addIds.mockClear();
        stub.subcategories.deleteIds.mockClear();
      },
    };
  }

  function createSelectionSetV4() {
    const stub = {
      emptyAll: vi.fn<() => void>(),
      add: vi.fn<(ids: Id64Arg | CoreSelectableIds) => boolean>(),
      remove: vi.fn<(ids: Id64Arg | CoreSelectableIds) => boolean>(),
      elements: new Set<string>(),
      onChanged: new BeEvent(),
    };
    return {
      ...stub,
      resetHistory: () => {
        stub.emptyAll.mockClear();
        stub.add.mockClear();
        stub.remove.mockClear();
      },
    };
  }
  function createSelectionSetV5() {
    const v4 = createSelectionSetV4();
    const stub = {
      ...v4,
      active: { elements: new Set(), models: new Set(), subcategories: new Set() },
      add: vi.fn<(ids: CoreSelectableIds) => boolean>(),
      remove: vi.fn<(ids: CoreSelectableIds) => boolean>(),
    };
    return {
      ...stub,
      resetHistory: () => {
        v4.resetHistory();
        stub.add.mockClear();
        stub.remove.mockClear();
      },
    };
  }

  function createIModelAccess(props?: {
    selectionSet?: ReturnType<typeof createSelectionSetV4> | ReturnType<typeof createSelectionSetV5>;
    hiliteSet?: ReturnType<typeof createHiliteSet>;
  }) {
    return {
      createQueryReader: vi.fn<ECSqlQueryExecutor["createQueryReader"]>(),
      classDerivesFrom: vi.fn<(cn: string, parentCn: string) => Promise<boolean> | boolean>(),
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
    hiliteSetProvider.getHiliteSet.mockReset();
    hiliteSetProvider.getHiliteSet.mockImplementation(async function* () {});

    imodelHiliteSetProvider.getHiliteSetProvider.mockReset();
    imodelHiliteSetProvider.getHiliteSetProvider.mockReturnValue(hiliteSetProvider);
    imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
    imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {});

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
      selectionStorage: props.selectionStorage ?? createSelectionStorage(),
      imodelAccess: (props.imodelAccess ??
        createIModelAccess()) as EnableUnifiedSelectionSyncWithIModelProps["imodelAccess"],
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
      using _handler = await createHandler({ selectionStorage: selectionStorageStub });
      expect(imodelHiliteSetProvider.getCurrentHiliteSet).toHaveBeenCalledOnce();
      imodelHiliteSetProvider.getHiliteSetProvider.mockClear();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockClear();
      hiliteSetProvider.getHiliteSet.mockClear();

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
          expect(imodelHiliteSetProvider.getCurrentHiliteSet).toHaveBeenCalledOnce();
        } else {
          expect(imodelHiliteSetProvider.getHiliteSetProvider).toHaveBeenCalledOnce();
          expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledOnce();
        }
        imodelHiliteSetProvider.getHiliteSetProvider.mockClear();
        imodelHiliteSetProvider.getCurrentHiliteSet.mockClear();
        hiliteSetProvider.getHiliteSet.mockClear();
      });
    });

    it("clears selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });
      await waitFor(() => {
        expect(selectionStorageStub.clearSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
        });
      });
    });

    it("adds elements to selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const addedKeys = [createSelectableInstanceKey(1)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(addedKeys)));

      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Add,
        added: addedKeys[0].id,
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.addToSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: addedKeys,
        });
      });
    });

    it("adds models/subcategories/elements collection to selection", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const modelKeys = [createSelectableInstanceKey(1, "BisCore.Model")];
      const subcategoryKeys = [createSelectableInstanceKey(2, "BisCore.SubCategory")];
      const elementKeys = [createSelectableInstanceKey(3)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(elementKeys)));

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
        expect(selectionStorageStub.addToSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: [...modelKeys, ...subcategoryKeys, ...elementKeys],
        });
      });
    });

    it("removes elements from selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const removedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(removedKeys)));

      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Remove,
        removed: removedKeys.map((k) => k.id),
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.removeFromSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: removedKeys,
        });
      });
    });

    it("removes models/subcategories/elements collection from selection", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const modelKeys = [createSelectableInstanceKey(1, "BisCore.Model")];
      const subcategoryKeys = [createSelectableInstanceKey(2, "BisCore.SubCategory")];
      const elementKeys = [createSelectableInstanceKey(3)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(elementKeys)));

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
        expect(selectionStorageStub.removeFromSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: [...modelKeys, ...subcategoryKeys, ...elementKeys],
        });
      });
    });

    it("replaces elements selection", async () => {
      const selectionSet = createSelectionSetV4();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(addedKeys)));

      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: addedKeys,
        });
      });
    });

    it("replaces models/subcategories/elements collection selection", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const modelKeys = [
        createSelectableInstanceKey(1, "BisCore.Model"),
        createSelectableInstanceKey(4, "BisCore.Model"),
      ];
      const subcategoryKeys = [
        createSelectableInstanceKey(2, "BisCore.SubCategory"),
        createSelectableInstanceKey(5, "BisCore.SubCategory"),
      ];
      const elementKeys = [createSelectableInstanceKey(3), createSelectableInstanceKey(6)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(elementKeys)));

      selectionSet.active = {
        models: new Set(modelKeys.map((k) => k.id)),
        subcategories: new Set(subcategoryKeys.map((k) => k.id)),
        elements: new Set(elementKeys.map((k) => k.id)),
      };
      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: elementKeys[0].id,
        additions: { models: modelKeys[0].id, subcategories: subcategoryKeys[0].id, elements: elementKeys[0].id },
        removed: "0x789",
        removals: { models: "0x123", subcategories: "0x456", elements: "0x789" },
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: [...modelKeys, ...subcategoryKeys, ...elementKeys],
        });
      });
    });

    it("ignores changes when suspended", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(addedKeys)));

      using _dispose = handler.suspendIModelToolSelectionSync();

      selectionSet.onChanged.raiseEvent({ type: CoreSelectionSetEventType.Clear, removed: [], set: selectionSet });
      await waitFor(() => {
        expect(selectionStorageStub.clearSelection).not.toHaveBeenCalled();
      });
    });

    it("syncs hilite set if selection storage doesn't change on tool selection change", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      const selectionStorageChangeSpy = vi.fn();
      selectionStorageStub.selectionChangeEvent.addListener(selectionStorageChangeSpy);

      // set up the request to get current hilite set to return something specific
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(() =>
        createAsyncIterator([{ models: ["0x11"], subCategories: ["0x22"], elements: ["0x33"] } satisfies HiliteSet]),
      );

      // set up `computeSelection` to return some keys
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(addedKeys)));

      // trigger tool selection change
      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: addedKeys,
        });
        expect(selectionStorageChangeSpy).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          models: ["0x11"],
          subcategories: ["0x22"],
          elements: ["0x33"],
        });
      });
    });

    it("doesn't sync hilite set more than once when tool selection change triggers selection storage change", async () => {
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ selectionSet });
      using _handler = await createHandler({ selectionStorage: selectionStorageStub, imodelAccess });

      // set up `SelectionStorage.replaceSelection` to trigger a selection change event
      selectionStorageStub.replaceSelection.mockImplementation((args) => {
        selectionStorageStub.selectionChangeEvent.emit({
          imodelKey: imodelAccess.key,
          iModelKey: imodelAccess.key,
          changeType: "replace",
          source: "Tool",
          level: 0,
          selectables: Selectables.create(args.selectables),
          timestamp: new Date(),
          storage: selectionStorageStub,
        });
      });

      // set up the request to get current hilite set to return something specific
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(() =>
        createAsyncIterator([{ elements: ["0x11"], models: ["0x22"], subCategories: ["0x33"] } satisfies HiliteSet]),
      );

      // set up `computeSelection` to return some keys
      const addedKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      imodelAccess.createQueryReader.mockReturnValue(createFakeQueryReader(toQueryResponse(addedKeys)));

      // trigger tool selection change
      selectionSet.onChanged.raiseEvent({
        type: CoreSelectionSetEventType.Replace,
        added: new Set<string>(addedKeys.map((k) => k.id)),
        removed: [],
        set: selectionSet,
      });

      await waitFor(() => {
        expect(selectionStorageStub.replaceSelection).toHaveBeenCalledWith({
          imodelKey: imodelAccess.key,
          source: "Tool",
          selectables: addedKeys,
        });
        expect(selectionSet.add).toHaveBeenCalledOnce();
        expect(selectionSet.add).toHaveBeenCalledWith({
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
      const ids = { models: ["0x1"], subcategories: ["0x2"], elements: ["0x3"] };
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(() =>
        createAsyncIterator([
          { elements: ids.elements, models: ids.models, subCategories: ids.subcategories } satisfies HiliteSet,
        ]),
      );

      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      await waitFor(() => {
        expect(selectionSet.emptyAll).toHaveBeenCalledOnce();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith(ids);
      });
    });

    it("ignores selection changes to other imodels", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs();
      const hiliteSetSpy = vi.spyOn(imodelAccess, "hiliteSet", "get");
      const selectionSetSpy = vi.spyOn(imodelAccess, "selectionSet", "get");
      triggerUnifiedSelectionChange({ imodelKey: "otherIModel" });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).not.toHaveBeenCalled();
        expect(hiliteSetSpy).not.toHaveBeenCalled();
        expect(selectionSetSpy).not.toHaveBeenCalled();
      });
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs();
      const hiliteSetSpy = vi.spyOn(imodelAccess, "hiliteSet", "get");
      const selectionSetSpy = vi.spyOn(imodelAccess, "selectionSet", "get");
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, level: 1 });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).not.toHaveBeenCalled();
        expect(hiliteSetSpy).not.toHaveBeenCalled();
        expect(selectionSetSpy).not.toHaveBeenCalled();
      });
    });

    ["SomeComponent", "Tool"].forEach((source) => {
      it(`clears selection set after 'clear' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV4();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({
          imodelKey: imodelAccess.key,
          source: "",
          selectables: [createSelectableInstanceKey()],
        });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(() => createAsyncIterator([]));
        triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, changeType: "clear", source });

        await waitFor(() => {
          expect(hiliteSet.clear).toHaveBeenCalledOnce();
          expect(selectionSet.emptyAll).toHaveBeenCalledOnce();
        });
      });

      it(`[itwinjs-core@4] sets hilite after 'replace' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV4();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const ids: HiliteSet = { models: ["0x1"], subCategories: ["0x2"], elements: ["0x3"] };
        imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(() => createAsyncIterator([ids]));

        triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source });

        await waitFor(() => {
          expect(hiliteSet.clear).toHaveBeenCalledOnce();
          expect(hiliteSet.models.addIds).toHaveBeenCalledExactlyOnceWith(ids.models);
          expect(hiliteSet.subcategories.addIds).toHaveBeenCalledExactlyOnceWith(ids.subCategories);
          expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith(ids.elements);
        });
      });

      it(`[itwinjs-core@5] sets hilite after 'replace' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV5();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const ids: HiliteSet = { models: ["0x1"], subCategories: ["0x2"], elements: ["0x3"] };
        imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(() => createAsyncIterator([ids]));

        triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source });

        await waitFor(() => {
          if (source === "Tool") {
            expect(selectionSet.emptyAll).not.toHaveBeenCalled();
          } else {
            expect(selectionSet.emptyAll).toHaveBeenCalled();
          }
          expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
            models: ids.models,
            subcategories: ids.subCategories,
            elements: ids.elements,
          });
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
        const hilited: HiliteSet = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
        hiliteSetProvider.getHiliteSet.mockImplementation(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "add",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledExactlyOnceWith({
            selectables: Selectables.create(eventSelectables),
          });
          expect(hiliteSet.clear).not.toHaveBeenCalled();
          expect(selectionSet.emptyAll).not.toHaveBeenCalled();
          expect(hiliteSet.models.addIds).toHaveBeenCalledExactlyOnceWith(hilited.models);
          expect(hiliteSet.subcategories.addIds).toHaveBeenCalledExactlyOnceWith(hilited.subCategories);
          expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith(hilited.elements);
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
        const hilited: HiliteSet = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
        hiliteSetProvider.getHiliteSet.mockImplementation(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "add",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledExactlyOnceWith({
            selectables: Selectables.create(eventSelectables),
          });
          expect(hiliteSet.clear).not.toHaveBeenCalled();
          expect(selectionSet.emptyAll).not.toHaveBeenCalled();
          expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
            models: hilited.models,
            subcategories: hilited.subCategories,
            elements: hilited.elements,
          });
        });
      });

      it(`[itwinjs-core@4] removes from hilite after 'remove' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV4();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({
          imodelKey: imodelAccess.key,
          source: "",
          selectables: [{ className: "BisCore.PhysicalElement", id: "0x3" }],
        });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const eventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const hilited: HiliteSet = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
        hiliteSetProvider.getHiliteSet.mockImplementation(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "remove",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledExactlyOnceWith({
            selectables: Selectables.create(eventSelectables),
          });
          expect(hiliteSet.clear).not.toHaveBeenCalled();
          expect(selectionSet.emptyAll).not.toHaveBeenCalled();
          expect(hiliteSet.models.deleteIds).toHaveBeenCalledExactlyOnceWith(hilited.models);
          expect(hiliteSet.subcategories.deleteIds).toHaveBeenCalledExactlyOnceWith(hilited.subCategories);
          expect(selectionSet.remove).toHaveBeenCalledExactlyOnceWith(hilited.elements);
        });
      });

      it(`[itwinjs-core@5] removes from hilite after 'remove' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV5();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({
          imodelKey: imodelAccess.key,
          source: "",
          selectables: [{ className: "BisCore.PhysicalElement", id: "0x3" }],
        });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const eventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const hilited: HiliteSet = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
        hiliteSetProvider.getHiliteSet.mockImplementation(() => createAsyncIterator([hilited]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "remove",
          selectables: eventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledExactlyOnceWith({
            selectables: Selectables.create(eventSelectables),
          });
          expect(hiliteSet.clear).not.toHaveBeenCalled();
          expect(selectionSet.emptyAll).not.toHaveBeenCalled();
          expect(selectionSet.remove).toHaveBeenCalledExactlyOnceWith({
            models: hilited.models,
            subcategories: hilited.subCategories,
            elements: hilited.elements,
          });
        });
      });

      it(`removes and re-adds to hilite after 'remove' event with '${source}' source`, async () => {
        const hiliteSet = createHiliteSet();
        const selectionSet = createSelectionSetV5();
        const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
        selectionStorage.addToSelection({
          imodelKey: imodelAccess.key,
          source: "",
          selectables: [{ className: "BisCore.PhysicalElement", id: "0x3" }],
        });
        using _handler = await createHandler({ selectionStorage, imodelAccess });
        resetStubs([hiliteSet, selectionSet]);

        const removeEventSelectables = [
          { className: "BisCore.Model", id: "0x1" },
          { className: "BisCore.SubCategory", id: "0x2" },
          { className: "BisCore.PhysicalElement", id: "0x3" },
        ];
        const removed: HiliteSet = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
        const readded: HiliteSet = { models: ["0x7"], subCategories: ["0x8"], elements: ["0x9"] };

        hiliteSetProvider.getHiliteSet.mockImplementation(() => createAsyncIterator([removed]));
        imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(() => createAsyncIterator([readded]));

        triggerUnifiedSelectionChange({
          imodelKey: imodelAccess.key,
          changeType: "remove",
          selectables: removeEventSelectables,
          source,
        });

        await waitFor(() => {
          expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledExactlyOnceWith({
            selectables: Selectables.create(removeEventSelectables),
          });
          expect(hiliteSet.clear).not.toHaveBeenCalled();
          expect(selectionSet.emptyAll).not.toHaveBeenCalled();
          expect(selectionSet.remove).toHaveBeenCalledExactlyOnceWith({
            models: removed.models,
            subcategories: removed.subCategories,
            elements: removed.elements,
          });
          expect(selectionSet.add.mock.invocationCallOrder[0]).toBeGreaterThan(
            selectionSet.remove.mock.invocationCallOrder[0],
          );
          expect(selectionSet.add).toHaveBeenCalledOnce();
          expect(selectionSet.add).toHaveBeenCalledWith({
            models: readded.models,
            subcategories: readded.subCategories,
            elements: readded.elements,
          });
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

      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield await firstHiliteSetPromise;
        yield await secondHiliteSetPromise;
      });

      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key });

      await waitFor(() => {
        expect(selectionSet.emptyAll).toHaveBeenCalled();
      });
      selectionSet.emptyAll.mockClear();

      await firstHiliteSetPromise.resolve({ elements: [firstElementId], models: [], subCategories: [] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: [firstElementId],
          models: [],
          subcategories: [],
        });
      });
      selectionSet.add.mockClear();

      await secondHiliteSetPromise.resolve({ elements: [secondElementId], models: [], subCategories: [] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: [secondElementId],
          models: [],
          subcategories: [],
        });
      });
    });

    it("cancels ongoing selection change handling when selection replaced", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const initialHilited = { models: ["0x1"], subCategories: ["0x2"], elements: ["0x3"] };
      const initialHilitedPromise = new ResolvablePromise<HiliteSet>();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield initialHilited;
        yield await initialHilitedPromise;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "initial",
        selectables: [{ className: "BisCore.Element", id: "0x123" }],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: initialHilited.elements,
          models: initialHilited.models,
          subcategories: initialHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const replaceHilited = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield replaceHilited;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "next",
        selectables: [{ className: "BisCore.Element", id: "0x456" }],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).toHaveBeenCalledOnce();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: replaceHilited.elements,
          models: replaceHilited.models,
          subcategories: replaceHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      await initialHilitedPromise.resolve({ elements: ["0x7"], models: ["0x8"], subCategories: ["0x9"] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("cancels ongoing selection change handling when selection cleared", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const initialHilited = { models: ["0x1"], subCategories: ["0x2"], elements: ["0x3"] };
      const initialHilitedPromise = new ResolvablePromise<HiliteSet>();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield initialHilited;
        yield await initialHilitedPromise;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "initial",
        selectables: [{ className: "BisCore.Element", id: "0x123" }],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: initialHilited.elements,
          models: initialHilited.models,
          subcategories: initialHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const clearHilited = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield clearHilited;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "next",
        changeType: "clear",
        selectables: [],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: clearHilited.elements,
          models: clearHilited.models,
          subcategories: clearHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      await initialHilitedPromise.resolve({ elements: ["0x7"], models: ["0x8"], subCategories: ["0x9"] });
      await waitFor(() => {
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("does not cancel ongoing changes when added or removed from selection", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const initialHilited = { models: ["0x1"], subCategories: ["0x2"], elements: ["0x3"] };
      const delayedInitialHilitedPromise = new ResolvablePromise<HiliteSet>();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield initialHilited;
        yield await delayedInitialHilitedPromise;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "initial",
        selectables: [{ className: "BisCore.Element", id: "0x123" }],
      });
      await waitFor(() => {
        expect(imodelHiliteSetProvider.getCurrentHiliteSet).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: initialHilited.elements,
          models: initialHilited.models,
          subcategories: initialHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {});

      const addHilited = { models: ["0x4"], subCategories: ["0x5"], elements: ["0x6"] };
      hiliteSetProvider.getHiliteSet.mockReset();
      hiliteSetProvider.getHiliteSet.mockImplementation(async function* () {
        yield addHilited;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "next",
        changeType: "add",
        selectables: [{ className: "BisCore.Element", id: "0x456" }],
      });
      await waitFor(() => {
        expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          elements: addHilited.elements,
          models: addHilited.models,
          subcategories: addHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const removeHilited = { models: ["0x7"], subCategories: ["0x8"], elements: ["0x9"] };
      hiliteSetProvider.getHiliteSet.mockReset();
      hiliteSetProvider.getHiliteSet.mockImplementation(async function* () {
        yield removeHilited;
      });
      triggerUnifiedSelectionChange({
        imodelKey: imodelAccess.key,
        source: "next",
        changeType: "remove",
        selectables: [{ className: "BisCore.Element", id: "0x456" }],
      });
      await waitFor(() => {
        expect(hiliteSetProvider.getHiliteSet).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.remove).toHaveBeenCalledExactlyOnceWith({
          elements: removeHilited.elements,
          models: removeHilited.models,
          subcategories: removeHilited.subCategories,
        });
      });
      selectionSet.resetHistory();

      const delayedInitialHilited = { models: ["0x11"], subCategories: ["0x22"], elements: ["0x33"] };
      await delayedInitialHilitedPromise.resolve(delayedInitialHilited);
      await waitFor(() => {
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
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

      const replaceHilited = { models: ["0x7"], subCategories: ["0x8"], elements: ["0x9"] };
      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield replaceHilited;
      });
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source: "Tool" });

      await waitFor(() => {
        // verify selection set was not cleared, but resulting hilite set was added to it
        expect(hiliteSet.clear).toHaveBeenCalledOnce();
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(hiliteSet.models.addIds).toHaveBeenCalledExactlyOnceWith(replaceHilited.models);
        expect(hiliteSet.subcategories.addIds).toHaveBeenCalledExactlyOnceWith(replaceHilited.subCategories);
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith(replaceHilited.elements);
      });
    });

    it("[itwinjs-core@5] does not clear selection set if unified selection change was caused by viewport", async () => {
      const hiliteSet = createHiliteSet();
      const selectionSet = createSelectionSetV5();
      const imodelAccess = createIModelAccess({ hiliteSet, selectionSet });
      using _handler = await createHandler({ selectionStorage, imodelAccess });
      resetStubs([hiliteSet, selectionSet]);

      const replaceHilited = { models: ["0x7"], subCategories: ["0x8"], elements: ["0x9"] };
      imodelHiliteSetProvider.getCurrentHiliteSet.mockReset();
      imodelHiliteSetProvider.getCurrentHiliteSet.mockImplementation(async function* () {
        yield replaceHilited;
      });
      triggerUnifiedSelectionChange({ imodelKey: imodelAccess.key, source: "Tool" });

      await waitFor(() => {
        // verify selection set was not cleared, but resulting hilite set was added to it
        expect(hiliteSet.clear).not.toHaveBeenCalled();
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith({
          models: replaceHilited.models,
          subcategories: replaceHilited.subCategories,
          elements: replaceHilited.elements,
        });
      });
    });
  });
});
