/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyDescription, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyEditorProps } from "@itwin/components-react";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import { Format, FormatType, ParseError, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext.js";
import { PropertyEditorAttributes } from "../../../presentation-components/properties/editors/Common.js";
import { QuantityEditorName } from "../../../presentation-components/properties/editors/QuantityPropertyEditor.js";
import { QuantityPropertyEditorInput } from "../../../presentation-components/properties/inputs/QuantityPropertyEditorInput.js";
import { createTestPropertyRecord } from "../../_helpers/UiComponents.js";
import { render, waitFor } from "../../TestUtils.js";

import type { WithConstraints } from "../../../presentation-components/common/ContentBuilder.js";

const createRecord = ({ initialValue, kindOfQuantityName }: { initialValue?: number; kindOfQuantityName?: string }) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: undefined },
    { typename: StandardTypeNames.Double, kindOfQuantityName, editor: { name: QuantityEditorName } },
  );
};

const createRecordWithConstraints = ({
  initialValue,
  kindOfQuantityName,
  constraints,
}: {
  initialValue?: number;
  kindOfQuantityName?: string;
  constraints?: { minimumValue?: number; maximumValue?: number };
}) => {
  const record = createRecord({ initialValue, kindOfQuantityName });
  (record.property as WithConstraints<PropertyDescription>).constraints = constraints;
  return record;
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

    getFormatterSpecStub.mockResolvedValue(formatterSpec);
    getParserSpecStub.mockResolvedValue(parserSpec);
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

    expect(getByDisplayValue("10")).not.toBeNull();
  });

  it("renders numeric input if property does not have kindOfQuantityName", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    expect(getByDisplayValue("10")).not.toBeNull();
  });

  it("renders formatted quantity value if schema context is available", async () => {
    const record = createRecord({ initialValue: 10, kindOfQuantityName: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => expect(getByDisplayValue("10 unit")).not.toBeNull());
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
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));

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
    await waitFor(() => expect(input.disabled).toBe(false));

    await user.type(input, "123.4 ", { skipClick: true });
    await user.tab();

    await waitFor(() => expect(input.value).toBe("123.4 unit"));
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

    expect(ref.current?.getValue()).toEqual({
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
      expect(input).toBe(document.activeElement);
    });

    // Verify that selection logic is applied
    await waitFor(() => expect(input.selectionEnd).toBe(8));
  });

  it("commits value and blurs input when Enter is pressed", async () => {
    const record = createRecord({ initialValue: 10, kindOfQuantityName: "TestKOQ" });
    const onCommitSpy = vi.fn();
    const { getByRole, user } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} onCommit={onCommitSpy} />
      </SchemaMetadataContextProvider>,
    );
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
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

  describe("with constraints", () => {
    describe("persistence unit matches display unit", () => {
      it("calls onCommit with minimumValue when typed value is smaller", async () => {
        const record = createRecordWithConstraints({
          initialValue: 5,
          kindOfQuantityName: "TestKOQ",
          constraints: { minimumValue: 10 },
        });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));

        await user.clear(input);
        await user.type(input, "3 unit", { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ newValue: expect.objectContaining({ value: 10, displayValue: "10 unit" }) }),
          );
        });
      });

      it("calls onCommit with maximumValue when typed value is larger", async () => {
        const record = createRecordWithConstraints({
          initialValue: 5,
          kindOfQuantityName: "TestKOQ",
          constraints: { maximumValue: 8 },
        });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));

        await user.clear(input);
        await user.type(input, "15 unit", { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ newValue: expect.objectContaining({ value: 8, displayValue: "8 unit" }) }),
          );
        });
      });

      it("calls onCommit with typed in value when it is in between minimumValue and maximumValue", async () => {
        const record = createRecordWithConstraints({
          initialValue: 5,
          kindOfQuantityName: "TestKOQ",
          constraints: { minimumValue: 0, maximumValue: 100 },
        });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));

        await user.clear(input);
        await user.type(input, "50 unit", { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ newValue: expect.objectContaining({ value: 50, displayValue: "50 unit" }) }),
          );
        });
      });

      it("calls onCommit with typed in value when minimumValue and maximumValue are undefined", async () => {
        const record = createRecord({ initialValue: 5, kindOfQuantityName: "TestKOQ" });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));

        await user.clear(input);
        await user.type(input, "999 unit", { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ newValue: expect.objectContaining({ value: 999, displayValue: "999 unit" }) }),
          );
        });
      });

      it("calls onCommit with typed in value when it is not a number", async () => {
        const record = createRecordWithConstraints({
          initialValue: 5,
          kindOfQuantityName: "TestKOQ",
          constraints: { minimumValue: 0, maximumValue: 10 },
        });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));

        await user.clear(input);
        await user.type(input, "abc", { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ newValue: expect.objectContaining({ value: undefined, displayValue: "abc" }) }),
          );
        });
      });
    });

    describe("persistence unit is different from display unit", () => {
      const METERS_PER_INCH = 0.0254;
      const convertMetersToInches = (meters: number) => meters / METERS_PER_INCH;
      const convertInchesToMeters = (inches: number) => inches * METERS_PER_INCH;
      beforeEach(() => {
        // Formatter: persistence (meters) → display (inches)
        formatterSpec.applyFormatting.mockImplementation((rawMeters) => `${convertMetersToInches(rawMeters)} in`);
        // Parser: display (inches) → persistence (meters)
        parserSpec.parseToQuantityValue.mockImplementation((value) => {
          if (!value.endsWith("in")) {
            return { ok: false, error: ParseError.UnknownUnit };
          }
          const inches = Number(value.substring(0, value.length - 2));
          if (isNaN(inches)) {
            return { ok: false, error: ParseError.UnknownUnit };
          }
          return { ok: true, value: convertInchesToMeters(inches) };
        });
      });

      it("calls onCommit to with minimumValue when typed value is smaller", async () => {
        const record = createRecordWithConstraints({
          initialValue: 2,
          kindOfQuantityName: "TestKOQ",
          constraints: { minimumValue: 2 },
        });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));

        await user.clear(input);
        await user.type(input, `${convertMetersToInches(1)} in`, { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
              newValue: expect.objectContaining({ value: 2, displayValue: `${convertMetersToInches(2)} in` }),
            }),
          );
        });
      });

      it("calls onCommit to with maximumValue when typed value is larger", async () => {
        const record = createRecordWithConstraints({
          initialValue: 1,
          kindOfQuantityName: "TestKOQ",
          constraints: { maximumValue: 2 },
        });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));

        await user.clear(input);
        await user.type(input, `${convertMetersToInches(3)} in`, { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
              newValue: expect.objectContaining({ value: 2, displayValue: `${convertMetersToInches(2)} in` }),
            }),
          );
        });
      });

      it("calls onCommit with typed in value when it is larger than maximumValue but converted is within constraints", async () => {
        const record = createRecordWithConstraints({
          initialValue: 1,
          kindOfQuantityName: "TestKOQ",
          constraints: { minimumValue: 0.5, maximumValue: 2 },
        });
        const spy = vi.fn();
        const { getByRole, user } = render(
          <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
            <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} setFocus={true} />
          </SchemaMetadataContextProvider>,
        );

        const input = await waitFor(() => getByRole("textbox") as HTMLInputElement);
        await waitFor(() => expect(input.disabled).toBe(false));
        const inches = convertMetersToInches(1);
        expect(inches).toBeGreaterThan(2);
        await user.clear(input);
        await user.type(input, `${inches} in`, { skipClick: true });
        await user.tab();

        await waitFor(() => {
          expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ newValue: expect.objectContaining({ value: 1, displayValue: `${inches} in` }) }),
          );
        });
      });
    });
  });
});
