/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { describe, expect, it } from "vitest";
import { collectInParallel } from "../content/InternalUtils.js";

describe("collectInParallel", () => {
  it("returns an empty array for no items", async () => {
    expect(await collectInParallel([], async () => [1])).to.deep.equal([]);
  });

  it("concatenates the per-item arrays preserving input order", async () => {
    const result = await collectInParallel([1, 2, 3], async (n) => [n, n * 10]);
    expect(result).to.deep.equal([1, 10, 2, 20, 3, 30]);
  });

  it("preserves input order even when tasks complete out of order", async () => {
    // item 3 resolves first, item 1 last
    const gates = [new ResolvablePromise<void>(), new ResolvablePromise<void>(), new ResolvablePromise<void>()];
    const resultPromise = collectInParallel([0, 1, 2], async (i) => {
      await gates[i];
      return [i + 1, (i + 1) * 10];
    });
    // resolve out of order: 3, 2, 1
    await gates[2].resolve();
    await gates[1].resolve();
    await gates[0].resolve();
    expect(await resultPromise).to.deep.equal([1, 10, 2, 20, 3, 30]);
  });

  it("runs the callback for every item in parallel", async () => {
    const started: number[] = [];
    const res = collectInParallel([1, 2, 3], async (n) => {
      started.push(n);
      return [n];
    });
    expect(started).to.deep.equal([1, 2, 3]);
    await res;
  });
});
