/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Format, FormatType, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import { getDecimalRoundingError, getPersistenceUnitRoundingError } from "../../../presentation-components/properties/inputs/Utils.js";

describe("getDecimalRoundingError", () => {
  it("returns correct results", () => {
    expect(getDecimalRoundingError("123")).to.eq(0.5);
    expect(getDecimalRoundingError("123.456")).to.eq(0.0005);
    expect(getDecimalRoundingError("123.457 unit")).to.eq(0.0005);
    expect(getDecimalRoundingError("invalid number")).to.be.undefined;
  });
});

describe("getPersistenceUnitRoundingError", () => {
  const format = new Format("test format");
  const parserSpec = {
    parseToQuantityValue: sinon.stub<[string], QuantityParseResult>(),
    format,
  };

  beforeEach(() => {
    sinon.restore();
    parserSpec.parseToQuantityValue.reset();
  });

  it("uses decimal precision if there is decimal separator", () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 0.05 });

    const result = getPersistenceUnitRoundingError("123.4 unit", parserSpec as unknown as ParserSpec);
    expect(result).to.eq(0.05);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("0.05unit");
  });

  it("uses fractional precision if there is fractional separator", () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 1 / 8 });

    const result = getPersistenceUnitRoundingError("3/4 unit", parserSpec as unknown as ParserSpec);
    expect(result).to.eq(1 / 8);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("1/8unit");
  });

  it("uses decimal precision if format type is 'Decimal`", () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 0.5 });
    sinon.stub(format, "type").get(() => FormatType.Decimal);

    const result = getPersistenceUnitRoundingError("123", parserSpec as unknown as ParserSpec);
    expect(result).to.eq(0.5);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("0.5");
  });

  it("uses fractional precision if format type is 'Fractional`", () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 1 / 2 });
    sinon.stub(format, "type").get(() => FormatType.Fractional);

    const result = getPersistenceUnitRoundingError("123", parserSpec as unknown as ParserSpec);
    expect(result).to.eq(1 / 2);
    expect(parserSpec.parseToQuantityValue).to.be.calledOnceWithExactly("1/2");
  });

  it("returns undefined for other format types", () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 0.5 });
    sinon.stub(format, "type").get(() => FormatType.Azimuth);

    const result = getPersistenceUnitRoundingError("123'", parserSpec as unknown as ParserSpec);
    expect(result).to.be.undefined;
    expect(parserSpec.parseToQuantityValue).to.not.be.called;
  });

  it("returns undefined for invalid numbers types", () => {
    parserSpec.parseToQuantityValue.returns({ ok: true, value: 0.5 });
    sinon.stub(format, "type").get(() => FormatType.Fractional);

    const result = getPersistenceUnitRoundingError("not a number", parserSpec as unknown as ParserSpec);
    expect(result).to.be.undefined;
    expect(parserSpec.parseToQuantityValue).to.not.be.called;
  });
});
