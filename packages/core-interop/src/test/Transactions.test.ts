/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { registerTxnListeners } from "../core-interop/Transactions";

describe("registerTxnListeners", () => {
  it("calls provided callback on `onAppliedChanges` event", async () => {
    const txns = createCoreTxnManager();
    const callback = sinon.stub();
    registerTxnListeners(txns, callback);
    expect(txns.onChangesApplied.addListener).to.be.calledOnce;
    txns.onChangesApplied.addListener.firstCall.callArg(0);
    expect(callback).to.be.calledOnce;
  });

  it("calls provided callback on `onCommit` and `onCommitted` event", async () => {
    const txns = createCoreTxnManager();
    const callback = sinon.stub();
    registerTxnListeners(txns, callback);
    expect(txns.onCommit.addListener).to.be.calledOnce;
    expect(txns.onCommitted.addListener).to.be.calledOnce;
    txns.onCommit.addListener.firstCall.callArg(0);
    txns.onCommitted.addListener.firstCall.callArg(0);
    expect(callback).to.be.calledOnce;
  });

  it("doesn't call provided callback on `onCommitted` event if there was no `onCommit` event", async () => {
    const txns = createCoreTxnManager();
    const callback = sinon.stub();
    registerTxnListeners(txns, callback);
    expect(txns.onCommit.addListener).to.be.calledOnce;
    expect(txns.onCommitted.addListener).to.be.calledOnce;
    txns.onCommitted.addListener.firstCall.callArg(0);
    expect(callback).to.not.be.called;
  });

  it("unregisters from events when returned function is called", async () => {
    const txns = createCoreTxnManager();
    const unregister = registerTxnListeners(txns, sinon.stub());
    expect(txns.onCommit.hasListeners()).to.be.true;
    expect(txns.onCommitted.hasListeners()).to.be.true;
    expect(txns.onChangesApplied.hasListeners()).to.be.true;
    unregister();
    expect(txns.onCommit.hasListeners()).to.be.false;
    expect(txns.onCommitted.hasListeners()).to.be.false;
    expect(txns.onChangesApplied.hasListeners()).to.be.false;
  });

  function createCoreTxnManager() {
    return {
      onCommit: createEventStub(),
      onCommitted: createEventStub(),
      onChangesApplied: createEventStub(),
    };
  }

  function createEventStub() {
    let hasListeners = false;
    return {
      hasListeners: () => hasListeners,
      addListener: sinon.fake(() => {
        hasListeners = true;
        return () => {
          hasListeners = false;
        };
      }),
      removeListener: sinon.stub(),
    };
  }
});
