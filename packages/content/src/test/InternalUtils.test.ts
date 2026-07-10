/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
