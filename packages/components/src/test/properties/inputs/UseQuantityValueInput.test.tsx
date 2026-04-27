/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, QuantityFormatter } from "@itwin/core-frontend";
import { Format, FormatsProvider, FormatType, ParseError, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import {
  QuantityValue,
  useQuantityValueInput,
  UseQuantityValueInputProps,
} from "../../../presentation-components/properties/inputs/UseQuantityValueInput.js";
import { render, waitFor } from "../../TestUtils.js";

function TestInput({
  onChange,
  ...restProps
}: UseQuantityValueInputProps & { onChange?: (value: QuantityValue) => void }) {
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
    applyFormatting: vi.fn<(raw: number) => string>(),
    unitConversions: [{ name: "test unit", label: "unit" }],
    format,
  };
  const parserSpec = { parseToQuantityValue: vi.fn<(value: string) => QuantityParseResult>(), format };
  const quantityFormatter = { onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>() };

  const formatProvider = { onFormatsChanged: new BeUiEvent<void>() };

  let getFormatterSpecStub: ReturnType<typeof vi.spyOn>;
  let getParserSpecStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getFormatterSpecStub = vi.spyOn(KoqPropertyValueFormatter.prototype, "getFormatterSpec");
    getParserSpecStub = vi.spyOn(KoqPropertyValueFormatter.prototype, "getParserSpec");

    vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue(quantityFormatter as unknown as QuantityFormatter);
    vi.spyOn(IModelApp, "formatsProvider", "get").mockReturnValue(formatProvider as unknown as FormatsProvider);

    formatterSpec.applyFormatting.mockImplementation((raw) => `${raw} unit`);
    parserSpec.parseToQuantityValue.mockImplementation((value) => {
      if (!value.endsWith("unit")) {
        return { ok: false, error: ParseError.UnknownUnit };
      }
      return { ok: true, value: Number(value.substring(0, value.length - 4)) };
    });

    getFormatterSpecStub.mockResolvedValue(formatterSpec);
    getParserSpecStub.mockResolvedValue(parserSpec);
  });

  afterEach(() => {
    formatterSpec.applyFormatting.mockReset();
    parserSpec.parseToQuantityValue.mockReset();

    getFormatterSpecStub.mockReset();
    getParserSpecStub.mockReset();
  });

  it("renders with placeholder", async () => {
    const { queryByPlaceholderText } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" />);
    await waitFor(() => expect(queryByPlaceholderText("unit")).not.toBeNull());
  });

  it("renders with formatted initial raw value", async () => {
    const { queryByDisplayValue } = render(
      <TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={2.5} />,
    );
    await waitFor(() => expect(queryByDisplayValue("2.5 unit")).not.toBeNull());
  });

  it("renders with formatted value when initial raw value is 0", async () => {
    const { queryByDisplayValue } = render(
      <TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={0} />,
    );
    await waitFor(() => expect(queryByDisplayValue("0 unit")).not.toBeNull());
  });

  it("renders disabled input if cannot create formatter", async () => {
    getFormatterSpecStub.mockResolvedValue(undefined);
    const { getByRole } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={2.5} />);
    await waitFor(() => expect((getByRole("textbox") as HTMLInputElement).disabled).toBe(true));
  });

  it("renders disabled input if cannot create parser", async () => {
    getParserSpecStub.mockResolvedValue(undefined);
    const { getByRole } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={2.5} />);
    await waitFor(() => expect((getByRole("textbox") as HTMLInputElement).disabled).toBe(true));
  });

  it("parses entered value", async () => {
    const spy = vi.fn<(value: QuantityValue) => void>();
    const { user, getByRole, queryByPlaceholderText } = render(
      <TestInput schemaContext={schemaContext} koqName="testKOQ" onChange={spy} />,
    );
    await waitFor(() => expect(queryByPlaceholderText("unit")).not.toBeNull());

    const input = getByRole("textbox");

    await user.clear(input);
    await user.type(input, "1.23 unit");
    await waitFor(() => {
      const value = spy.mock.lastCall![0];
      expect(value.rawValue).toBe(1.23);
      expect(value.highPrecisionFormattedValue).toBe("1.23 unit");
    });
  });

  it("reacts to format change", async () => {
    const { queryByPlaceholderText } = render(<TestInput schemaContext={schemaContext} koqName="testKOQ" />);
    await waitFor(() => expect(queryByPlaceholderText("unit")).not.toBeNull());

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

    getFormatterSpecStub.mockResolvedValue(newFormatterSpec);
    getParserSpecStub.mockResolvedValue(newParserSpec);

    formatProvider.onFormatsChanged.raiseEvent();

    await waitFor(() => expect(queryByPlaceholderText("new unit")).not.toBeNull());
  });

  it("sets precision to 12 for Decimal format types", async () => {
    const decimalFormat = { type: FormatType.Decimal, precision: 6 };
    const decimalFormatterSpec = {
      applyFormatting: vi.fn<(raw: number) => string>(),
      unitConversions: [{ name: "test unit", label: "unit" }],
      format: decimalFormat,
    };

    decimalFormatterSpec.applyFormatting.mockImplementation((raw) => `${raw} unit`);
    getFormatterSpecStub.mockResolvedValue(decimalFormatterSpec);

    render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={0.123456} />);
    await waitFor(() => expect(decimalFormatterSpec.applyFormatting).toHaveBeenCalled());

    // Verify that precision was set to 12 for Decimal format
    expect(decimalFormat.precision).toBe(12);
  });

  it("does not set precision to 12 for Fractional format types", async () => {
    const fractionalFormat = { type: FormatType.Fractional, precision: 6 };
    const fractionalFormatterSpec = {
      applyFormatting: vi.fn<(raw: number) => string>(),
      unitConversions: [{ name: "test unit", label: "unit" }],
      format: fractionalFormat,
    };

    fractionalFormatterSpec.applyFormatting.mockImplementation((raw) => `${raw} unit`);
    getFormatterSpecStub.mockResolvedValue(fractionalFormatterSpec);

    render(<TestInput schemaContext={schemaContext} koqName="testKOQ" initialRawValue={0.123456} />);
    await waitFor(() => expect(fractionalFormatterSpec.applyFormatting).toHaveBeenCalled());

    // Verify that precision was NOT modified for Fractional format
    expect(fractionalFormat.precision).toBe(6);
  });
});
