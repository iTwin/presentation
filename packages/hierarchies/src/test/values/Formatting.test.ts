/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { julianToDateTime } from "../../hierarchies/internal/Common";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "../../hierarchies/values/Formatting";

describe("createDefaultValueFormatter", () => {
  let formatter: IPrimitiveValueFormatter;

  beforeEach(() => {
    formatter = createDefaultValueFormatter();
  });

  it("formats boolean values", async () => {
    expect(await formatter({ type: "Boolean", value: false })).to.eq("false");
    expect(await formatter({ type: "Boolean", value: true })).to.eq("true");
  });

  it("formats integer values", async () => {
    expect(await formatter({ type: "Integer", value: 0 })).to.eq("0");
    expect(await formatter({ type: "Integer", value: 1.23 })).to.eq("1");
    expect(await formatter({ type: "Integer", value: 7.89 })).to.eq("8");
  });

  it("formats long values", async () => {
    expect(await formatter({ type: "Long", value: 0 })).to.eq("0");
    expect(await formatter({ type: "Long", value: 1.23 })).to.eq("1");
    expect(await formatter({ type: "Long", value: 7.89 })).to.eq("8");
    expect(await formatter({ type: "Long", value: Number.MAX_SAFE_INTEGER })).to.eq(Number.MAX_SAFE_INTEGER.toLocaleString());
  });

  it("formats double values", async () => {
    expect(await formatter({ type: "Double", value: 0 })).to.eq(Number(0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(await formatter({ type: "Double", value: 1.23 })).to.eq(Number(1.23).toLocaleString());
    expect(await formatter({ type: "Double", value: 4.56789 })).to.eq(Number(4.57).toLocaleString());
  });

  it("formats date values", async () => {
    const date = new Date();
    expect(await formatter({ type: "DateTime", value: 0 })).to.eq(julianToDateTime(0).toLocaleString());
    expect(await formatter({ type: "DateTime", value: date.toISOString() })).to.eq(date.toLocaleString());
    expect(await formatter({ type: "DateTime", value: date })).to.eq(date.toLocaleString());
    expect(await formatter({ type: "DateTime", extendedType: "ShortDate", value: date })).to.eq(date.toLocaleDateString());
  });

  it("formats point2d values", async () => {
    expect(await formatter({ type: "Point2d", value: { x: 1, y: 2 } })).to.eq(
      `(${await formatter({ type: "Double", value: 1 })}, ${await formatter({ type: "Double", value: 2 })})`,
    );
  });

  it("formats point3d values", async () => {
    expect(await formatter({ type: "Point3d", value: { x: 1, y: 2, z: 3 } })).to.eq(
      `(${await formatter({ type: "Double", value: 1 })}, ${await formatter({ type: "Double", value: 2 })}, ${await formatter({ type: "Double", value: 3 })})`,
    );
  });

  it("returns id values as-is", async () => {
    expect(await formatter({ type: "Id", value: "0x123" })).to.eq("0x123");
  });

  it("returns string values as-is", async () => {
    expect(await formatter({ type: "String", value: "xxx" })).to.eq("xxx");
  });
});
