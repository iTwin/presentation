/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Format, ParserSpec, QuantityParseResult, UnitProps, UnitsProvider } from "@itwin/core-quantity";
import { getDecimalRoundingError, getPersistenceUnitRoundingError } from "../../../presentation-components/properties/inputs/Utils";

describe("getDecimalRoundingError", () => {
  it("returns correct results", () => {
    expect(getDecimalRoundingError("123")).to.eq(0.5);
    expect(getDecimalRoundingError("123.456")).to.eq(0.0005);
    expect(getDecimalRoundingError("123.457 unit")).to.eq(0.0005);
    expect(getDecimalRoundingError("invalid number")).to.be.undefined;
  });
});

describe("getPersistenceUnitRoundingError", () => {
  const defaultUnit: UnitProps = {
    isValid: true,
    label: "unit",
    name: "unit",
    phenomenon: "length",
    system: "metric",
  };
  const fractionalUnit: UnitProps = {
    isValid: true,
    label: "ft",
    name: "ft",
    phenomenon: "length",
    system: "imperial",
  };
  const format = new Format("test format");
  const parserSpec = {
    parseToQuantityValue: sinon.stub<[string], QuantityParseResult>(),
    format,
  };
  const unitsProvider = {
    findUnit: sinon.stub<Parameters<UnitsProvider["findUnit"]>, ReturnType<UnitsProvider["findUnit"]>>(),
  };

  beforeEach(() => {
    sinon.restore();
    parserSpec.parseToQuantityValue.reset();
    unitsProvider.findUnit.reset();
  });

  it("uses decimal precision if there is no unit info found", async () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 0.5 });

    const result = await getPersistenceUnitRoundingError("123 unit", parserSpec as unknown as ParserSpec, unitsProvider as unknown as UnitsProvider);
    expect(result).to.eq(0.5);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("0.5");
  });

  it("uses format default unit to get precision", async () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 1 / 16 });
    sinon.stub(format, "units").get(() => [[fractionalUnit, "ft"]]);

    const result = await getPersistenceUnitRoundingError("123 otherUnit", parserSpec as unknown as ParserSpec, unitsProvider as unknown as UnitsProvider);
    expect(result).to.eq(1 / 16);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("1/16otherUnit");
  });

  it("uses matching unit from format to get precision", async () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 1 / 16 });
    sinon.stub(format, "units").get(() => [
      [defaultUnit, "unit"],
      [fractionalUnit, "'"],
    ]);

    const result = await getPersistenceUnitRoundingError("123'", parserSpec as unknown as ParserSpec, unitsProvider as unknown as UnitsProvider);
    expect(result).to.eq(1 / 16);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("1/16'");
  });

  it("uses matching unit from units provider to get precision", async () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 1 / 16 });
    sinon.stub(format, "units").get(() => [[defaultUnit, "unit"]]);
    unitsProvider.findUnit.resolves(fractionalUnit);

    const result = await getPersistenceUnitRoundingError("123'", parserSpec as unknown as ParserSpec, unitsProvider as unknown as UnitsProvider);
    expect(result).to.eq(1 / 16);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("1/16'");
  });
});
