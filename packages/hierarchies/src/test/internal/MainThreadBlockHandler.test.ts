/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { DEFAULT_MAIN_THREAD_RELEASE_THRESHOLD, MainThreadBlockHandler } from "../../hierarchies/internal/MainThreadBlockHandler";

describe("MainThreadBlockHandler", () => {
  it("releases the main thread", async () => {
    const blockHandler = new MainThreadBlockHandler();
    let lastIntervalInvokeTime = performance.now();
    const interval = setInterval(() => {
      lastIntervalInvokeTime = performance.now();
    }, 5);

    try {
      // Simulate some long work
      const invokeTimeBeforeLoop = lastIntervalInvokeTime;
      while (performance.now() - invokeTimeBeforeLoop < DEFAULT_MAIN_THREAD_RELEASE_THRESHOLD) {}

      expect(lastIntervalInvokeTime).to.eq(invokeTimeBeforeLoop);
      await blockHandler.releaseMainThreadIfTimeElapsed();
      expect(lastIntervalInvokeTime).to.be.greaterThan(invokeTimeBeforeLoop);
    } finally {
      clearInterval(interval);
    }
  });

  it("does not create a promise if main thread release is not needed", async () => {
    const performanceNowMock = sinon.stub(performance, "now");
    performanceNowMock.returns(0);

    const blockHandler = new MainThreadBlockHandler(1000);
    expect(blockHandler.releaseMainThreadIfTimeElapsed()).to.be.undefined;

    performanceNowMock.returns(500);
    expect(blockHandler.releaseMainThreadIfTimeElapsed()).to.be.undefined;

    performanceNowMock.returns(1001);
    const x = blockHandler.releaseMainThreadIfTimeElapsed();
    expect(x).to.be.instanceOf(Promise);
    await x;
  });
});
