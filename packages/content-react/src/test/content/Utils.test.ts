/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { deepEqual } from "../../content-react/content/internal/Utils.js";

describe("deepEqual", () => {
  it("compares primitives, dates, arrays and plain objects", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(new Date(1), new Date(1))).toBe(true);
    expect(deepEqual(new Date(1), new Date(2))).toBe(false);
    expect(deepEqual(new Date(1), 1)).toBe(false);
    expect(deepEqual([1, [2]], [1, [2]])).toBe(true);
    expect(deepEqual([1, 2], [1])).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, null)).toBe(false);
  });

  it("compares sets by their elements", () => {
    expect(deepEqual(new Set(["0x1", "0x2"]), new Set(["0x2", "0x1"]))).toBe(true);
    expect(deepEqual(new Set(["0x1"]), new Set(["0x2"]))).toBe(false);
    expect(deepEqual(new Set(["0x1"]), new Set(["0x1", "0x2"]))).toBe(false);
    expect(deepEqual(new Set(["0x1"]), ["0x1"])).toBe(false);
    expect(deepEqual(new Set(), {})).toBe(false);
  });

  it("compares maps by their keys and values", () => {
    expect(deepEqual(new Map([["a", { b: 1 }]]), new Map([["a", { b: 1 }]]))).toBe(true);
    expect(deepEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(deepEqual(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
    expect(deepEqual(new Map([["a", 1]]), new Map())).toBe(false);
    expect(deepEqual(new Map(), {})).toBe(false);
  });

  it("compares sets nested in content target bindings", () => {
    const createTargets = (ids: string[]) => [
      {
        primaryClass: "TestSchema.A",
        instanceFilter: {
          expression: "this.ECInstanceId IN (:ids)",
          bindings: { ids: { type: "idset", value: new Set(ids) } },
        },
      },
    ];
    expect(deepEqual(createTargets(["0x1"]), createTargets(["0x1"]))).toBe(true);
    expect(deepEqual(createTargets(["0x1"]), createTargets(["0x2"]))).toBe(false);
  });
});
