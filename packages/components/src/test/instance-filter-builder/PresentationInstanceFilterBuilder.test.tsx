/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { getPropertyFilterOperatorLabel, PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator, UiComponents } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { PropertiesField, PropertyValueFormat } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import {
  PresentationInstanceFilterBuilder,
  PresentationInstanceFilterInfo,
} from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterBuilder";
import { createTestECClassInfo, stubDOMMatrix, stubRaf } from "../_helpers/Common";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";

describe("PresentationInstanceFilter", () => {
  stubRaf();
  stubDOMMatrix();

  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const classInfo = createTestECClassInfo();
  const propertiesField = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop1", type: "string" } }],
    name: "prop1Field",
    label: "propertiesField",
    category,
  });
  const propertiesField2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop2", type: "string" } }],
    name: "prop2Field",
    label: "propertiesField2",
    category,
  });
  const propertiesField3 = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop3", type: "string" } }],
    name: "prop3Field",
    label: "propertiesField3",
    category,
  });
  const navigationPropertyField = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "navField", type: "navigation" } }],
    name: "navField",
    label: "navigationField",
    category,
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "navigation" },
  });
  const descriptor = createTestContentDescriptor({
    selectClasses: [{ selectClassInfo: classInfo, isSelectPolymorphic: false }],
    categories: [category],
    fields: [propertiesField, propertiesField2, propertiesField3, navigationPropertyField],
  });
  const initialFilter: PresentationInstanceFilterInfo = {
    filter: {
      operator: PropertyFilterRuleGroupOperator.And,
      conditions: [
        {
          field: propertiesField,
          operator: PropertyFilterRuleOperator.IsNull,
          value: undefined,
        },
        {
          field: propertiesField2,
          operator: PropertyFilterRuleOperator.IsNull,
          value: undefined,
        },
      ],
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
    Element.prototype.scrollIntoView = sinon.stub();

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

  it("invokes 'onInstanceFilterChanged' with filter", async () => {
    const spy = sinon.spy();
    const { container, getByText, getByDisplayValue } = render(
      <PresentationInstanceFilterBuilder imodel={imodelMock.object} descriptor={descriptor} onInstanceFilterChanged={spy} />,
    );

    // open property selector
    const propertySelector = container.querySelector<HTMLInputElement>(".rule-property .iui-input");
    expect(propertySelector).to.not.be.null;
    fireEvent.focus(propertySelector!);

    // select property
    fireEvent.click(getByText(propertiesField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(propertiesField.label));

    // open operator selector
    const operatorSelector = container.querySelector<HTMLInputElement>(".rule-operator .iui-select-button");
    expect(operatorSelector).to.not.be.null;
    fireEvent.click(operatorSelector!);

    // select operator
    fireEvent.click(getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.IsNotNull)));

    // wait until operator is selected
    await waitFor(() => getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.IsNotNull)));

    expect(spy).to.be.calledWith({
      filter: {
        field: propertiesField,
        operator: PropertyFilterRuleOperator.IsNotNull,
        value: undefined,
      },
      usedClasses: [classInfo],
    });
  });

  it("renders with initial filter", () => {
    const spy = sinon.spy();
    const { container, queryByDisplayValue } = render(
      <PresentationInstanceFilterBuilder imodel={imodelMock.object} descriptor={descriptor} onInstanceFilterChanged={spy} initialFilter={initialFilter} />,
    );

    const rules = container.querySelectorAll(".rule-property");
    expect(rules.length).to.be.eq(2);
    const rule1 = queryByDisplayValue(propertiesField.label);
    expect(rule1).to.not.be.null;
    const rule2 = queryByDisplayValue(propertiesField2.label);
    expect(rule2).to.not.be.null;
  });

  describe("UniqueValuesRenderer", () => {
    const createFilter = (operator: PropertyFilterRuleOperator, field?: PropertiesField): PresentationInstanceFilterInfo => {
      return {
        filter: {
          operator: PropertyFilterRuleGroupOperator.Or,
          conditions: [
            {
              field: field ?? propertiesField,
              operator,
              value: undefined,
            },
          ],
        },
        usedClasses: [],
      };
    };

    it("renders <UniquePropertyValuesSelector /> when operator is `IsEqual` and property is not equal to `navigation`", async () => {
      const filter = createFilter(PropertyFilterRuleOperator.IsEqual);
      const { queryByText } = render(
        <PresentationInstanceFilterBuilder
          imodel={imodelMock.object}
          descriptor={descriptor}
          onInstanceFilterChanged={() => {}}
          initialFilter={filter}
          enableUniqueValuesRenderer
        />,
      );
      await waitFor(() => expect(queryByText("unique-values-property-editor.select-values")).to.not.be.null);
    });

    it("renders <UniquePropertyValuesSelector /> when operator is `IsNotEqual` and property is not equal to `navigation`", async () => {
      const filter = createFilter(PropertyFilterRuleOperator.IsNotEqual);
      const { queryByText } = render(
        <PresentationInstanceFilterBuilder
          imodel={imodelMock.object}
          descriptor={descriptor}
          onInstanceFilterChanged={() => {}}
          initialFilter={filter}
          enableUniqueValuesRenderer
        />,
      );
      await waitFor(() => expect(queryByText("unique-values-property-editor.select-values")).to.not.be.null);
    });

    it("does not render <UniquePropertyValuesSelector /> when the property is equal to `navigation`", async () => {
      const filter = createFilter(PropertyFilterRuleOperator.IsEqual, navigationPropertyField);
      const { queryByText } = render(
        <PresentationInstanceFilterBuilder
          imodel={imodelMock.object}
          descriptor={descriptor}
          onInstanceFilterChanged={() => {}}
          initialFilter={filter}
          enableUniqueValuesRenderer
        />,
      );
      await waitFor(() => expect(queryByText("unique-values-property-editor.select-values")).to.be.null);
    });
  });
});
