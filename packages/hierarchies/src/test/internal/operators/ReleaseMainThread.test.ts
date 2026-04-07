/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseMainThreadOnItemsCount } from "../../../hierarchies/internal/operators/ReleaseMainThread.js";

describe("releaseMainThreadOnItemsCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits synchronously if number of items is smaller than given elements' count", async () => {
    const source = [1, 2, 3, 4, 5];
    const output = from(source).pipe(releaseMainThreadOnItemsCount(6));
    let releasedItemsCount = 0;
    output.subscribe({
      next() {
        ++releasedItemsCount;
      },
    });
    expect(releasedItemsCount).toBe(5);
  });

  it("emits asynchronously if number of items is larger than given elements' count", async () => {
    const source = [1, 2, 3, 4, 5];
    const output = from(source).pipe(releaseMainThreadOnItemsCount(2));
    let releasedItemsCount = 0;
    output.subscribe({
      next() {
        ++releasedItemsCount;
      },
    });
    expect(releasedItemsCount).toBe(0);
    await vi.advanceTimersToNextTimerAsync();
    expect(releasedItemsCount).toBe(2);
    await vi.advanceTimersToNextTimerAsync();
    expect(releasedItemsCount).toBe(4);
    await vi.advanceTimersToNextTimerAsync();
    expect(releasedItemsCount).toBe(5);
  });
});
