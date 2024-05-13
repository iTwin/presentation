/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Subject } from "rxjs";
import sinon from "sinon";
import { DEFAULT_MAIN_THREAD_RELEASE_THRESHOLD, MainThreadBlockHandler, releaseMainThreadOnItemsCount } from "../shared/MainThreadBlockHandler";

describe("MainThreadBlockHandler", () => {
  it("releases the main thread", async () => {
    const blockHandler = new MainThreadBlockHandler({});
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

  it("logs when releasing the main thread and logger passed", async () => {
    const onReleaseSpy = sinon.spy();
    const blockHandler = new MainThreadBlockHandler({ onRelease: onReleaseSpy });
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
      expect(onReleaseSpy).to.be.calledOnce;
    } finally {
      clearInterval(interval);
    }
  });

  it("does not create a promise if main thread release is not needed", async () => {
    const performanceNowMock = sinon.stub(performance, "now");
    performanceNowMock.returns(0);

    const blockHandler = new MainThreadBlockHandler({ releaseThreshold: 1000 });
    expect(blockHandler.releaseMainThreadIfTimeElapsed()).to.be.undefined;

    performanceNowMock.returns(500);
    expect(blockHandler.releaseMainThreadIfTimeElapsed()).to.be.undefined;

    performanceNowMock.returns(1001);
    const x = blockHandler.releaseMainThreadIfTimeElapsed();
    expect(x).to.be.instanceOf(Promise);
    await x;
  });
});

describe("releaseMainThreadOnItemsCount", () => {
  it("only releases main thread when element count reached", () => {
    const onReleaseSpy = sinon.spy();
    const subject = new Subject<number>();

    const observable = subject.pipe(releaseMainThreadOnItemsCount(2, onReleaseSpy));
    observable.subscribe();

    subject.next(1);
    expect(onReleaseSpy).to.not.be.called;

    subject.next(2);
    expect(onReleaseSpy).to.be.calledOnce;
    onReleaseSpy.resetHistory();

    subject.next(3);
    subject.complete();
    expect(onReleaseSpy).to.not.be.called;
  });
});
