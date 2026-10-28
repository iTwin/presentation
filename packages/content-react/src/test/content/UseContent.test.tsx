/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BeEvent } from "@itwin/core-bentley";
import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useContent } from "../../content-react/content/UseContent.js";
import { classA } from "../Helpers.js";
import { createDeferred, createDescriptor, createField, createItem, createProvider } from "./Helpers.js";

import type * as presentationContentModule from "@itwin/presentation-content";
import type { Props } from "@itwin/presentation-shared";
import type { UseContentResult } from "../../content-react/content/UseContent.js";

vi.mock("@itwin/presentation-content", async (importOriginal) => {
  const original = await importOriginal<typeof presentationContentModule>();
  return {
    ...original,
    createContentProvider: vi.fn(),
    createIModelContentConfiguration: vi.fn(),
    resolveContentSources: vi.fn(),
  };
});

type UseContentProps = Props<typeof useContent>;
type ContentSource = presentationContentModule.ContentSource;

const descriptor = createDescriptor({ fields: [createField({ id: "prop" })] });
const targetsA: presentationContentModule.ContentTarget[] = [{ primaryClass: classA, instanceIds: ["0x1"] }];
const targetsB: presentationContentModule.ContentTarget[] = [{ primaryClass: classA, instanceIds: ["0x2"] }];
const imodelAccess = {} as UseContentProps["imodelAccess"];

function getValue(result: UseContentResult) {
  return result.content?.items[0]?.values.prop;
}

describe("useContent", () => {
  beforeEach(() => {
    vi.mocked(createIModelContentConfiguration).mockResolvedValue({});
    vi.mocked(resolveContentSources).mockResolvedValue([]);
    // Each load gets a provider whose value tells which load it was.
    vi.mocked(createContentProvider).mockImplementation(() =>
      createProvider({
        descriptor,
        items: [
          createItem({ descriptor, values: { prop: `value ${vi.mocked(createContentProvider).mock.calls.length}` } }),
        ],
      }),
    );
  });

  function render(initialProps: UseContentProps, options?: { strict?: boolean }) {
    return renderHook<UseContentResult, UseContentProps>(useContent, {
      initialProps,
      wrapper: options?.strict ? StrictMode : undefined,
    });
  }

  it("returns idle state and doesn't load when there are no targets", async () => {
    const { result, rerender } = render({ imodelAccess, targets: undefined });
    expect(result.current).toEqual({ content: undefined, isLoading: false, reload: expect.any(Function) });

    rerender({ imodelAccess, targets: [] });
    expect(result.current).toEqual({ content: undefined, isLoading: false, reload: expect.any(Function) });
    await waitFor(() => expect(resolveContentSources).not.toHaveBeenCalled());
  });

  it("loads content for targets", async () => {
    const { result } = render({ imodelAccess, targets: targetsA });
    expect(result.current).toEqual({ content: undefined, isLoading: true, reload: expect.any(Function) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.content?.descriptor).toBe(descriptor);
    expect(getValue(result.current)).toBe("value 1");
    expect(result.current.error).toBeUndefined();
    expect(createIModelContentConfiguration).toHaveBeenCalledExactlyOnceWith({ imodelAccess });
    expect(resolveContentSources).toHaveBeenCalledExactlyOnceWith({ imodelAccess, targets: targetsA, config: {} });
  });

  it("doesn't load again when targets change only by reference", async () => {
    const { result, rerender } = render({ imodelAccess, targets: targetsA });
    await waitFor(() => expect(result.current.content).toBeDefined());
    const loaded = result.current;

    rerender({ imodelAccess, targets: [{ primaryClass: classA, instanceIds: ["0x1"] }] });
    await waitFor(() => expect(result.current).toBe(loaded));
    expect(resolveContentSources).toHaveBeenCalledOnce();
  });

  it("clears content when targets change and ignores results of earlier loads", async () => {
    const slowSources = createDeferred<ContentSource[]>();
    vi.mocked(resolveContentSources)
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(slowSources.promise)
      .mockResolvedValueOnce([]);
    const { result, rerender } = render({ imodelAccess, targets: [{ primaryClass: classA }] });
    await waitFor(() => expect(getValue(result.current)).toBe("value 1"));

    rerender({ imodelAccess, targets: targetsA });
    expect(result.current).toEqual({ content: undefined, isLoading: true, reload: expect.any(Function) });
    await waitFor(() => expect(resolveContentSources).toHaveBeenCalledTimes(2));

    rerender({ imodelAccess, targets: targetsB });
    await waitFor(() => expect(getValue(result.current)).toBe("value 2"));

    await act(async () => slowSources.resolve([]));
    expect(getValue(result.current)).toBe("value 2");
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps content while reloading", async () => {
    const { result } = render({ imodelAccess, targets: targetsA });
    await waitFor(() => expect(getValue(result.current)).toBe("value 1"));

    act(() => result.current.reload());
    expect(result.current.isLoading).toBe(true);
    expect(getValue(result.current)).toBe("value 1");

    await waitFor(() => expect(getValue(result.current)).toBe("value 2"));
    expect(result.current.isLoading).toBe(false);
    expect(createIModelContentConfiguration).toHaveBeenCalledOnce();
  });

  it("reloads content once after a burst of iModel change events, reusing content configuration", async () => {
    const imodelChanged = new BeEvent<() => void>();
    const { result } = render({ imodelAccess, imodelChanged, targets: targetsA });
    await waitFor(() => expect(getValue(result.current)).toBe("value 1"));

    act(() => {
      imodelChanged.raiseEvent();
      imodelChanged.raiseEvent();
      imodelChanged.raiseEvent();
    });
    expect(result.current.isLoading).toBe(false);

    await waitFor(() => expect(getValue(result.current)).toBe("value 2"));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 150)));
    expect(resolveContentSources).toHaveBeenCalledTimes(2);
    expect(createIModelContentConfiguration).toHaveBeenCalledOnce();
  });

  it.each([new Error("loading error"), undefined, null, false, 0, "loading error"])(
    "reports loading errors and recovers on reload: %s",
    async (error) => {
      vi.mocked(resolveContentSources).mockRejectedValueOnce(error);
      const { result } = render({ imodelAccess, targets: targetsA });
      await waitFor(() =>
        expect(result.current).toEqual({
          content: undefined,
          isLoading: false,
          error: error === undefined ? expect.any(Error) : error,
          reload: expect.any(Function),
        }),
      );

      act(() => result.current.reload());
      expect(result.current).toEqual({ content: undefined, isLoading: true, reload: expect.any(Function) });
      await waitFor(() => expect(getValue(result.current)).toBe("value 1"));
      expect(result.current.error).toBeUndefined();
      expect(createIModelContentConfiguration).toHaveBeenCalledOnce();
    },
  );

  it("creates content configuration again after creating it failed", async () => {
    const error = new Error("configuration error");
    const getContentConfiguration = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({});
    const { result } = render({ imodelAccess, targets: targetsA, getContentConfiguration });
    await waitFor(() => expect(result.current.error).toBe(error));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.content).toBeDefined());
    expect(getContentConfiguration).toHaveBeenCalledTimes(2);
    expect(getContentConfiguration).toHaveBeenCalledWith({ imodelAccess });
    expect(createIModelContentConfiguration).not.toHaveBeenCalled();
  });

  it("clears content when targets are cleared", async () => {
    const { result, rerender } = render({ imodelAccess, targets: targetsA });
    await waitFor(() => expect(result.current.content).toBeDefined());

    rerender({ imodelAccess, targets: undefined });
    expect(result.current).toEqual({ content: undefined, isLoading: false, reload: expect.any(Function) });
  });

  it("loads content again when the data source changes", async () => {
    const getContentConfiguration = vi.fn(async () => ({}));
    const { result, rerender } = render({ imodelAccess, targets: targetsA });
    await waitFor(() => expect(getValue(result.current)).toBe("value 1"));

    rerender({ imodelAccess, targets: targetsA, getContentConfiguration });
    expect(result.current).toEqual({ content: undefined, isLoading: true, reload: expect.any(Function) });
    await waitFor(() => expect(getValue(result.current)).toBe("value 2"));
    expect(getContentConfiguration).toHaveBeenCalledOnce();

    const otherIModelAccess = {} as UseContentProps["imodelAccess"];
    rerender({ imodelAccess: otherIModelAccess, targets: targetsA, getContentConfiguration });
    expect(result.current).toEqual({ content: undefined, isLoading: true, reload: expect.any(Function) });
    await waitFor(() => expect(getValue(result.current)).toBe("value 3"));
    expect(getContentConfiguration).toHaveBeenLastCalledWith({ imodelAccess: otherIModelAccess });
  });
});
