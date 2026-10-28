/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getContent } from "../../content-react/content/GetContent.js";
import { classA } from "../Helpers.js";
import { createDescriptor, createField, createItem, createProvider } from "./Helpers.js";

import type * as presentationContentModule from "@itwin/presentation-content";
import type { Props } from "@itwin/presentation-shared";

vi.mock("@itwin/presentation-content", async (importOriginal) => {
  const original = await importOriginal<typeof presentationContentModule>();
  return { ...original, createContentProvider: vi.fn(), resolveContentSources: vi.fn() };
});

describe("getContent", () => {
  const imodelAccess = {} as Props<typeof getContent>["imodelAccess"];
  const targets: presentationContentModule.ContentTarget[] = [{ primaryClass: classA, instanceIds: ["0x1"] }];
  const config: presentationContentModule.ContentConfiguration = { imodelFieldsProviders: [] };
  const getContentConfiguration = vi.fn<Props<typeof getContent>["getContentConfiguration"]>();
  const sources: presentationContentModule.ContentSource[] = [];
  const descriptor = createDescriptor({ fields: [createField({ id: "prop" })] });
  const items = [
    createItem({ descriptor, primaryKey: { className: classA, id: "0x1" }, values: { prop: "a" } }),
    createItem({ descriptor, primaryKey: { className: classA, id: "0x2" }, values: { prop: "b" } }),
  ];

  beforeEach(() => {
    getContentConfiguration.mockReset().mockResolvedValue(config);
    vi.mocked(resolveContentSources).mockResolvedValue(sources);
    vi.mocked(createContentProvider).mockReturnValue(createProvider({ descriptor, items }));
  });

  it("loads descriptor and all items using the given content configuration", async () => {
    const content = await getContent({ imodelAccess, targets, getContentConfiguration });

    expect(getContentConfiguration).toHaveBeenCalledExactlyOnceWith({ imodelAccess });
    expect(resolveContentSources).toHaveBeenCalledExactlyOnceWith({ imodelAccess, targets, config });
    expect(createContentProvider).toHaveBeenCalledExactlyOnceWith({ imodelAccess, sources, config });
    expect(content.descriptor).toBe(descriptor);
    expect(content.items).toEqual(items);
  });

  it("rejects when getting content configuration fails", async () => {
    getContentConfiguration.mockRejectedValue(new Error("config error"));
    await expect(getContent({ imodelAccess, targets, getContentConfiguration })).rejects.toThrow("config error");
    expect(resolveContentSources).not.toHaveBeenCalled();
  });

  it("rejects when aborted before loading", async () => {
    const controller = new AbortController();
    controller.abort(new Error("aborted"));
    await expect(
      getContent({ imodelAccess, targets, getContentConfiguration, abortSignal: controller.signal }),
    ).rejects.toThrow("aborted");
    expect(getContentConfiguration).not.toHaveBeenCalled();
    expect(resolveContentSources).not.toHaveBeenCalled();
  });

  it("rejects when aborted while getting content configuration", async () => {
    const controller = new AbortController();
    getContentConfiguration.mockImplementation(async () => {
      controller.abort(new Error("aborted"));
      return config;
    });
    await expect(
      getContent({ imodelAccess, targets, getContentConfiguration, abortSignal: controller.signal }),
    ).rejects.toThrow("aborted");
    expect(resolveContentSources).not.toHaveBeenCalled();
  });

  it("stops reading items when aborted", async () => {
    const controller = new AbortController();
    const onItemsIterationFinished = vi.fn();
    vi.mocked(createContentProvider).mockReturnValue(
      createProvider({ descriptor, items, itemDelay: 10, onItemsIterationFinished }),
    );
    const promise = getContent({ imodelAccess, targets, getContentConfiguration, abortSignal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 15));
    controller.abort(new Error("aborted"));

    await expect(promise).rejects.toThrow("aborted");
    expect(onItemsIterationFinished).toHaveBeenCalledOnce();
  });
});
