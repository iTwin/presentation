/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { mapItems, reduceItems } from "../content/Utilities.js";

async function* asyncIterableFrom<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe("mapItems", () => {
  it("transforms each item synchronously", async () => {
    const input = asyncIterableFrom([1, 2, 3]);
    const result: number[] = [];
    for await (const item of mapItems(input, (x) => x * 2)) {
      result.push(item);
    }
    expect(result).to.deep.equal([2, 4, 6]);
  });

  it("transforms each item asynchronously", async () => {
    const input = asyncIterableFrom(["a", "b"]);
    const result: string[] = [];
    for await (const item of mapItems(input, async (x) => `${x}!`)) {
      result.push(item);
    }
    expect(result).to.deep.equal(["a!", "b!"]);
  });

  it("yields nothing for empty iterable", async () => {
    const input = asyncIterableFrom<number>([]);
    const result: number[] = [];
    for await (const item of mapItems(input, (x) => x)) {
      result.push(item);
    }
    expect(result).to.deep.equal([]);
  });
});

describe("reduceItems", () => {
  it("accumulates values synchronously", async () => {
    const input = asyncIterableFrom([1, 2, 3]);
    const result = await reduceItems(input, (acc, item) => acc + item, 0);
    expect(result).to.equal(6);
  });

  it("accumulates values asynchronously", async () => {
    const input = asyncIterableFrom([1, 2, 3]);
    const result = await reduceItems(input, async (acc, item) => acc + item, 10);
    expect(result).to.equal(16);
  });

  it("returns initial value for empty iterable", async () => {
    const input = asyncIterableFrom<number>([]);
    const result = await reduceItems(input, (acc, item) => acc + item, 42);
    expect(result).to.equal(42);
  });
});
