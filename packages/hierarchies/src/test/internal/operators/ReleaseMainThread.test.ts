/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import sinon from "sinon";
import { releaseMainThreadOnItemsCount } from "../../../hierarchies/internal/operators/ReleaseMainThread.js";

describe("releaseMainThreadOnItemsCount", () => {
  let timers: sinon.SinonFakeTimers;

  beforeEach(() => {
    timers = sinon.useFakeTimers();
  });

  afterEach(() => {
    timers.restore();
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
    expect(releasedItemsCount).to.eq(5);
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
    expect(releasedItemsCount).to.eq(0);
    await timers.nextAsync();
    expect(releasedItemsCount).to.eq(2);
    await timers.nextAsync();
    expect(releasedItemsCount).to.eq(4);
    await timers.nextAsync();
    expect(releasedItemsCount).to.eq(5);
  });
});
