/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { executionAsyncId } from "node:async_hooks";
import sinon from "sinon";
import { createMainThreadReleaseOnTimePassedHandler } from "../../hierarchies/internal/ReleaseMainThread";

describe("createMainThreadReleaseOnTimePassedHandler", () => {
  let nowStub: sinon.SinonStub;

  beforeEach(() => {
    nowStub = sinon.stub(Date, "now");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("creates a handler that released main thread after specified time", async () => {
    nowStub.onCall(0).returns(0); // starting position - called when creating the handler
    nowStub.onCall(1).returns(10); // called on first handler invocation
    nowStub.onCall(2).returns(15); // called when first handler invocation resolves the `setTimeout` promise
    nowStub.onCall(3).returns(24); // called on second handler invocation - not enough to release the main thread
    nowStub.onCall(4).returns(25); // called on third handler invocation
    nowStub.onCall(5).returns(25); // called when third handler invocation resolves the `setTimeout` promise

    const mainAsyncId = executionAsyncId();
    let currAsyncId = mainAsyncId;

    const handler = createMainThreadReleaseOnTimePassedHandler(10);
    expect(nowStub.callCount).to.eq(1);

    let result = handler();
    expect(nowStub.callCount).to.eq(2);
    expect(result).to.be.instanceOf(Promise);
    await result;
    expect(nowStub.callCount).to.eq(3);
    currAsyncId = executionAsyncId();
    expect(currAsyncId).to.not.eq(mainAsyncId);

    result = handler();
    expect(nowStub.callCount).to.eq(4);
    expect(result).to.be.undefined;

    result = handler();
    expect(nowStub.callCount).to.eq(5);
    expect(result).to.be.instanceOf(Promise);
    await result;
    expect(nowStub.callCount).to.eq(6);
    currAsyncId = executionAsyncId();
    expect(currAsyncId).to.not.eq(mainAsyncId);
  });

  it("does not create a promise if main thread release is not needed", async () => {
    nowStub.returns(0);

    const handler = createMainThreadReleaseOnTimePassedHandler(undefined); // default to `40`
    expect(handler()).to.be.undefined;

    nowStub.returns(1);
    expect(handler()).to.be.undefined;

    nowStub.returns(39);
    expect(handler()).to.be.undefined;

    nowStub.returns(40);
    const result = handler();
    expect(result).to.be.instanceOf(Promise);
    await result;
  });
});
