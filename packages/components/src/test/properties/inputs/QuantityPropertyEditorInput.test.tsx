/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { BeUiEvent } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { Format, FormatType, ParseError } from "@itwin/core-quantity";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext.js";
import { QuantityEditorName } from "../../../presentation-components/properties/editors/QuantityPropertyEditor.js";
import { QuantityPropertyEditorInput } from "../../../presentation-components/properties/inputs/QuantityPropertyEditorInput.js";
import { createTestPropertyRecord } from "../../_helpers/UiComponents.js";
import { render, waitFor } from "../../TestUtils.js";

import type { PropertyEditorProps } from "@itwin/components-react";
import type { FormattingUnitSystemChangedArgs, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import type { FormatterSpec, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import type { SchemaContext } from "@itwin/ecschema-metadata";
import type { PropertyEditorAttributes } from "../../../presentation-components/properties/editors/Common.js";

const createRecord = ({ initialValue, kindOfQuantityName }: { initialValue?: number; kindOfQuantityName?: string }) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: undefined },
    { typename: StandardTypeNames.Double, kindOfQuantityName, editor: { name: QuantityEditorName } },
  );
};

describe("<QuantityPropertyEditorInput />", () => {
  const schemaContext = {} as SchemaContext;
  const format = new Format("test format");
  const formatterSpec = {
    applyFormatting: vi.fn<(raw: number) => string>(),
    unitConversions: [{ name: "test unit", label: "unit" }],
    format,
  };
  const parserSpec = { parseToQuantityValue: vi.fn<(value: string) => QuantityParseResult>(), format };

  let getFormatterSpecStub: ReturnType<typeof vi.spyOn>;
  let getParserSpecStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getFormatterSpecStub = vi.spyOn(KoqPropertyValueFormatter.prototype, "getFormatterSpec");
    getParserSpecStub = vi.spyOn(KoqPropertyValueFormatter.prototype, "getParserSpec");

    vi.spyOn(format, "type", "get").mockReturnValue(FormatType.Decimal);
    vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    } as unknown as QuantityFormatter);

    formatterSpec.applyFormatting.mockImplementation((raw) => `${raw} unit`);
    parserSpec.parseToQuantityValue.mockImplementation((value) => {
      if (!value.endsWith("unit")) {
        return { ok: false, error: ParseError.UnknownUnit };
      }
      return { ok: true, value: Number(value.substring(0, value.length - 4)) };
    });

    getFormatterSpecStub.mockResolvedValue(formatterSpec as unknown as FormatterSpec);
    getParserSpecStub.mockResolvedValue(parserSpec as unknown as ParserSpec);
  });

  afterEach(() => {
    formatterSpec.applyFormatting.mockReset();
    parserSpec.parseToQuantityValue.mockReset();

    getFormatterSpecStub.mockReset();
    getParserSpecStub.mockReset();
  });

  it("renders numeric input if schema context is not available", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(<QuantityPropertyEditorInput propertyRecord={record} />);

    expect(getByDisplayValue("10")).to.not.be.null;
  });

  it("renders numeric input if property does not have kindOfQuantityName", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    expect(getByDisplayValue("10")).to.not.be.null;
  });

  it("renders formatted quantity value if schema context is available", async () => {
    const record = createRecord({ initialValue: 10, kindOfQuantityName: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => expect(getByDisplayValue("10 unit")).to.not.be.null);
  });

  it("allows entering number when schema context is not available", async () => {
    const ref = createRef<PropertyEditorAttributes>();
    const spy =
      vi.fn<
        (
          args: Parameters<Required<PropertyEditorProps>["onCommit"]>[0],
        ) => ReturnType<Required<PropertyEditorProps>["onCommit"]>
      >();
    const record = createRecord({ initialValue: undefined, kindOfQuantityName: "TestKOQ" });
    const { getByRole, user } = render(
      <QuantityPropertyEditorInput ref={ref} propertyRecord={record} onCommit={spy} />,
    );

    const input = await waitFor(() => getByRole("textbox"));
    await waitFor(() => expect((input as HTMLInputElement).disabled).to.be.false);

    await user.type(input, "123.4");
    await user.tab();

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({
        propertyRecord: record,
        newValue: {
          valueFormat: PropertyValueFormat.Primitive,
          value: 123.4,
          displayValue: "123.4",
          roundingError: 0.05,
        },
      });
    });
  });

  it("allows entering quantity value when schema context is available", async () => {
    const ref = createRef<PropertyEditorAttributes>();
    const spy = vi.fn();
    const record = createRecord({ initialValue: undefined, kindOfQuantityName: "TestKOQ" });
    const { getByRole, user } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput ref={ref} propertyRecord={record} onCommit={spy} setFocus={true} />
      </SchemaMetadataContextProvider>,
    );

    const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
    await waitFor(() => expect(input.disabled).to.be.false);

    await user.type(input, "123.4 ", { skipClick: true });
    await user.tab();

    await waitFor(() => expect(input.value).to.eq("123.4 unit"));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({
        propertyRecord: record,
        newValue: {
          valueFormat: PropertyValueFormat.Primitive,
          value: 123.4,
          displayValue: "123.4 unit",
          roundingError: 0.05,
        },
      });
    });

    expect(ref.current?.getValue()).to.deep.eq({
      valueFormat: PropertyValueFormat.Primitive,
      value: 123.4,
      displayValue: "123.4 unit",
      roundingError: 0.05,
    });
  });

  it("should focus on input if setFocus is true", async () => {
    const record = createRecord({ initialValue: 123, kindOfQuantityName: "TestKOQ" });
    const ref = createRef<PropertyEditorAttributes>();

    const { getByRole } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput ref={ref} propertyRecord={record} setFocus={true} />
      </SchemaMetadataContextProvider>,
    );

    const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
    await waitFor(() => {
      expect(input).to.be.eq(document.activeElement);
    });

    // Verify that selection logic is applied
    await waitFor(() => expect(input.selectionEnd).to.eq(8));
  });

  it("commits value and blurs input when Enter is pressed", async () => {
    const record = createRecord({ initialValue: 10, kindOfQuantityName: "TestKOQ" });
    const onCommitSpy = vi.fn();
    const { getByRole, user } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} onCommit={onCommitSpy} />
      </SchemaMetadataContextProvider>,
    );
    const inputContainer = (await waitFor(() => getByRole("textbox"))) as HTMLInputElement;

    await user.click(inputContainer);
    await waitFor(() => expect(inputContainer.selectionEnd).to.eq(inputContainer.value.length));
    await user.keyboard("{Enter}");

    expect(onCommitSpy).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Escape is pressed", async () => {
    const record = createRecord({ initialValue: 10, kindOfQuantityName: "TestKOQ" });
    const onCancelSpy = vi.fn();
    const { getByRole, user } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} onCancel={onCancelSpy} />
      </SchemaMetadataContextProvider>,
    );
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
    await user.keyboard("{Escape}");

    expect(onCancelSpy).toHaveBeenCalledOnce();
  });
});
