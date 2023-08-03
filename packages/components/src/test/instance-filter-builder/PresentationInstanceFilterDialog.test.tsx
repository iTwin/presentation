/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { getPropertyFilterOperatorLabel, PropertyFilterRuleOperator, UiComponents } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Descriptor, PropertyValueFormat } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import { PresentationInstanceFilterDialog } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterDialog";
import { PresentationInstanceFilterInfo } from "../../presentation-components/instance-filter-builder/Types";
import * as instanceFilterBuilderUtils from "../../presentation-components/instance-filter-builder/Utils";
import { createTestECClassInfo, stubDOMMatrix, stubRaf } from "../_helpers/Common";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";

describe("PresentationInstanceFilterDialog", () => {
  stubRaf();
  stubDOMMatrix();

  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const classInfo = createTestECClassInfo();
  const propertiesField1 = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop1", type: "string" } }],
    name: "prop1Field",
    label: "propertiesField1",
    category,
  });
  const propertiesField2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop2", type: "double" } }],
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "double" },
    name: "prop2Field",
    label: "propertiesField2",
    category,
  });
  const descriptor = createTestContentDescriptor({
    selectClasses: [{ selectClassInfo: classInfo, isSelectPolymorphic: false }],
    categories: [category],
    fields: [propertiesField1, propertiesField2],
  });
  const initialFilter: PresentationInstanceFilterInfo = {
    filter: {
      field: propertiesField1,
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
    await UiComponents.initialize(localization);
    await Presentation.initialize();

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
    UiComponents.terminate();
    Presentation.terminate();
    sinon.restore();
  });

  it("invokes 'onApply' with filter", async () => {
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
    fireEvent.click(getByText(propertiesField1.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(propertiesField1.label));

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

    expect(spy).to.be.calledOnceWith({
      filter: {
        field: propertiesField1,
        operator: PropertyFilterRuleOperator.IsNotNull,
        value: undefined,
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
    fireEvent.click(getByText(propertiesField1.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(propertiesField1.label));
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
    fireEvent.click(getByText(propertiesField1.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(propertiesField1.label));

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

  it("sets error message if numeric inpout is invalid", async () => {
    const user = userEvent.setup();
    const { container, getByText, getByDisplayValue, getByRole } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={() => {}} isOpen={true} />,
    );

    const applyButton = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
    expect(applyButton?.disabled).to.be.true;

    // open property selector
    const propertySelector = container.querySelector<HTMLInputElement>(".rule-property input");
    expect(propertySelector).to.not.be.null;
    fireEvent.focus(propertySelector!);
    // select property
    fireEvent.click(getByText(propertiesField2.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(propertiesField2.label));

    // type invalid value in input
    const inputContainer = getByRole("textbox");

    await user.type(inputContainer, "1e");

    expect(applyButton?.disabled).to.be.false;

    fireEvent.click(applyButton!);

    await waitFor(() => expect(getByText("instance-filter-builder.error-messages.notANumber")).to.not.be.undefined);
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

  it("renders filterResultCountRenderer", () => {
    const spy = sinon.spy();
    const count = "custom count";

    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodelMock.object}
        descriptor={descriptor}
        onClose={() => {}}
        filterResultCountRenderer={() => {
          return <div>{count}</div>;
        }}
        onApply={spy}
        isOpen={true}
      />,
    );

    expect(queryByText(count)).to.not.be.null;
  });

  it("renders with lazy-loaded descriptor", async () => {
    const spy = sinon.spy();
    const descriptorGetter = async () => descriptor;

    const { container } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptorGetter} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    await waitFor(() => {
      const propertySelector = container.querySelector<HTMLInputElement>(".rule-property .iui-input");
      expect(propertySelector).to.not.be.undefined;
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
