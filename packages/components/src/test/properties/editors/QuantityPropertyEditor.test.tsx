/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { EditorContainer, PropertyEditorProps } from "@itwin/components-react";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { FormatterSpec, ParseError, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { waitFor } from "@testing-library/react";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext";
import { QuantityEditorName, QuantityPropertyEditor } from "../../../presentation-components/properties/editors/QuantityPropertyEditor";
import { render } from "../../_helpers/Common";
import { createTestPropertyRecord } from "../../_helpers/UiComponents";

const createRecord = ({ initialValue, quantityType }: { initialValue?: number; quantityType?: string }) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: undefined },
    { typename: StandardTypeNames.Double, quantityType, editor: { name: QuantityEditorName } },
  );
};

describe("<QuantityPropertyEditor />", () => {
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

  it("renders nothing if property record is not provided", async () => {
    const { container } = render(<QuantityPropertyEditor />);
    expect(container.childElementCount).to.be.eq(0);
  });

  it("renders numeric input if schema context is not available", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(<QuantityPropertyEditor propertyRecord={record} />);

    expect(getByDisplayValue("10")).to.not.be.null;
  });

  it("renders numeric input if property does not have quantityType", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditor propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    expect(getByDisplayValue("10")).to.not.be.null;
  });

  it("renders formatted quantity value if schema context is available", async () => {
    const record = createRecord({ initialValue: 10, quantityType: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
        <QuantityPropertyEditor propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => expect(getByDisplayValue("10 unit")).to.not.be.null);
  });

  it("allows entering number when schema context is not available", async () => {
    const spy = sinon.stub<Parameters<Required<PropertyEditorProps>["onCommit"]>, ReturnType<Required<PropertyEditorProps>["onCommit"]>>();
    const record = createRecord({ initialValue: undefined, quantityType: "TestKOQ" });
    const { getByRole, user } = render(<QuantityPropertyEditor propertyRecord={record} onCommit={spy} />);

    const input = await waitFor(() => getByRole("textbox"));

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
        <QuantityPropertyEditor propertyRecord={record} onCommit={spy} />
      </SchemaMetadataContextProvider>,
    );

    const input = await waitFor(() => getByRole("textbox"));

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

  describe("editor container", async () => {
    before(async () => {
      await import("../../../presentation-components/properties/editors");
    });

    it("uses quantity property editor when editor name is set to `presentation-quantity-editor`", async () => {
      const spy = sinon.stub<Parameters<Required<PropertyEditorProps>["onCommit"]>, ReturnType<Required<PropertyEditorProps>["onCommit"]>>();
      const record = createRecord({ initialValue: undefined, quantityType: "TestKOQ" });
      const { getByRole, user } = render(
        <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => schemaContext}>
          <EditorContainer propertyRecord={record} onCommit={spy} onCancel={() => {}} />
        </SchemaMetadataContextProvider>,
      );

      const input = await waitFor(() => getByRole("textbox"));
      await user.type(input, "123.4 unit");
      await user.keyboard("{Enter}");

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
  });
});
