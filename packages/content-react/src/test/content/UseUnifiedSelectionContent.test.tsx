/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { createStorage } from "@itwin/unified-selection";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUnifiedSelectionContent } from "../../content-react/content/UseUnifiedSelectionContent.js";
import { classA, classB } from "../Helpers.js";
import { createCustomSelectable, createDescriptor, createField, createItem, createProvider } from "./Helpers.js";

import type * as presentationContentModule from "@itwin/presentation-content";
import type { Props } from "@itwin/presentation-shared";
import type { SelectionStorage } from "@itwin/unified-selection";
import type { UseUnifiedSelectionContentResult } from "../../content-react/content/UseUnifiedSelectionContent.js";

vi.mock("@itwin/presentation-content", async (importOriginal) => {
  const original = await importOriginal<typeof presentationContentModule>();
  return {
    ...original,
    createContentProvider: vi.fn(),
    createIModelContentConfiguration: vi.fn(),
    resolveContentSources: vi.fn(),
  };
});

type HookProps = Props<typeof useUnifiedSelectionContent>;

const imodelKey = "test-imodel";
const imodelAccess = { imodelKey } as HookProps["imodelAccess"];
const descriptor = createDescriptor({ fields: [createField({ id: "prop" })] });

function getLoadedTargets() {
  return vi.mocked(resolveContentSources).mock.calls.map(([{ targets }]) => targets);
}

describe("useUnifiedSelectionContent", () => {
  let storage: SelectionStorage;

  beforeEach(() => {
    storage = createStorage();
    vi.mocked(createIModelContentConfiguration).mockResolvedValue({});
    vi.mocked(resolveContentSources).mockResolvedValue([]);
    vi.mocked(createContentProvider).mockImplementation(() =>
      createProvider({
        descriptor,
        items: [
          createItem({ descriptor, values: { prop: `value ${vi.mocked(createContentProvider).mock.calls.length}` } }),
        ],
      }),
    );
  });

  function render(props?: Partial<HookProps>, options?: { strict?: boolean }) {
    return renderHook<UseUnifiedSelectionContentResult, HookProps>(useUnifiedSelectionContent, {
      initialProps: { imodelAccess, selectionStorage: storage, ...props },
      wrapper: options?.strict ? StrictMode : undefined,
    });
  }

  function select(selectables: Parameters<SelectionStorage["replaceSelection"]>[0]["selectables"], level = 0) {
    act(() => storage.replaceSelection({ imodelKey, source: "test", selectables, level }));
  }

  it("returns idle state when nothing is selected", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({
      content: undefined,
      isLoading: false,
      selectedInstancesCount: 0,
      isOverLimit: false,
      reload: expect.any(Function),
    });
    expect(resolveContentSources).not.toHaveBeenCalled();
  });

  it("loads content of the deepest selection level on mount", async () => {
    storage.replaceSelection({ imodelKey, source: "test", selectables: [{ className: classA, id: "0x1" }], level: 0 });
    storage.replaceSelection({ imodelKey, source: "test", selectables: [{ className: classB, id: "0x2" }], level: 1 });
    const { result } = render();
    expect(result.current).toMatchObject({ content: undefined, isLoading: true });

    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(result.current).toMatchObject({ isLoading: false, selectedInstancesCount: 1, isOverLimit: false });
    expect(getLoadedTargets()).toEqual([[{ primaryClass: classB, instanceIds: ["0x2"] }]]);
  });

  it("loads content of the changed selection level and clears content of the previous selection", async () => {
    const { result } = render();
    select([
      { className: classA, id: "0x1" },
      { className: classA, id: "0x2" },
    ]);
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(result.current.selectedInstancesCount).toBe(2);

    select([{ className: classB, id: "0x3" }], 1);
    expect(result.current).toMatchObject({ content: undefined, isLoading: true, selectedInstancesCount: 1 });
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(getLoadedTargets()).toEqual([
      [{ primaryClass: classA, instanceIds: ["0x1", "0x2"] }],
      [{ primaryClass: classB, instanceIds: ["0x3"] }],
    ]);

    act(() => storage.clearSelection({ imodelKey, source: "test", level: 1 }));
    expect(result.current).toMatchObject({ content: undefined, isLoading: false, selectedInstancesCount: 0 });
  });

  it("ignores selection changes of other iModels", async () => {
    const { result } = render();
    select([{ className: classA, id: "0x1" }]);
    select([{ className: classB, id: "0x2" }], 1);
    await waitFor(() => expect(result.current.content).toBeDefined());

    act(() =>
      storage.replaceSelection({ imodelKey: "other", source: "test", selectables: [{ className: classA, id: "0x3" }] }),
    );
    await waitFor(() => expect(result.current).toMatchObject({ isLoading: false, selectedInstancesCount: 1 }));
    expect(result.current.content).toBeDefined();
    expect(getLoadedTargets()).toEqual([[{ primaryClass: classB, instanceIds: ["0x2"] }]]);
  });

  it("doesn't load content when more items are selected than the limit", async () => {
    const { result } = render({ instancesLimit: 2 });
    select([
      { className: classA, id: "0x1" },
      { className: classA, id: "0x2" },
      { className: classA, id: "0x3" },
    ]);
    expect(result.current).toMatchObject({
      content: undefined,
      isLoading: false,
      selectedInstancesCount: 3,
      isOverLimit: true,
    });
    await waitFor(() => expect(resolveContentSources).not.toHaveBeenCalled());

    select([{ className: classA, id: "0x1" }]);
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(result.current.isOverLimit).toBe(false);
  });

  it("uses a limit of 100 by default", async () => {
    const { result } = render();
    select(Array.from({ length: 101 }, (_, i) => ({ className: classA, id: `0x${(i + 1).toString(16)}` })));
    expect(result.current).toMatchObject({ selectedInstancesCount: 101, isOverLimit: true });
  });

  it("keeps the active selection level when the limit changes after clearing that level", async () => {
    select([{ className: classA, id: "0x1" }]);
    select([{ className: classB, id: "0x2" }], 1);
    const { result, rerender } = render({ instancesLimit: 100 }, { strict: true });
    await waitFor(() => expect(result.current.content).toBeDefined());

    act(() => storage.clearSelection({ imodelKey, source: "test", level: 1 }));
    expect(result.current).toMatchObject({ content: undefined, selectedInstancesCount: 0, isLoading: false });

    rerender({ imodelAccess, selectionStorage: storage, instancesLimit: 200 });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ content: undefined, selectedInstancesCount: 0, isOverLimit: false });
    expect(getLoadedTargets()).toEqual([[{ primaryClass: classB, instanceIds: ["0x2"] }]]);
  });

  it("reevaluates the current selection when the limit changes", async () => {
    select(
      [
        { className: classA, id: "0x1" },
        { className: classA, id: "0x2" },
      ],
      1,
    );
    const { result, rerender } = render({ instancesLimit: 2 });
    await waitFor(() => expect(result.current.content).toBeDefined());

    rerender({ imodelAccess, selectionStorage: storage, instancesLimit: 1 });
    expect(result.current).toMatchObject({
      content: undefined,
      isLoading: false,
      selectedInstancesCount: 2,
      isOverLimit: true,
    });

    rerender({ imodelAccess, selectionStorage: storage, instancesLimit: 2 });
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(result.current).toMatchObject({ selectedInstancesCount: 2, isOverLimit: false });
    expect(getLoadedTargets()).toEqual([
      [{ primaryClass: classA, instanceIds: ["0x1", "0x2"] }],
      [{ primaryClass: classA, instanceIds: ["0x1", "0x2"] }],
    ]);
  });

  it("loads instance keys of custom selectables before loading content", async () => {
    const ready = new ResolvablePromise<void>();
    const { result } = render();
    select([createCustomSelectable("custom", [{ className: classA, id: "0x5" }], ready.promise)]);
    expect(result.current).toMatchObject({ content: undefined, isLoading: true, selectedInstancesCount: 1 });
    await waitFor(() => expect(resolveContentSources).not.toHaveBeenCalled());

    await act(async () => ready.resolve());
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(getLoadedTargets()).toEqual([[{ primaryClass: classA, instanceIds: ["0x5"] }]]);
  });

  it("doesn't load content again when a new selection has the same instances", async () => {
    const { result } = render();
    select([{ className: classA, id: "0x5" }]);
    await waitFor(() => expect(result.current.content).toBeDefined());
    const loaded = result.current.content;

    select([createCustomSelectable("custom", [{ className: classA, id: "0x5" }])]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.content).toBe(loaded);
    expect(resolveContentSources).toHaveBeenCalledOnce();
  });

  it("ignores instance keys of custom selectables of a previous selection", async () => {
    const readyWithKeys = new ResolvablePromise<void>();
    const readyWithoutKeys = new ResolvablePromise<void>();
    const { result } = render();
    select([createCustomSelectable("with-keys", [{ className: classA, id: "0x1" }], readyWithKeys.promise)]);
    select([createCustomSelectable("without-keys", [], readyWithoutKeys.promise)]);
    select([
      { className: classB, id: "0x2" },
      { className: classB, id: "0x3" },
    ]);
    await waitFor(() => expect(result.current.content).toBeDefined());

    await act(async () => {
      readyWithKeys.resolveSync();
      readyWithoutKeys.resolveSync();
    });
    expect(result.current).toMatchObject({ isLoading: false, selectedInstancesCount: 2 });
    expect(result.current.content).toBeDefined();
    expect(getLoadedTargets()).toEqual([[{ primaryClass: classB, instanceIds: ["0x2", "0x3"] }]]);
  });

  it("reports errors of loading custom selectables and retries on reload", async () => {
    const error = new Error("custom selectable error");
    let shouldFail = true;
    const { result } = render();
    select([
      {
        identifier: "custom",
        data: undefined,
        async *loadInstanceKeys() {
          if (shouldFail) {
            throw error;
          }
          yield { className: classA, id: "0x1" };
        },
      },
    ]);
    await waitFor(() => expect(result.current).toMatchObject({ content: undefined, isLoading: false, error }));

    shouldFail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(result.current.error).toBeUndefined();
  });

  it("reports custom selectable rejections without a reason and retries on reload", async () => {
    const load = vi.fn<() => Promise<void>>().mockRejectedValueOnce(undefined).mockResolvedValue(undefined);
    const loadInstanceKeys = vi.fn(async function* () {
      await load();
      yield { className: classA, id: "0x1" };
    });
    const { result } = render();
    select([{ identifier: "custom", data: undefined, loadInstanceKeys }]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ content: undefined, error: expect.any(Error) });
    expect(loadInstanceKeys).toHaveBeenCalledOnce();
    expect(resolveContentSources).not.toHaveBeenCalled();

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(result.current.error).toBeUndefined();
    expect(loadInstanceKeys).toHaveBeenCalledTimes(2);
  });

  it("reloads content of the current selection", async () => {
    const { result } = render();
    select([{ className: classA, id: "0x1" }]);
    await waitFor(() => expect(result.current.content?.items[0].values.prop).toBe("value 1"));

    act(() => result.current.reload());
    expect(result.current.content?.items[0].values.prop).toBe("value 1");
    await waitFor(() => expect(result.current.content?.items[0].values.prop).toBe("value 2"));
  });

  it("doesn't load instance keys of custom selectables again on reload", async () => {
    const custom = createCustomSelectable("custom", [{ className: classA, id: "0x1" }]);
    const loadInstanceKeys = vi.spyOn(custom, "loadInstanceKeys");
    const { result } = render();
    select([custom]);
    await waitFor(() => expect(result.current.content?.items[0].values.prop).toBe("value 1"));

    act(() => result.current.reload());
    expect(result.current).toMatchObject({ isLoading: true });
    expect(result.current.content?.items[0].values.prop).toBe("value 1");
    await waitFor(() => expect(result.current.content?.items[0].values.prop).toBe("value 2"));
    expect(loadInstanceKeys).toHaveBeenCalledOnce();
  });

  it("starts tracking selection of another iModel when `imodelAccess.imodelKey` changes", async () => {
    storage.replaceSelection({
      imodelKey: "other",
      source: "test",
      selectables: [{ className: classB, id: "0x2" }],
      level: 2,
    });
    const { result, rerender } = render();
    select([{ className: classA, id: "0x1" }], 1);
    await waitFor(() => expect(result.current.content).toBeDefined());

    rerender({ imodelAccess: { ...imodelAccess, imodelKey: "other" }, selectionStorage: storage });
    expect(result.current).toMatchObject({ content: undefined, isLoading: true });
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(getLoadedTargets().at(-1)).toEqual([{ primaryClass: classB, instanceIds: ["0x2"] }]);
  });

  it("starts tracking the deepest selection level when the selection storage changes", async () => {
    select([{ className: classA, id: "0x1" }], 1);
    const otherStorage = createStorage();
    otherStorage.replaceSelection({
      imodelKey,
      source: "test",
      selectables: [{ className: classB, id: "0x2" }],
      level: 2,
    });
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.content).toBeDefined());

    rerender({ imodelAccess, selectionStorage: otherStorage });
    expect(result.current).toMatchObject({ content: undefined, isLoading: true });
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(getLoadedTargets().at(-1)).toEqual([{ primaryClass: classB, instanceIds: ["0x2"] }]);
  });
});
