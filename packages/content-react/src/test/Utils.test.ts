/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { abortable } from "../content-react/Utils.js";

describe("abortable", () => {
  function createSource(values: number[], options?: { hangAfter?: number }) {
    let returned = false;
    let index = 0;
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (options?.hangAfter !== undefined && index >= options.hangAfter) {
            return new Promise<IteratorResult<number>>(() => {});
          }
          return index < values.length ? { done: false, value: values[index++] } : { done: true, value: undefined };
        },
        return: async () => {
          returned = true;
          // Never settles — callers must not await it.
          return new Promise<IteratorResult<number>>(() => {});
        },
      }),
    };
    return { iterable, isReturned: () => returned };
  }

  it("yields all values without a signal", async () => {
    const { iterable } = createSource([1, 2, 3]);
    const result: number[] = [];
    for await (const value of abortable(iterable, undefined)) {
      result.push(value);
    }
    expect(result).toEqual([1, 2, 3]);
  });

  it("rejects immediately and releases the source when the signal is already aborted", async () => {
    const source = createSource([1, 2]);
    const controller = new AbortController();
    controller.abort(new Error("aborted"));

    const consume = async () => {
      for await (const _value of abortable(source.iterable, controller.signal)) {
        // no-op
      }
    };
    await expect(consume()).rejects.toThrow("aborted");
    expect(source.isReturned()).toBe(true);
  });

  it("rejects a pending value and releases the source when aborted", async () => {
    const source = createSource([1, 2], { hangAfter: 1 });
    const controller = new AbortController();
    const result: number[] = [];

    const consume = async () => {
      for await (const value of abortable(source.iterable, controller.signal)) {
        result.push(value);
        setTimeout(() => controller.abort(new Error("aborted")), 0);
      }
    };
    await expect(consume()).rejects.toThrow("aborted");
    expect(result).toEqual([1]);
    expect(source.isReturned()).toBe(true);
  });

  it("wraps a non-error abort reason into an error", async () => {
    const source = createSource([], { hangAfter: 0 });
    const controller = new AbortController();

    const consume = async () => {
      for await (const _value of abortable(source.iterable, controller.signal)) {
        // no-op
      }
    };
    const promise = consume();
    controller.abort("reason");
    await expect(promise).rejects.toThrow(
      expect.objectContaining({ message: "Operation was aborted: reason", cause: "reason" }),
    );
  });

  it("releases the source without waiting for it when the loop exits early", async () => {
    const source = createSource([1, 2, 3]);
    for await (const _value of abortable(source.iterable, undefined)) {
      break;
    }
    expect(source.isReturned()).toBe(true);
  });
});
