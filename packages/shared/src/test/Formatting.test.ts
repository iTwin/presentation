/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { createDefaultValueFormatter, formatConcatenatedValue, IPrimitiveValueFormatter } from "../shared/Formatting";
import { julianToDateTime } from "../shared/InternalUtils";
import { EC, ECSchemaProvider } from "../shared/Metadata";
import { TypedPrimitiveValue } from "../shared/Values";
import { createECSchemaProviderStub } from "./MetadataProviderStub";

describe("createDefaultValueFormatter", () => {
  let valueFormatter: IPrimitiveValueFormatter;

  beforeEach(() => {
    valueFormatter = createDefaultValueFormatter();
  });

  it("formats boolean values", async () => {
    expect(await valueFormatter({ type: "Boolean", value: false })).to.eq("false");
    expect(await valueFormatter({ type: "Boolean", value: true })).to.eq("true");
  });

  it("formats integer values", async () => {
    expect(await valueFormatter({ type: "Integer", value: 0 })).to.eq("0");
    expect(await valueFormatter({ type: "Integer", value: 1.23 })).to.eq("1");
    expect(await valueFormatter({ type: "Integer", value: 7.89 })).to.eq("8");
  });

  it("formats long values", async () => {
    expect(await valueFormatter({ type: "Long", value: 0 })).to.eq("0");
    expect(await valueFormatter({ type: "Long", value: 1.23 })).to.eq("1");
    expect(await valueFormatter({ type: "Long", value: 7.89 })).to.eq("8");
    expect(await valueFormatter({ type: "Long", value: Number.MAX_SAFE_INTEGER })).to.eq(Number.MAX_SAFE_INTEGER.toLocaleString());
  });

  it("formats double values", async () => {
    expect(await valueFormatter({ type: "Double", value: 0 })).to.eq(
      Number(0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    expect(await valueFormatter({ type: "Double", value: 1.23 })).to.eq(Number(1.23).toLocaleString());
    expect(await valueFormatter({ type: "Double", value: 4.56789 })).to.eq(Number(4.57).toLocaleString());
  });

  it("formats date values", async () => {
    const date = new Date();
    expect(await valueFormatter({ type: "DateTime", value: 0 })).to.eq(julianToDateTime(0).toLocaleString());
    expect(await valueFormatter({ type: "DateTime", value: date.toISOString() })).to.eq(date.toLocaleString());
    expect(await valueFormatter({ type: "DateTime", value: date })).to.eq(date.toLocaleString());
    expect(await valueFormatter({ type: "DateTime", extendedType: "ShortDate", value: date })).to.eq(date.toLocaleDateString());
  });

  it("formats point2d values", async () => {
    expect(await valueFormatter({ type: "Point2d", value: { x: 1, y: 2 } })).to.eq(
      `(${await valueFormatter({ type: "Double", value: 1 })}, ${await valueFormatter({ type: "Double", value: 2 })})`,
    );
  });

  it("formats point3d values", async () => {
    expect(await valueFormatter({ type: "Point3d", value: { x: 1, y: 2, z: 3 } })).to.eq(
      `(${await valueFormatter({ type: "Double", value: 1 })}, ${await valueFormatter({ type: "Double", value: 2 })}, ${await valueFormatter({ type: "Double", value: 3 })})`,
    );
  });

  it("returns id values as-is", async () => {
    expect(await valueFormatter({ type: "Id", value: "0x123" })).to.eq("0x123");
  });

  it("returns string values as-is", async () => {
    expect(await valueFormatter({ type: "String", value: "xxx" })).to.eq("xxx");
  });
});

describe("formatConcatenatedValue", () => {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const valueFormatter = sinon.fake(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);

  afterEach(() => {
    valueFormatter.resetHistory();
  });

  it("returns formatted string", async () => {
    const result = await formatConcatenatedValue({ value: "test label", schemaProvider: {} as unknown as ECSchemaProvider, valueFormatter });
    expect(valueFormatter).to.be.calledOnceWith({ value: "test label", type: "String" });
    expect(result).to.eq("_test label_");
  });

  it("returns combined strings", async () => {
    const result = await formatConcatenatedValue({ value: ["test1", "-", "test2"], schemaProvider: {} as unknown as ECSchemaProvider, valueFormatter });
    expect(valueFormatter).to.be.calledThrice;
    expect(valueFormatter.firstCall).to.be.calledWith({ value: "test1", type: "String" });
    expect(valueFormatter.secondCall).to.be.calledWith({ value: "-", type: "String" });
    expect(valueFormatter.thirdCall).to.be.calledWith({ value: "test2", type: "String" });
    expect(result).to.eq("_test1__-__test2_");
  });

  it("returns formatted combined typed primitive values", async () => {
    const result = await formatConcatenatedValue({
      value: [
        { type: "Integer", value: 123 },
        { type: "String", value: "!" },
      ],
      schemaProvider: {} as unknown as ECSchemaProvider,
      valueFormatter,
    });
    expect(valueFormatter).to.be.calledTwice;
    expect(valueFormatter.firstCall).to.be.calledWithExactly({ type: "Integer", value: 123 });
    expect(valueFormatter.secondCall).to.be.calledWithExactly({ type: "String", value: "!" });
    expect(result).to.eq("_123__!_");
  });

  it("returns formatted primitive property value", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          primitiveType: "String",
          extendedTypeName: "extended type",
          kindOfQuantity: Promise.resolve({ fullName: "s.koq" } as EC.KindOfQuantity),
        } as EC.PrimitiveProperty,
      ],
    });
    const result = await formatConcatenatedValue({ value: [{ className: "x.y", propertyName: "p", value: "abc" }], schemaProvider, valueFormatter });
    expect(valueFormatter).to.be.calledOnceWithExactly({
      type: "String",
      extendedType: "extended type",
      koqName: "s.koq",
      value: "abc",
    });
    expect(result).to.eq("_abc_");
  });

  it("throws when input includes non-primitive property values", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => false,
        } as EC.Property,
      ],
    });
    await expect(formatConcatenatedValue({ value: [{ className: "x.y", propertyName: "p", value: "abc" }], schemaProvider, valueFormatter })).to.eventually.be
      .rejected;
  });

  it("throws when label includes `IGeometry` property values", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          primitiveType: "IGeometry",
        } as EC.PrimitiveProperty,
      ],
    });
    await expect(formatConcatenatedValue({ value: [{ className: "x.y", propertyName: "p", value: "abc" }], schemaProvider, valueFormatter })).to.eventually.be
      .rejected;
  });

  it("throws when label includes `Binary` property values", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          primitiveType: "Binary",
        } as EC.PrimitiveProperty,
      ],
    });
    await expect(formatConcatenatedValue({ value: [{ className: "x.y", propertyName: "p", value: "abc" }], schemaProvider, valueFormatter })).to.eventually.be
      .rejected;
  });
});
