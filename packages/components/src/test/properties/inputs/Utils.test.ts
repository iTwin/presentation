/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Format, FormatType, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import {
  applyNumericConstraints,
  getDecimalRoundingError,
  getMinMaxFromPropertyConstraints,
  getPersistenceUnitRoundingError,
} from "../../../presentation-components/properties/inputs/Utils.js";

describe("getDecimalRoundingError", () => {
  it("returns correct results", () => {
    expect(getDecimalRoundingError("123")).toBe(0.5);
    expect(getDecimalRoundingError("123.456")).toBe(0.0005);
    expect(getDecimalRoundingError("123.457 unit")).toBe(0.0005);
    expect(getDecimalRoundingError("invalid number")).toBeUndefined();
  });
});

describe("getPersistenceUnitRoundingError", () => {
  const format = new Format("test format");
  const parserSpec = { parseToQuantityValue: vi.fn<(value: string) => QuantityParseResult>(), format };

  beforeEach(() => {
    parserSpec.parseToQuantityValue.mockReset();
  });

  it("uses decimal precision if there is decimal separator", () => {
    parserSpec.parseToQuantityValue.mockReturnValue({ ok: true, value: 0.05 });

    const result = getPersistenceUnitRoundingError("123.4 unit", parserSpec as unknown as ParserSpec);
    expect(result).toBe(0.05);
    expect(parserSpec.parseToQuantityValue).toHaveBeenCalledWith("0.05unit");
  });

  it("uses fractional precision if there is fractional separator", () => {
    parserSpec.parseToQuantityValue.mockReturnValue({ ok: true, value: 1 / 8 });

    const result = getPersistenceUnitRoundingError("3/4 unit", parserSpec as unknown as ParserSpec);
    expect(result).toBe(1 / 8);
    expect(parserSpec.parseToQuantityValue).toHaveBeenCalledWith("1/8unit");
  });

  it("uses decimal precision if format type is 'Decimal`", () => {
    parserSpec.parseToQuantityValue.mockReturnValue({ ok: true, value: 0.5 });
    vi.spyOn(format, "type", "get").mockReturnValue(FormatType.Decimal);

    const result = getPersistenceUnitRoundingError("123", parserSpec as unknown as ParserSpec);
    expect(result).toBe(0.5);
    expect(parserSpec.parseToQuantityValue).toHaveBeenCalledWith("0.5");
  });

  it("uses fractional precision if format type is 'Fractional`", () => {
    parserSpec.parseToQuantityValue.mockReturnValue({ ok: true, value: 1 / 2 });
    vi.spyOn(format, "type", "get").mockReturnValue(FormatType.Fractional);

    const result = getPersistenceUnitRoundingError("123", parserSpec as unknown as ParserSpec);
    expect(result).toBe(1 / 2);
    expect(parserSpec.parseToQuantityValue).toHaveBeenCalledWith("1/2");
  });

  it("returns undefined for other format types", () => {
    parserSpec.parseToQuantityValue.mockReturnValue({ ok: true, value: 0.5 });
    vi.spyOn(format, "type", "get").mockReturnValue(FormatType.Azimuth);

    const result = getPersistenceUnitRoundingError("123'", parserSpec as unknown as ParserSpec);
    expect(result).toBeUndefined();
    expect(parserSpec.parseToQuantityValue).not.toHaveBeenCalled();
  });

  it("returns undefined for invalid numbers types", () => {
    parserSpec.parseToQuantityValue.mockReturnValue({ ok: true, value: 0.5 });
    vi.spyOn(format, "type", "get").mockReturnValue(FormatType.Fractional);

    const result = getPersistenceUnitRoundingError("not a number", parserSpec as unknown as ParserSpec);
    expect(result).toBeUndefined();
    expect(parserSpec.parseToQuantityValue).not.toHaveBeenCalled();
  });
});

describe("applyNumericConstraints", () => {
  it("returns value unchanged when no constraints are provided", () => {
    expect(applyNumericConstraints({ value: 5 })).toBe(5);
  });

  it("returns value unchanged when value is within range", () => {
    expect(applyNumericConstraints({ value: 5, min: 1, max: 10 })).toBe(5);
  });

  it("clamps to min when value is below minimum", () => {
    expect(applyNumericConstraints({ value: -5, min: 0, max: 10 })).toBe(0);
  });

  it("clamps to max when value exceeds maximum", () => {
    expect(applyNumericConstraints({ value: 15, min: 0, max: 10 })).toBe(10);
  });

  it("clamps to min when only min constraint is provided", () => {
    expect(applyNumericConstraints({ value: -5, min: 0 })).toBe(0);
  });

  it("clamps to max when only max constraint is provided", () => {
    expect(applyNumericConstraints({ value: 15, max: 10 })).toBe(10);
  });

  it("returns min when min equals max and value is below", () => {
    expect(applyNumericConstraints({ value: 0, min: 5, max: 5 })).toBe(5);
  });

  it("handles negative min and max constraints", () => {
    expect(applyNumericConstraints({ value: 5, min: -10, max: -1 })).toBe(-1);
  });

  it("returns exact boundary value when value equals min", () => {
    expect(applyNumericConstraints({ value: 0, min: 0, max: 10 })).toBe(0);
  });

  it("returns exact boundary value when value equals max", () => {
    expect(applyNumericConstraints({ value: 10, min: 0, max: 10 })).toBe(10);
  });
});

describe("getMinMaxFromPropertyConstraints", () => {
  it("extracts min and max from numeric constraints", () => {
    expect(getMinMaxFromPropertyConstraints({ minimumValue: 1, maximumValue: 10 })).toEqual({ min: 1, max: 10 });
  });

  it("extracts only min when max is undefined", () => {
    expect(getMinMaxFromPropertyConstraints({ minimumValue: 1 })).toEqual({ min: 1, max: undefined });
  });

  it("extracts only max when min is undefined", () => {
    expect(getMinMaxFromPropertyConstraints({ maximumValue: 10 })).toEqual({ min: undefined, max: 10 });
  });

  it("returns undefined min and max for non-numeric constraints", () => {
    expect(getMinMaxFromPropertyConstraints({ minimumLength: 2, maximumLength: 10 })).toEqual({
      min: undefined,
      max: undefined,
    });
  });

  it("returns undefined min and max for occurrence constraints", () => {
    expect(getMinMaxFromPropertyConstraints({ minOccurs: 1, maxOccurs: 5 })).toEqual({
      min: undefined,
      max: undefined,
    });
  });
});
