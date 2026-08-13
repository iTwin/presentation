/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { hasChildren, safeDispose } from "../../hierarchies/internal/Common.js";

describe("hasChildren", () => {
  it("returns correct value", () => {
    expect(hasChildren({ children: undefined })).toBe(false);
    expect(hasChildren({ children: false })).toBe(false);
    expect(hasChildren({ children: [] })).toBe(false);
    expect(hasChildren({ children: true })).toBe(true);
    expect(hasChildren({ children: [1] })).toBe(true);
  });
});

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
