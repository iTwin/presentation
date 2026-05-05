/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { ECSqlBinding } from "@itwin/presentation-shared";
import { formIdBindings, safeDispose } from "../unified-selection/Utils.js";

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

describe("formIdBindings", () => {
  it("returns InVirtualSet binding when array has more than 1000 ids", () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `0x${(i + 1).toString(16)}`);
    const bindings: ECSqlBinding[] = [];
    const result = formIdBindings("ECInstanceId", ids, bindings);
    expect(result).toBe("InVirtualSet(?, ECInstanceId)");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toEqual({ type: "idset", value: ids });
  });

  it("returns InVirtualSet binding when Set has more than 1000 ids", () => {
    const idsArray = Array.from({ length: 1001 }, (_, i) => `0x${(i + 1).toString(16)}`);
    const ids = new Set(idsArray);
    const bindings: ECSqlBinding[] = [];
    const result = formIdBindings("ECInstanceId", ids, bindings);
    expect(result).toBe("InVirtualSet(?, ECInstanceId)");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toEqual({ type: "idset", value: idsArray });
  });

  it("returns FALSE when ids are empty", () => {
    const bindings: ECSqlBinding[] = [];
    const result = formIdBindings("ECInstanceId", [], bindings);
    expect(result).toBe("FALSE");
    expect(bindings).toHaveLength(0);
  });

  it("returns IN clause with bindings for small number of ids", () => {
    const ids = ["0x1", "0x2", "0x3"];
    const bindings: ECSqlBinding[] = [];
    const result = formIdBindings("ECInstanceId", ids, bindings);
    expect(result).toBe("ECInstanceId IN (?,?,?)");
    expect(bindings).toHaveLength(3);
    expect(bindings).toEqual([
      { type: "id", value: "0x1" },
      { type: "id", value: "0x2" },
      { type: "id", value: "0x3" },
    ]);
  });
});
