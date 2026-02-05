/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { useEffect } from "react";
import sinon from "sinon";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp } from "@itwin/core-frontend";
import { Format, FormatterSpec, FormatType, ParseError, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { QuantityValue, useQuantityValueInput, UseQuantityValueInputProps } from "../../../presentation-components/properties/inputs/UseQuantityValueInput.js";
import { render, waitFor } from "../../TestUtils.js";

function TestInput({ onChange, ...restProps }: UseQuantityValueInputProps & { onChange?: (value: QuantityValue) => void }) {
  const { quantityValue, inputProps } = useQuantityValueInput(restProps);

  useEffect(() => {
    onChange && onChange(quantityValue);
  }, [quantityValue, onChange]);

  return <input {...inputProps} value={quantityValue.highPrecisionFormattedValue} />;
}

describe("UseQuantityValueInput", () => {
  const schemaContext = {} as SchemaContext;
  const format = new Format("test format");
  const formatterSpec = {
    applyFormatting: sinon.stub<[number], string>(),
    unitConversions: [{ name: "test unit", label: "unit" }],
    format,
  };
  const parserSpec = {
    parseToQuantityValue: sinon.stub<[string], QuantityParseResult>(),
    format,
  };
  const quantityFormatter = {
    onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
  };

  const formatProvider = {
    onFormatsChanged: new BeUiEvent<void>(),
  };

  let getFormatterSpecStub: sinon.SinonStub<
    Parameters<KoqPropertyValueFormatter["getFormatterSpec"]>,
    ReturnType<KoqPropertyValueFormatter["getFormatterSpec"]>
  >;
  let getParserSpecStub: sinon.SinonStub<Parameters<KoqPropertyValueFormatter["getParserSpec"]>, ReturnType<KoqPropertyValueFormatter["getParserSpec"]>>;

  before(() => {
    getFormatterSpecStub = sinon.stub(KoqPropertyValueFormatter.prototype, "getFormatterSpec");
    getParserSpecStub = sinon.stub(KoqPropertyValueFormatter.prototype, "getParserSpec");

    sinon.stub(IModelApp, "quantityFormatter").get(() => quantityFormatter);
    sinon.stub(IModelApp, "formatsProvider").get(() => formatProvider);
  });

  beforeEach(() => {
    formatterSpec.applyFormatting.callsFake((raw) => `${raw} unit`);
    parserSpec.parseToQuantityValue.callsFake((value) => {
      if (!value.endsWith("unit")) {
        return { ok: false, error: ParseError.UnknownUnit };
      }
      return { ok: true, value: Number(value.substring(0, value.length - 4)) };
    });

    getFormatterSpecStub.resolves(formatterSpec as unknown as FormatterSpec);
    getParserSpecStub.resolves(parserSpec as unknown as ParserSpec);
  });

  afterEach(() => {
    formatterSpec.applyFormatting.reset();
    parserSpec.parseToQuantityValue.reset();

    getFormatterSpecStub.reset();
    getParserSpecStub.reset();
  });

  after(() => {
    sinon.restore();
  });

  it("renders with placeholder", async () => {
    const { queryByPlaceholderText } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" />);
    await waitFor(() => expect(queryByPlaceholderText("unit")).to.not.be.null);
  });

  it("renders with formatted initial raw value", async () => {
    const { queryByDisplayValue } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={2.5} />);
    await waitFor(() => expect(queryByDisplayValue("2.5 unit")).to.not.be.null);
  });

  it("renders disabled input if cannot create formatter", async () => {
    getFormatterSpecStub.reset();
    const { getByRole } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={2.5} />);
    await waitFor(() => expect((getByRole("textbox") as HTMLInputElement).disabled).to.be.true);
  });

  it("renders disabled input if cannot create parser", async () => {
    getParserSpecStub.reset();
    const { getByRole } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={2.5} />);
    await waitFor(() => expect((getByRole("textbox") as HTMLInputElement).disabled).to.be.true);
  });

  it("parses entered value", async () => {
    const spy = sinon.stub<[QuantityValue], void>();
    const { user, getByRole, queryByPlaceholderText } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" onChange={spy} />);
    await waitFor(() => expect(queryByPlaceholderText("unit")).to.not.be.null);

    const input = getByRole("textbox");

    await user.type(input, "1.23 unit");
    await waitFor(() => {
      const value = spy.lastCall.args[0];
      expect(value.rawValue).to.be.eq(1.23);
      expect(value.highPrecisionFormattedValue).to.be.eq("1.23 unit");
    });
  });

  it("reacts to format change", async () => {
    const { queryByPlaceholderText } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" />);
    await waitFor(() => expect(queryByPlaceholderText("unit")).to.not.be.null);

    const newFormatterSpec = {
      applyFormatting: (num: number) => `${num} new unit`,
      unitConversions: [{ name: "test unit", label: "new unit" }],
      format,
    };
    const newParserSpec = {
      parseToQuantityValue: (str: string) => {
        if (!str.endsWith("new unit")) {
          return { ok: false, error: ParseError.UnknownUnit };
        }
        return { ok: true, value: Number(str.substring(0, str.length - 8)) };
      },
      format,
    };

    getFormatterSpecStub.resolves(newFormatterSpec as unknown as FormatterSpec);
    getParserSpecStub.resolves(newParserSpec as unknown as ParserSpec);

    formatProvider.onFormatsChanged.raiseEvent();

    await waitFor(() => expect(queryByPlaceholderText("new unit")).to.not.be.null);
  });

  it("sets precision to 12 for Decimal format types", async () => {
    const decimalFormat = {
      type: FormatType.Decimal,
      precision: 6,
    };
    const decimalFormatterSpec = {
      applyFormatting: sinon.stub<[number], string>(),
      unitConversions: [{ name: "test unit", label: "unit" }],
      format: decimalFormat,
    };

    decimalFormatterSpec.applyFormatting.callsFake((raw) => `${raw} unit`);
    getFormatterSpecStub.resolves(decimalFormatterSpec as unknown as FormatterSpec);

    render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={0.123456} />);
    await waitFor(() => expect(decimalFormatterSpec.applyFormatting).to.be.called);

    // Verify that precision was set to 12 for Decimal format
    expect(decimalFormat.precision).to.eq(12);
  });

  it("does not set precision to 12 for Fractional format types", async () => {
    const fractionalFormat = {
      type: FormatType.Fractional,
      precision: 6,
    };
    const fractionalFormatterSpec = {
      applyFormatting: sinon.stub<[number], string>(),
      unitConversions: [{ name: "test unit", label: "unit" }],
      format: fractionalFormat,
    };

    fractionalFormatterSpec.applyFormatting.callsFake((raw) => `${raw} unit`);
    getFormatterSpecStub.resolves(fractionalFormatterSpec as unknown as FormatterSpec);

    render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={0.123456} />);
    await waitFor(() => expect(fractionalFormatterSpec.applyFormatting).to.be.called);

    // Verify that precision was NOT modified for Fractional format
    expect(fractionalFormat.precision).to.eq(6);
  });
});
