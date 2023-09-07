/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { useEffect } from "react";
import sinon from "sinon";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp } from "@itwin/core-frontend";
import { FormatterSpec, ParseError, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { waitFor } from "@testing-library/react";
import { QuantityValue, useQuantityValueInput, UseQuantityValueInputProps } from "../../presentation-components/properties/UseQuantityValueInput";
import { render } from "../_helpers/Common";

function TestInput({ onChange, ...restProps }: UseQuantityValueInputProps & { onChange?: (value: QuantityValue) => void }) {
  const { quantityValue, inputProps } = useQuantityValueInput(restProps);

  useEffect(() => {
    onChange && onChange(quantityValue);
  }, [quantityValue, onChange]);

  return <input {...inputProps} />;
}

describe("UseQuantityValueInput", () => {
  const schemaContext = {} as SchemaContext;
  const formatterSpec = {
    applyFormatting: sinon.stub<[number], string>(),
  };
  const parserSpec = {
    parseToQuantityValue: sinon.stub<[string], QuantityParseResult>(),
  };
  const quantityFormatter = {
    onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
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
    await waitFor(() => expect(queryByPlaceholderText("12.34 unit")).to.not.be.null);
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
    await waitFor(() => expect(queryByPlaceholderText("12.34 unit")).to.not.be.null);

    const input = getByRole("textbox");

    await user.type(input, "1.23 unit");
    await waitFor(() => {
      const value = spy.lastCall.args[0];
      expect(value.rawValue).to.be.eq(1.23);
      expect(value.formattedValue).to.be.eq("1.23 unit");
    });
  });
});
