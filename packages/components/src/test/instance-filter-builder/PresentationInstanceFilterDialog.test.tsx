/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyValueFormat as AbstractPropertyValueFormat, PrimitiveValue } from "@itwin/appui-abstract";
import { getPropertyFilterOperatorLabel, PropertyFilterRuleOperator, UiComponents } from "@itwin/components-react";
import { BeEvent, BeUiEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { FormatterSpec, ParseError, ParserSpec, QuantityParseResult } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { Descriptor, KoqPropertyValueFormatter, PropertyValueFormat } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { fireEvent, waitFor } from "@testing-library/react";
import { SchemaMetadataContextProvider } from "../../presentation-components/common/SchemaMetadataContext";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import { PresentationInstanceFilterDialog } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterDialog";
import { PresentationInstanceFilterInfo } from "../../presentation-components/instance-filter-builder/Types";
import * as instanceFilterBuilderUtils from "../../presentation-components/instance-filter-builder/Utils";
import { createTestECClassInfo, render, stubDOMMatrix, stubRaf } from "../_helpers/Common";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";

describe("PresentationInstanceFilterDialog", () => {
  stubRaf();
  stubDOMMatrix();

  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const classInfo = createTestECClassInfo();
  const stringField = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "stringProps", type: "string" } }],
    name: "stringField",
    label: "String Field",
    category,
  });
  const numericField = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "numericProp", type: "double" } }],
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "double" },
    name: "numericField",
    label: "Numeric Field",
    category,
  });
  const quantityField = createTestPropertiesContentField({
    properties: [
      {
        property: {
          classInfo,
          name: "quantityProp",
          type: "double",
          kindOfQuantity: {
            name: "testKOQ",
            label: "Test KOQ",
            persistenceUnit: "unit",
          },
        },
      },
    ],
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "double" },
    name: "quantityField",
    label: "Quantity Field",
    category,
  });
  const descriptor = createTestContentDescriptor({
    selectClasses: [{ selectClassInfo: classInfo, isSelectPolymorphic: false }],
    categories: [category],
    fields: [stringField, numericField, quantityField],
  });
  const initialFilter: PresentationInstanceFilterInfo = {
    filter: {
      field: stringField,
      operator: PropertyFilterRuleOperator.IsNull,
      value: undefined,
    },
    usedClasses: [classInfo],
  };

  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const onCloseEvent = new BeEvent<() => void>();

  before(() => {
    HTMLElement.prototype.scrollIntoView = () => {};
  });

  after(() => {
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);

    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(UiComponents, "translate").callsFake((key) => key as string);

    imodelMock.setup((x) => x.key).returns(() => "test_imodel");
    imodelMock.setup((x) => x.onClose).returns(() => onCloseEvent);
    const metadataProvider = getIModelMetadataProvider(imodelMock.object);
    sinon.stub(metadataProvider, "getECClassInfo").callsFake(async () => {
      return new ECClassInfo(classInfo.id, classInfo.name, classInfo.label, new Set(), new Set());
    });
  });

  afterEach(() => {
    onCloseEvent.raiseEvent();
    imodelMock.reset();
    sinon.restore();
  });

  it("invokes 'onApply' with string property filter rule", async () => {
    const spy = sinon.spy();
    const { container, getByText, getByDisplayValue, queryByDisplayValue, user } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    // open property selector
    const propertySelector = container.querySelector<HTMLInputElement>(".rule-property input");
    expect(propertySelector).to.not.be.null;
    await user.click(propertySelector!);
    // select property
    await user.click(getByText(stringField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(stringField.label));

    // enter value
    const inputContainer = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".rule-value input");
      expect(element).to.be.not.null;
      return element!;
    });
    await user.type(inputContainer, "test value");
    await waitFor(() => expect(queryByDisplayValue("test value")).to.not.be.null);

    fireEvent.blur(inputContainer);

    const applyButton = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
      expect(element?.disabled).to.be.false;
      return element!;
    });
    await user.click(applyButton);

    expect(spy).to.be.calledOnceWith({
      filter: {
        field: stringField,
        operator: PropertyFilterRuleOperator.Like,
        value: {
          valueFormat: AbstractPropertyValueFormat.Primitive,
          value: "test value",
          displayValue: "test value",
        } as PrimitiveValue,
      },
      usedClasses: [classInfo],
    });
  });

  it("invokes 'onApply' with numeric property filter rule", async () => {
    const spy = sinon.spy();
    const { container, getByText, getByDisplayValue, user } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    // open property selector
    const propertySelector = container.querySelector<HTMLInputElement>(".rule-property input");
    expect(propertySelector).to.not.be.null;
    await user.click(propertySelector!);
    // select property
    await user.click(getByText(numericField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(numericField.label));

    // open operator selector
    const operatorSelector = container.querySelector<HTMLInputElement>(".rule-operator .iui-select-button");
    expect(operatorSelector).to.not.be.null;
    fireEvent.click(operatorSelector!);
    // select operator
    fireEvent.click(getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.Less)));

    // wait until operator is selected
    await waitFor(() => getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.Less)));

    // enter value
    const inputContainer = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".rule-value input");
      expect(element).to.be.not.null;
      return element!;
    });
    await user.type(inputContainer, "123");

    const applyButton = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
      expect(element?.disabled).to.be.false;
      return element!;
    });
    await user.click(applyButton);

    expect(spy).to.be.calledOnceWith({
      filter: {
        field: numericField,
        operator: PropertyFilterRuleOperator.Less,
        value: {
          valueFormat: AbstractPropertyValueFormat.Primitive,
          value: 123,
          displayValue: "123",
        } as PrimitiveValue,
      },
      usedClasses: [classInfo],
    });
  });

  it("invokes 'onApply' with quantity property filter rule", async () => {
    const spy = sinon.spy();

    sinon.stub(KoqPropertyValueFormatter.prototype, "getFormatterSpec").resolves({
      applyFormatting: (magnitude: number) => `${magnitude} unit`,
    } as unknown as FormatterSpec);

    sinon.stub(KoqPropertyValueFormatter.prototype, "getParserSpec").resolves({
      parseToQuantityValue: (value: string): QuantityParseResult => {
        if (value.endsWith("unit")) {
          return { ok: true, value: Number(value.substring(0, value.length - 5)) };
        }
        return { ok: false, error: ParseError.UnknownUnit };
      },
    } as unknown as ParserSpec);

    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    }));

    const imodel = {} as IModelConnection;
    const getSchemaContext = () => ({} as SchemaContext);

    const { container, getByText, getByDisplayValue, user } = render(
      <SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={getSchemaContext}>
        <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />
      </SchemaMetadataContextProvider>,
    );

    // open property selector
    const propertySelector = container.querySelector<HTMLInputElement>(".rule-property input");
    expect(propertySelector).to.not.be.null;
    await user.click(propertySelector!);
    // select property
    await user.click(getByText(quantityField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(quantityField.label));

    // open operator selector
    const operatorSelector = container.querySelector<HTMLInputElement>(".rule-operator .iui-select-button");
    expect(operatorSelector).to.not.be.null;
    fireEvent.click(operatorSelector!);
    // select operator
    fireEvent.click(getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.Less)));

    // wait until operator is selected
    await waitFor(() => getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.Less)));

    // enter value
    const inputContainer = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".rule-value input");
      expect(element).to.be.not.null;
      return element!;
    });
    await user.type(inputContainer, "123 unit");

    const applyButton = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
      expect(element?.disabled).to.be.false;
      return element!;
    });
    await user.click(applyButton);

    expect(spy).to.be.calledOnceWith({
      filter: {
        field: quantityField,
        operator: PropertyFilterRuleOperator.Less,
        value: {
          valueFormat: AbstractPropertyValueFormat.Primitive,
          value: 123,
          displayValue: "123 unit",
        } as PrimitiveValue,
      },
      usedClasses: [classInfo],
    });
  });

  it("does not invoke `onApply` when filter is invalid", async () => {
    const spy = sinon.spy();
    const { container, getByText, getByDisplayValue } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    const applyButton = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
    expect(applyButton?.disabled).to.be.true;

    // open property selector
    const propertySelector = container.querySelector<HTMLInputElement>(".rule-property input");
    expect(propertySelector).to.not.be.null;
    fireEvent.focus(propertySelector!);
    // select property
    fireEvent.click(getByText(stringField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(stringField.label));
    expect(applyButton?.disabled).to.be.false;

    fireEvent.click(applyButton!);

    expect(spy).to.not.be.called;
  });

  it("does not invoke `onApply` when filter is missing presentation metadata", async () => {
    sinon.stub(instanceFilterBuilderUtils, "createPresentationInstanceFilter").returns(undefined);
    const spy = sinon.spy();
    const { container, getByText, getByDisplayValue } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    const applyButton = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
    expect(applyButton?.disabled).to.be.true;

    // open property selector
    const propertySelector = container.querySelector<HTMLInputElement>(".rule-property input");
    expect(propertySelector).to.not.be.null;
    fireEvent.focus(propertySelector!);
    // select property
    fireEvent.click(getByText(stringField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(stringField.label));

    // open operator selector
    const operatorSelector = container.querySelector<HTMLInputElement>(".rule-operator .iui-select-button");
    expect(operatorSelector).to.not.be.null;
    fireEvent.click(operatorSelector!);
    // select operator
    fireEvent.click(getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.IsNotNull)));

    // wait until operator is selected
    await waitFor(() => getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.IsNotNull)));
    expect(applyButton?.disabled).to.be.false;
    fireEvent.click(applyButton!);

    expect(spy).to.not.be.called;
  });

  it("shows error message for invalid numeric values", async () => {
    const { container, queryByText, user } = render(
      <PresentationInstanceFilterDialog
        imodel={imodelMock.object}
        descriptor={descriptor}
        onClose={() => {}}
        onApply={() => {}}
        isOpen={true}
        initialFilter={{
          filter: { field: numericField, operator: PropertyFilterRuleOperator.Less },
          usedClasses: [],
        }}
      />,
    );

    // type invalid value in input
    const inputContainer = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".rule-value input");
      expect(element).to.be.not.null;
      return element!;
    });

    await user.type(inputContainer, "1e");

    const applyButton = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
      expect(element?.disabled).to.be.false;
      return element!;
    });

    await user.click(applyButton);
    await waitFor(() => expect(queryByText("instance-filter-builder.error-messages.not-a-number")).to.not.be.null);
  });

  it("shows error message for invalid quantity values", async () => {
    sinon.stub(KoqPropertyValueFormatter.prototype, "getFormatterSpec").resolves({
      applyFormatting: (magnitude: number) => `${magnitude} unit`,
    } as unknown as FormatterSpec);

    sinon.stub(KoqPropertyValueFormatter.prototype, "getParserSpec").resolves({
      parseToQuantityValue: (_value: string): QuantityParseResult => ({ ok: false, error: ParseError.UnknownUnit }),
    } as unknown as ParserSpec);

    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    }));

    const imodel = {} as IModelConnection;
    const getSchemaContext = () => ({} as SchemaContext);

    const { container, queryByText, user } = render(
      <SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={getSchemaContext}>
        <PresentationInstanceFilterDialog
          imodel={imodelMock.object}
          descriptor={descriptor}
          onClose={() => {}}
          onApply={() => {}}
          isOpen={true}
          initialFilter={{
            filter: { field: quantityField, operator: PropertyFilterRuleOperator.Less },
            usedClasses: [],
          }}
        />
      </SchemaMetadataContextProvider>,
    );

    // type invalid value in input
    const inputContainer = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".rule-value input");
      expect(element).to.be.not.null;
      return element!;
    });

    await user.type(inputContainer, "1 unit");

    const applyButton = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
      expect(element?.disabled).to.be.false;
      return element!;
    });

    await user.click(applyButton);
    await waitFor(() => expect(queryByText("instance-filter-builder.error-messages.invalid")).to.not.be.null);
  });

  it("renders custom title", () => {
    const spy = sinon.spy();
    const title = "custom title";

    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodelMock.object}
        descriptor={descriptor}
        onClose={() => {}}
        title={<div>{title}</div>}
        onApply={spy}
        isOpen={true}
        initialFilter={initialFilter}
      />,
    );

    expect(queryByText(title)).to.not.be.null;
  });

  it("renders results count", async () => {
    const spy = sinon.fake(async () => 10);

    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodelMock.object}
        descriptor={descriptor}
        onClose={() => {}}
        onApply={() => {}}
        isOpen={true}
        initialFilter={initialFilter}
        getFilteredResultsCount={spy}
      />,
    );

    await waitFor(() => expect(queryByText("instance-filter-builder.results-count 10")).to.not.be.null);
  });

  it("does not render result if error is encountered", async () => {
    const spy = sinon.fake(async () => {
      throw new Error("Some Error");
    });

    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodelMock.object}
        descriptor={descriptor}
        onClose={() => {}}
        onApply={() => {}}
        isOpen={true}
        initialFilter={initialFilter}
        getFilteredResultsCount={spy}
      />,
    );

    await waitFor(() => expect(spy).to.be.calledOnce);
    expect(queryByText(/instance-filter-builder.results-count/i)).to.be.null;
  });

  it("renders with lazy-loaded descriptor", async () => {
    const spy = sinon.spy();
    const descriptorGetter = async () => descriptor;

    const { container } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptorGetter} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    await waitFor(() => {
      const propertySelector = container.querySelector<HTMLInputElement>(".rule-property .iui-input");
      expect(propertySelector).to.not.be.null;
    });
  });

  it("renders spinner while loading descriptor", async () => {
    const spy = sinon.spy();
    // simulate long loading descriptor
    const descriptorGetter = async () => undefined as unknown as Descriptor;

    const { container } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptorGetter} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    await waitFor(() => {
      const progressIndicator = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-progress");
      expect(progressIndicator).to.not.be.null;
    });
  });
});
