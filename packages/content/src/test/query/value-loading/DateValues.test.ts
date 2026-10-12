/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { convertDateTimeValues, toDateValue } from "../../../content/query/value-loading/DateValues.js";

import type { ValueDescriptor } from "@itwin/presentation-shared";

const dateType: ValueDescriptor = { kind: "primitive", type: "DateTime" };
const stringType: ValueDescriptor = { kind: "primitive", type: "String" };

describe("toDateValue", () => {
  it.each([
    ["a string with a UTC designator", "2021-11-08T10:18:23.317Z", "2021-11-08T10:18:23.317Z"],
    ["a string without a timezone designator", "2021-11-08T10:18:23.317", "2021-11-08T10:18:23.317Z"],
    ["a string without fractional seconds", "2021-11-08T10:18:23", "2021-11-08T10:18:23.000Z"],
    ["a date-only string", "2021-11-08", "2021-11-08T00:00:00.000Z"],
    ["a string with a positive offset", "2021-11-08T10:18:23.317+02:00", "2021-11-08T08:18:23.317Z"],
    ["a string with a negative offset", "2021-11-08T10:18:23.317-0530", "2021-11-08T15:48:23.317Z"],
    ["a Julian day number", 2440587.5, "1970-01-01T00:00:00.000Z"],
  ])("converts %s", (_, input, expected) => {
    expect(toDateValue(input).toISOString()).toBe(expected);
  });

  it("returns an existing Date", () => {
    const date = new Date("2021-11-08T10:18:23.317Z");
    expect(toDateValue(date)).toBe(date);
  });

  it.each([["not a date"], [true], [{}], [new Date(Number.NaN)], [Number.NaN]])("throws for %s", (input) => {
    expect(() => toDateValue(input)).toThrow(/valid DateTime/);
  });
});

describe("convertDateTimeValues", () => {
  const date = "2021-11-08T10:18:23.317";
  const expected = new Date("2021-11-08T10:18:23.317Z");

  it("returns undefined for undefined", () => {
    expect(convertDateTimeValues(undefined, dateType)).toBeUndefined();
  });

  it("converts a DateTime primitive", () => {
    expect(convertDateTimeValues(date, dateType)).toEqual(expected);
  });

  it("leaves other primitives and navigation values untouched", () => {
    expect(convertDateTimeValues(date, stringType)).toBe(date);
    const navigation = { key: { className: "Schema.A", id: "0x1" }, label: { type: "String", value: "A" } };
    expect(convertDateTimeValues(navigation as never, { kind: "navigation", targetClassName: "Schema.A" })).toBe(
      navigation,
    );
  });

  it("converts DateTime array elements", () => {
    expect(convertDateTimeValues([date, undefined], { kind: "array", elementType: dateType })).toEqual([
      expected,
      undefined,
    ]);
  });

  it("converts DateTime struct members and leaves the rest", () => {
    expect(
      convertDateTimeValues(
        { when: date, name: "A", unknown: date },
        {
          kind: "struct",
          members: [
            { name: "when", label: "When", type: dateType },
            { name: "name", label: "Name", type: stringType },
          ],
        },
      ),
    ).toEqual({ when: expected, name: "A", unknown: date });
  });

  it("converts DateTime inside arrays of structs", () => {
    expect(
      convertDateTimeValues([{ when: date }], {
        kind: "array",
        elementType: { kind: "struct", members: [{ name: "when", label: "When", type: dateType }] },
      }),
    ).toEqual([{ when: expected }]);
  });

  it("throws for an invalid DateTime value", () => {
    expect(() => convertDateTimeValues("nope", dateType)).toThrow(/valid DateTime/);
  });
});
