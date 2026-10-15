/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDistinctFieldValues } from "@itwin/presentation-content";
import { getUniqueFieldValues } from "../content-react/UniqueFieldValues.js";
import { classA, createDistinctValuesStream, createPropertyField } from "./Helpers.js";

import type * as PresentationContent from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor, TypedPrimitiveValue, Value } from "@itwin/presentation-shared";

vi.mock("@itwin/presentation-content", async (importOriginal) => ({
  ...(await importOriginal<typeof PresentationContent>()),
  getDistinctFieldValues: vi.fn(),
}));

const imodelAccess = {} as ECSqlQueryExecutor & ECSchemaProvider;

function stubDistinctValues(values: Value[]) {
  const stream = createDistinctValuesStream(values);
  vi.mocked(getDistinctFieldValues).mockReturnValue(stream.iterable);
  return stream;
}

describe("getUniqueFieldValues", () => {
  beforeEach(() => {
    vi.mocked(getDistinctFieldValues).mockReset();
  });

  it("groups raw values that format to the same display value", async () => {
    stubDistinctValues([1.001, 2.5, 1.004]);
    const field = createPropertyField({
      id: "a",
      valueClassNames: [classA],
      type: { kind: "primitive", type: "Double" },
    });

    const result = await getUniqueFieldValues({ imodelAccess, field });

    expect(result).toEqual({
      values: [
        { displayValue: "1.00", groupedRawValues: [1.001, 1.004] },
        { displayValue: "2.50", groupedRawValues: [2.5] },
      ],
    });
  });

  it("resolves enumeration values to enumerator labels and falls back to the raw value when unmatched", async () => {
    stubDistinctValues([1, 2]);
    const field = createPropertyField({
      id: "a",
      valueClassNames: [classA],
      type: {
        kind: "primitive",
        type: "Integer",
        enumeration: { name: "TestSchema.TestEnum", isStrict: false, enumerators: [{ value: 1, label: "First" }] },
      },
    });

    const result = await getUniqueFieldValues({ imodelAccess, field });

    expect(result).toEqual({
      values: [
        { displayValue: "First", groupedRawValues: [1] },
        { displayValue: "2", groupedRawValues: [2] },
      ],
    });
  });

  it("formats a NULL value to an empty display value", async () => {
    stubDistinctValues([undefined, "x"]);
    const field = createPropertyField({ id: "a", valueClassNames: [classA] });

    const result = await getUniqueFieldValues({ imodelAccess, field });

    expect(result).toEqual({
      values: [
        { displayValue: "", groupedRawValues: [undefined] },
        { displayValue: "x", groupedRawValues: ["x"] },
      ],
    });
  });

  it("forwards the kind of quantity to the value formatter as `koqName`", async () => {
    stubDistinctValues([1.5]);
    const field = createPropertyField({
      id: "a",
      valueClassNames: [classA],
      type: { kind: "primitive", type: "Double", kindOfQuantity: "TestSchema.TestKoq" },
    });
    const valueFormatter = vi.fn(async (value: TypedPrimitiveValue) => `formatted-${value.value as number}`);

    const result = await getUniqueFieldValues({ imodelAccess, field, valueFormatter });

    expect(valueFormatter).toHaveBeenCalledWith({
      type: "Double",
      value: 1.5,
      koqName: "TestSchema.TestKoq",
      extendedType: undefined,
    });
    expect(result).toEqual({ values: [{ displayValue: "formatted-1.5", groupedRawValues: [1.5] }] });
  });

  it("forwards the extended type to the value formatter", async () => {
    // Local times on the same day — a `ShortDate` formats date-only, so both group under one display value.
    const morning = "2024-01-02T08:00:00";
    const evening = "2024-01-02T17:30:00";
    stubDistinctValues([morning, evening]);
    const field = createPropertyField({
      id: "a",
      valueClassNames: [classA],
      type: { kind: "primitive", type: "DateTime", extendedType: "ShortDate" },
    });

    const result = await getUniqueFieldValues({ imodelAccess, field });

    expect(result).toEqual({
      values: [{ displayValue: new Date(morning).toLocaleDateString(), groupedRawValues: [morning, evening] }],
    });
  });

  describe("navigation fields", () => {
    const navigationField = createPropertyField({
      id: "nav",
      valueClassNames: [classA],
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
    });

    it("uses the target instance's label as display value and its key as the raw value", async () => {
      stubDistinctValues([
        { key: { className: "TestSchema.Target", id: "0x1" }, label: "Element A" },
        { key: { className: "TestSchema.Target", id: "0x2" }, label: "Element B" },
      ]);

      const result = await getUniqueFieldValues({ imodelAccess, field: navigationField });

      expect(result).toEqual({
        values: [
          { displayValue: "Element A", groupedRawValues: [{ className: "TestSchema.Target", id: "0x1" }] },
          { displayValue: "Element B", groupedRawValues: [{ className: "TestSchema.Target", id: "0x2" }] },
        ],
      });
    });

    it("groups distinct target instances that share a label", async () => {
      stubDistinctValues([
        { key: { className: "TestSchema.Target", id: "0x1" }, label: "Shared" },
        { key: { className: "TestSchema.Target", id: "0x2" }, label: "Shared" },
      ]);

      const result = await getUniqueFieldValues({ imodelAccess, field: navigationField });

      expect(result).toEqual({
        values: [
          {
            displayValue: "Shared",
            groupedRawValues: [
              { className: "TestSchema.Target", id: "0x1" },
              { className: "TestSchema.Target", id: "0x2" },
            ],
          },
        ],
      });
    });

    it("formats a concatenated label", async () => {
      stubDistinctValues([
        { key: { className: "TestSchema.Target", id: "0x1" }, label: [{ type: "String", value: "A" }, " - ", "B"] },
      ]);

      const result = await getUniqueFieldValues({ imodelAccess, field: navigationField });

      expect(result).toEqual({
        values: [{ displayValue: "A - B", groupedRawValues: [{ className: "TestSchema.Target", id: "0x1" }] }],
      });
    });
  });

  it("cancels the stream when aborted", async () => {
    const stream = stubDistinctValues(["a", "b", "c"]);
    const field = createPropertyField({ id: "a", valueClassNames: [classA] });
    const controller = new AbortController();
    controller.abort();

    await expect(getUniqueFieldValues({ imodelAccess, field, abortSignal: controller.signal })).rejects.toThrow();
    expect(stream.isReturned()).toBe(true);
  });

  it("cancels a stream that is still waiting on a value when aborted", async () => {
    let returned = false;
    vi.mocked(getDistinctFieldValues).mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        [Symbol.asyncIterator]() {
          return this;
        },
        // Never settles — stands in for a query that hasn't produced its first row yet.
        next: async () => new Promise<IteratorResult<Value>>(() => {}),
        return: async () => {
          returned = true;
          return { value: undefined, done: true } as IteratorResult<Value>;
        },
      }),
    });
    const field = createPropertyField({ id: "a", valueClassNames: [classA] });
    const controller = new AbortController();

    const promise = getUniqueFieldValues({ imodelAccess, field, abortSignal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(returned).toBe(true);
  });

  it("cancels the stream when formatting throws", async () => {
    const stream = stubDistinctValues(["a", "b"]);
    const field = createPropertyField({ id: "a", valueClassNames: [classA] });
    const valueFormatter = vi.fn(async () => {
      throw new Error("formatting failed");
    });

    await expect(getUniqueFieldValues({ imodelAccess, field, valueFormatter })).rejects.toThrow("formatting failed");
    expect(stream.isReturned()).toBe(true);
  });

  it("throws for array and struct fields without querying", async () => {
    const arrayField = createPropertyField({
      id: "a",
      valueClassNames: [classA],
      type: { kind: "array", elementType: { kind: "primitive", type: "String" } },
    });
    const structField = createPropertyField({
      id: "s",
      valueClassNames: [classA],
      type: { kind: "struct", members: [] },
    });

    await expect(getUniqueFieldValues({ imodelAccess, field: arrayField })).rejects.toThrow(
      "Getting unique values for array fields is not supported",
    );
    await expect(getUniqueFieldValues({ imodelAccess, field: structField })).rejects.toThrow(
      "Getting unique values for struct fields is not supported",
    );
    expect(getDistinctFieldValues).not.toHaveBeenCalled();
  });
});
