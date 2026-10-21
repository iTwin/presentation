/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultValueFormatter, formatConcatenatedValue } from "../shared/Formatting.js";
import { julianToDateTime } from "../shared/Utils.js";

import type { IPrimitiveValueFormatter } from "../shared/Formatting.js";
import type { TypedPrimitiveValue } from "../shared/Values.js";

describe("createDefaultValueFormatter", () => {
  let valueFormatter: IPrimitiveValueFormatter;

  beforeEach(() => {
    valueFormatter = createDefaultValueFormatter();
  });

  it("formats boolean values", async () => {
    expect(await valueFormatter({ type: "Boolean", value: false })).toBe("false");
    expect(await valueFormatter({ type: "Boolean", value: true })).toBe("true");
  });

  it("formats integer values", async () => {
    expect(await valueFormatter({ type: "Integer", value: 0 })).toBe("0");
    expect(await valueFormatter({ type: "Integer", value: 1.23 })).toBe("1");
    expect(await valueFormatter({ type: "Integer", value: 7.89 })).toBe("8");
  });

  it("formats long values", async () => {
    expect(await valueFormatter({ type: "Long", value: 0 })).toBe("0");
    expect(await valueFormatter({ type: "Long", value: 1.23 })).toBe("1");
    expect(await valueFormatter({ type: "Long", value: 7.89 })).toBe("8");
    expect(await valueFormatter({ type: "Long", value: Number.MAX_SAFE_INTEGER })).toBe(
      Number.MAX_SAFE_INTEGER.toLocaleString(),
    );
  });

  it("formats double values", async () => {
    expect(await valueFormatter({ type: "Double", value: 0 })).toBe(
      Number(0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    expect(await valueFormatter({ type: "Double", value: 1.23 })).toBe(Number(1.23).toLocaleString());
    expect(await valueFormatter({ type: "Double", value: 4.56789 })).toBe(Number(4.57).toLocaleString());
  });

  it("formats date values", async () => {
    const date = new Date();
    expect(await valueFormatter({ type: "DateTime", value: 0 })).toBe(julianToDateTime(0).toLocaleString());
    expect(await valueFormatter({ type: "DateTime", value: date.toISOString() })).toBe(date.toLocaleString());
    expect(await valueFormatter({ type: "DateTime", value: date })).toBe(date.toLocaleString());
    expect(await valueFormatter({ type: "DateTime", extendedType: "ShortDate", value: date })).toBe(
      date.toLocaleDateString(),
    );
  });

  it("formats point2d values", async () => {
    expect(await valueFormatter({ type: "Point2d", value: { x: 1, y: 2 } })).toBe(
      `(${await valueFormatter({ type: "Double", value: 1 })}, ${await valueFormatter({ type: "Double", value: 2 })})`,
    );
  });

  it("formats point3d values", async () => {
    expect(await valueFormatter({ type: "Point3d", value: { x: 1, y: 2, z: 3 } })).toBe(
      `(${await valueFormatter({ type: "Double", value: 1 })}, ${await valueFormatter({ type: "Double", value: 2 })}, ${await valueFormatter({ type: "Double", value: 3 })})`,
    );
  });

  it("returns id values as-is", async () => {
    expect(await valueFormatter({ type: "Id", value: "0x123" })).toBe("0x123");
  });

  it("returns string values as-is", async () => {
    expect(await valueFormatter({ type: "String", value: "xxx" })).toBe("xxx");
  });
});

describe("formatConcatenatedValue", () => {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const valueFormatter = vi.fn(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);

  it("returns formatted string", async () => {
    const result = await formatConcatenatedValue({ value: "test label", valueFormatter });
    expect(valueFormatter).toHaveBeenCalledExactlyOnceWith({ value: "test label", type: "String" });
    expect(result).toBe("_test label_");
  });

  it("returns combined strings", async () => {
    const result = await formatConcatenatedValue({ value: ["test1", "-", "test2"], valueFormatter });
    expect(valueFormatter).toHaveBeenCalledTimes(3);
    expect(valueFormatter).toHaveBeenNthCalledWith(1, { value: "test1", type: "String" });
    expect(valueFormatter).toHaveBeenNthCalledWith(2, { value: "-", type: "String" });
    expect(valueFormatter).toHaveBeenNthCalledWith(3, { value: "test2", type: "String" });
    expect(result).toBe("_test1__-__test2_");
  });

  it("returns formatted combined typed primitive values", async () => {
    const result = await formatConcatenatedValue({
      value: [
        { type: "Integer", value: 123 },
        { type: "String", value: "!" },
      ],
      valueFormatter,
    });
    expect(valueFormatter).toHaveBeenCalledTimes(2);
    expect(valueFormatter).toHaveBeenNthCalledWith(1, { type: "Integer", value: 123 });
    expect(valueFormatter).toHaveBeenNthCalledWith(2, { type: "String", value: "!" });
    expect(result).toBe("_123__!_");
  });
});
