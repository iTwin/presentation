/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { safeDispose } from "../unified-selection/Utils.js";

describe("safeDispose", () => {
  it("disposes object with `Symbol.dispose` method", () => {
    const disposable = { [Symbol.dispose]: vi.fn() };
    safeDispose(disposable);
    expect(disposable[Symbol.dispose]).toHaveBeenCalledOnce();
  });

  it("disposes object with `dispose` method", () => {
    const disposable = { dispose: vi.fn() };
    safeDispose(disposable);
    expect(disposable.dispose).toHaveBeenCalledOnce();
  });

  it("does nothing with non-disposable object", () => {
    const disposable = { x: 123 };
    expect(() => safeDispose(disposable)).not.toThrow();
  });
});
