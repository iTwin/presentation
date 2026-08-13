/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { registerTxnListeners } from "../core-interop/Transactions.js";

describe("registerTxnListeners", () => {
  it("calls provided callback on `onAppliedChanges` event", async () => {
    const txns = createCoreTxnManager();
    const callback = vi.fn();
    registerTxnListeners(txns, callback);
    expect(txns.onChangesApplied.addListener).toHaveBeenCalledOnce();
    txns.onChangesApplied.addListener.mock.calls[0][0]();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("calls provided callback on `onCommit` and `onCommitted` event", async () => {
    const txns = createCoreTxnManager();
    const callback = vi.fn();
    registerTxnListeners(txns, callback);
    expect(txns.onCommit.addListener).toHaveBeenCalledOnce();
    expect(txns.onCommitted.addListener).toHaveBeenCalledOnce();
    txns.onCommit.addListener.mock.calls[0][0]();
    txns.onCommitted.addListener.mock.calls[0][0]();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("doesn't call provided callback on `onCommitted` event if there was no `onCommit` event", async () => {
    const txns = createCoreTxnManager();
    const callback = vi.fn();
    registerTxnListeners(txns, callback);
    expect(txns.onCommit.addListener).toHaveBeenCalledOnce();
    expect(txns.onCommitted.addListener).toHaveBeenCalledOnce();
    txns.onCommitted.addListener.mock.calls[0][0]();
    expect(callback).not.toHaveBeenCalled();
  });

  it("unregisters from events when returned function is called", async () => {
    const txns = createCoreTxnManager();
    const unregister = registerTxnListeners(txns, vi.fn());
    expect(txns.onCommit.hasListeners()).toBe(true);
    expect(txns.onCommitted.hasListeners()).toBe(true);
    expect(txns.onChangesApplied.hasListeners()).toBe(true);
    unregister();
    expect(txns.onCommit.hasListeners()).toBe(false);
    expect(txns.onCommitted.hasListeners()).toBe(false);
    expect(txns.onChangesApplied.hasListeners()).toBe(false);
  });

  function createCoreTxnManager() {
    return { onCommit: createEventStub(), onCommitted: createEventStub(), onChangesApplied: createEventStub() };
  }

  function createEventStub() {
    let hasListeners = false;
    return {
      hasListeners: () => hasListeners,
      addListener: vi.fn((_listener: () => void) => {
        hasListeners = true;
        return () => {
          hasListeners = false;
        };
      }),
      removeListener: vi.fn(),
    };
  }
});
