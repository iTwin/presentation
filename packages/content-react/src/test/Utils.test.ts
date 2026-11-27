/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { abortable, abortableIterable } from "../content-react/Utils.js";

describe("abortable", () => {
  it("resolves with the result of the load", async () => {
    await expect(abortable(async () => 1, undefined)).resolves.toBe(1);
    await expect(abortable(async () => 1, new AbortController().signal)).resolves.toBe(1);
  });

  it("rejects with the load's error", async () => {
    const error = new Error("load error");
    await expect(
      abortable(async () => {
        throw error;
      }, new AbortController().signal),
    ).rejects.toBe(error);
  });

  it("doesn't start the load when the signal is already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("aborted");
    controller.abort(reason);
    let started = false;
    await expect(
      abortable(async () => {
        started = true;
      }, controller.signal),
    ).rejects.toBe(reason);
    expect(started).toBe(false);
  });

  it("rejects with the signal's reason without waiting for a pending load", async () => {
    const controller = new AbortController();
    const promise = abortable(async () => new Promise<never>(() => {}), controller.signal);
    controller.abort("reason");
    await expect(promise).rejects.toBe("reason");
  });

  it("rejects when the signal is aborted after the load settles but before its result is returned", async () => {
    const controller = new AbortController();
    const reason = new Error("aborted");
    const promise = abortable(async () => {
      queueMicrotask(() => controller.abort(reason));
      return 1;
    }, controller.signal);
    await expect(promise).rejects.toBe(reason);
  });

  it("rejects without waiting for a pending load that aborts the signal when it starts", async () => {
    const controller = new AbortController();
    const reason = new Error("aborted");
    const promise = abortable(async () => {
      controller.abort(reason);
      return new Promise<never>(() => {});
    }, controller.signal);
    await expect(promise).rejects.toBe(reason);
  });
});

describe("abortableIterable", () => {
  function createSource(values: number[], options?: { hangAfter?: number; endAfterAbort?: AbortSignal }) {
    let returned = false;
    let index = 0;
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (options?.endAfterAbort && index >= values.length) {
            const signal = options.endAfterAbort;
            return new Promise<IteratorResult<number>>((resolve) =>
              signal.addEventListener("abort", () => setTimeout(() => resolve({ done: true, value: undefined }), 0)),
            );
          }
          if (options?.hangAfter !== undefined && index >= options.hangAfter) {
            return new Promise<IteratorResult<number>>(() => {});
          }
          return index < values.length ? { done: false, value: values[index++] } : { done: true, value: undefined };
        },
        return: async () => {
          returned = true;
          // Never settles - callers must not await it.
          return new Promise<IteratorResult<number>>(() => {});
        },
      }),
    };
    return { iterable, isReturned: () => returned };
  }

  async function collect(items: AsyncIterable<number>) {
    const result: number[] = [];
    for await (const value of items) {
      result.push(value);
    }
    return result;
  }

  it("yields all items", async () => {
    await expect(collect(abortableIterable(createSource([1, 2, 3]).iterable, undefined))).resolves.toEqual([1, 2, 3]);
    await expect(
      collect(abortableIterable(createSource([1, 2, 3]).iterable, new AbortController().signal)),
    ).resolves.toEqual([1, 2, 3]);
  });

  it("rejects and releases the source when the signal is already aborted", async () => {
    const source = createSource([1, 2]);
    const controller = new AbortController();
    const reason = new Error("aborted");
    controller.abort(reason);
    await expect(collect(abortableIterable(source.iterable, controller.signal))).rejects.toBe(reason);
    expect(source.isReturned()).toBe(true);
  });

  it("rejects with the signal's reason and releases the source when aborted while an item is pending", async () => {
    const source = createSource([1, 2], { hangAfter: 1 });
    const controller = new AbortController();
    const result: number[] = [];
    const consume = async () => {
      for await (const value of abortableIterable(source.iterable, controller.signal)) {
        result.push(value);
        setTimeout(() => controller.abort("reason"), 0);
      }
    };
    await expect(consume()).rejects.toBe("reason");
    expect(result).toEqual([1]);
    expect(source.isReturned()).toBe(true);
  });

  it("rejects when the source completes after the signal is aborted", async () => {
    const controller = new AbortController();
    const source = createSource([1], { endAfterAbort: controller.signal });
    const reason = new Error("aborted");
    const promise = collect(abortableIterable(source.iterable, controller.signal));
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(reason);
    await expect(promise).rejects.toBe(reason);
  });

  it("rejects without waiting for a pending item whose read aborts the signal", async () => {
    const controller = new AbortController();
    const reason = new Error("aborted");
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          controller.abort(reason);
          return new Promise<never>(() => {});
        },
      }),
    };
    await expect(collect(abortableIterable(iterable, controller.signal))).rejects.toBe(reason);
  });

  it("releases the source without waiting for it when the loop exits early", async () => {
    const source = createSource([1, 2, 3]);
    for await (const _value of abortableIterable(source.iterable, undefined)) {
      break;
    }
    expect(source.isReturned()).toBe(true);
  });

  it("releases the source only once", async () => {
    let returnCount = 0;
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new Error("read error");
        },
        return: async () => {
          ++returnCount;
          return { done: true, value: undefined };
        },
      }),
    };
    const iterator = abortableIterable(iterable, undefined)[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("read error");
    await iterator.return!();
    expect(returnCount).toBe(1);
  });

  it("ignores errors of releasing the source", async () => {
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false, value: 1 }),
        return: async () => {
          throw new Error("return error");
        },
      }),
    };
    for await (const _value of abortableIterable(iterable, undefined)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
