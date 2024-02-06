/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createRef } from "react";
import sinon from "sinon";
import { PrimitiveValue, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyEditorProps } from "@itwin/components-react";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { FormatterSpec, ParseError, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext";
import { PropertyEditorAttributes } from "../../../presentation-components/properties/editors/Common";
import { QuantityEditorName } from "../../../presentation-components/properties/editors/QuantityPropertyEditor";
import { QuantityPropertyEditorInput } from "../../../presentation-components/properties/inputs/QuantityPropertyEditorInput";
import { createTestPropertyRecord } from "../../_helpers/UiComponents";
import { render, waitFor } from "../../TestUtils";

const createRecord = ({ initialValue, quantityType }: { initialValue?: number; quantityType?: string }) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: undefined },
    { typename: StandardTypeNames.Double, quantityType, editor: { name: QuantityEditorName } },
  );
};

describe("<QuantityPropertyEditorInput />", () => {
  const schemaContext = {} as SchemaContext;
  const formatterSpec = {
    applyFormatting: sinon.stub<[number], string>(),
  };
  const parserSpec = {
    parseToQuantityValue: sinon.stub<[string], QuantityParseResult>(),
  };

  let getFormatterSpecStub: sinon.SinonStub<
    Parameters<KoqPropertyValueFormatter["getFormatterSpec"]>,
    ReturnType<KoqPropertyValueFormatter["getFormatterSpec"]>
  >;
  let getParserSpecStub: sinon.SinonStub<Parameters<KoqPropertyValueFormatter["getParserSpec"]>, ReturnType<KoqPropertyValueFormatter["getParserSpec"]>>;

  before(() => {
    getFormatterSpecStub = sinon.stub(KoqPropertyValueFormatter.prototype, "getFormatterSpec");
    getParserSpecStub = sinon.stub(KoqPropertyValueFormatter.prototype, "getParserSpec");

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

  it("renders numeric input if property does not have quantityType", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    expect(getByDisplayValue("10")).to.not.be.null;
  });

  it("renders formatted quantity value if schema context is available", async () => {
    const record = createRecord({ initialValue: 10, quantityType: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => expect(getByDisplayValue("10 unit")).to.not.be.null);
  });

  it("allows entering number when schema context is not available", async () => {
    const spy = sinon.stub<Parameters<Required<PropertyEditorProps>["onCommit"]>, ReturnType<Required<PropertyEditorProps>["onCommit"]>>();
    const record = createRecord({ initialValue: undefined, quantityType: "TestKOQ" });
    const { getByRole, user } = render(<QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} />);

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
        },
      });
    });
  });

  it("allows entering quantity value when schema context is available", async () => {
    const spy = sinon.stub<Parameters<Required<PropertyEditorProps>["onCommit"]>, ReturnType<Required<PropertyEditorProps>["onCommit"]>>();
    const record = createRecord({ initialValue: undefined, quantityType: "TestKOQ" });
    const { getByRole, user } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput propertyRecord={record} onCommit={spy} />
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
        },
      });
    });
  });

  it("returns property value when `getValue` is called on component `ref`", async () => {
    const ref = createRef<PropertyEditorAttributes>();
    const record = createRecord({ initialValue: undefined, quantityType: "TestKOQ" });
    const { getByRole, user } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditorInput ref={ref} propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    const input = await waitFor(() => getByRole("textbox"));
    await waitFor(() => expect((input as HTMLInputElement).disabled).to.be.false);

    await user.type(input, "123.4 unit");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const value = ref.current?.getValue() as PrimitiveValue;
      expect(value.value).to.be.eq(123.4);
      expect(value.displayValue).to.be.eq("123.4 unit");
    });
  });
});
