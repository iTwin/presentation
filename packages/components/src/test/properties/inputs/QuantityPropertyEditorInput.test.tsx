/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createRef } from "react";
import sinon from "sinon";
import { PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyEditorProps } from "@itwin/components-react";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Format, FormatterSpec, FormatType, ParseError, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext.js";
import { PropertyEditorAttributes } from "../../../presentation-components/properties/editors/Common.js";
import { QuantityEditorName } from "../../../presentation-components/properties/editors/QuantityPropertyEditor.js";
import { QuantityPropertyEditorInput } from "../../../presentation-components/properties/inputs/QuantityPropertyEditorInput.js";
import { createTestPropertyRecord } from "../../_helpers/UiComponents.js";
import { render, waitFor } from "../../TestUtils.js";

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
    applyFormatting: sinon.stub<[number], string>(),
    format
  };
  const parserSpec = {
    parseToQuantityValue: sinon.stub<[string], QuantityParseResult>(),
    format,
  };

  let getFormatterSpecStub: sinon.SinonStub<
    Parameters<KoqPropertyValueFormatter["getFormatterSpec"]>,
    ReturnType<KoqPropertyValueFormatter["getFormatterSpec"]>
  >;
  let getParserSpecStub: sinon.SinonStub<Parameters<KoqPropertyValueFormatter["getParserSpec"]>, ReturnType<KoqPropertyValueFormatter["getParserSpec"]>>;

  before(() => {
    getFormatterSpecStub = sinon.stub(KoqPropertyValueFormatter.prototype, "getFormatterSpec");
    getParserSpecStub = sinon.stub(KoqPropertyValueFormatter.prototype, "getParserSpec");

    sinon.stub(format, "type").get(() => FormatType.Decimal);
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    }));
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
    const spy = sinon.stub<Parameters<Required<PropertyEditorProps>["onCommit"]>, ReturnType<Required<PropertyEditorProps>["onCommit"]>>();
    const record = createRecord({ initialValue: undefined, kindOfQuantityName: "TestKOQ" });
    const { getByRole, user } = render(<QuantityPropertyEditorInput ref={ref} propertyRecord={record} onCommit={spy} />);

    const input = await waitFor(() => getByRole("textbox"));
    await waitFor(() => expect((input as HTMLInputElement).disabled).to.be.false);

    await user.type(input, "123.4");
    await user.tab();

    await waitFor(() => {
      expect(spy).to.be.calledWith({
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
    const spy = sinon.stub<Parameters<Required<PropertyEditorProps>["onCommit"]>, ReturnType<Required<PropertyEditorProps>["onCommit"]>>();
    const record = createRecord({ initialValue: undefined, kindOfQuantityName: "TestKOQ" });
    const { getByRole, user } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput ref={ref} propertyRecord={record} onCommit={spy} setFocus={true} />
      </SchemaMetadataContextProvider>,
    );

    const input = await waitFor(() => getByRole("textbox"));
    await waitFor(() => expect((input as HTMLInputElement).disabled).to.be.false);

    await user.type(input, "123.4 unit");
    await user.tab();

    await waitFor(() => {
      expect(spy).to.be.calledWith({
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
    const record = createRecord({ initialValue: undefined, kindOfQuantityName: "TestKOQ" });
    const ref = createRef<PropertyEditorAttributes>();

    const { getByRole } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput ref={ref} propertyRecord={record} setFocus={true} />
      </SchemaMetadataContextProvider>,
    );

    const input = await waitFor(() => getByRole("textbox"));
    await waitFor(() => {
      expect(input).to.be.eq(document.activeElement);
    });
  });
});
