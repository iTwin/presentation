/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";
import { PropertyDescription, PropertyValueFormat } from "@itwin/appui-abstract";
import {
  getPropertyFilterOperatorLabel,
  PropertyFilter,
  PropertyFilterRule,
  PropertyFilterRuleGroup,
  PropertyFilterRuleGroupOperator,
  PropertyFilterRuleOperator,
  UiComponents,
} from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Field } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import {
  PresentationInstanceFilter,
  PresentationInstanceFilterBuilder,
  PresentationInstanceFilterInfo,
} from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder";
import { INSTANCE_FILTER_FIELD_SEPARATOR } from "../../presentation-components/instance-filter-builder/Utils";
import { createTestECClassInfo, stubDOMMatrix, stubRaf } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../_helpers/Content";
import { render, waitFor, waitForElement } from "../TestUtils";

describe("PresentationInstanceFilter.fromComponentsPropertyFilter", () => {
  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const propertyField1 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop1", type: "string" } }],
    category,
    name: "propField1",
  });
  const propertyField2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop1", type: "string" } }],
    category,
    name: "propField1",
  });
  const descriptor = createTestContentDescriptor({
    categories: [category],
    fields: [propertyField1, propertyField2],
  });

  it("finds properties fields for property description", () => {
    const filter: PropertyFilterRuleGroup = {
      operator: PropertyFilterRuleGroupOperator.And,
      rules: [
        {
          property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
          operator: PropertyFilterRuleOperator.IsNull,
        },
        {
          property: { name: getPropertyDescriptionName(propertyField2), displayLabel: "Prop2", typename: "string" },
          operator: PropertyFilterRuleOperator.IsNull,
        },
      ],
    };
    expect(PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.containSubset({
      operator: PropertyFilterRuleGroupOperator.And,
      conditions: [
        {
          operator: PropertyFilterRuleOperator.IsNull,
          field: propertyField1,
        },
        {
          operator: PropertyFilterRuleOperator.IsNull,
          field: propertyField2,
        },
      ],
    });
  });

  it("throws if rule properties field cannot be found", () => {
    const property: PropertyDescription = { name: `${INSTANCE_FILTER_FIELD_SEPARATOR}invalidFieldName`, displayLabel: "Prop", typename: "string" };
    expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, { property, operator: PropertyFilterRuleOperator.IsNull })).to.throw();
  });

  it("throws if group has rule with invalid property field", () => {
    const filter: PropertyFilterRuleGroup = {
      operator: PropertyFilterRuleGroupOperator.And,
      rules: [
        {
          property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
          operator: PropertyFilterRuleOperator.IsNull,
        },
        {
          property: { name: `${INSTANCE_FILTER_FIELD_SEPARATOR}invalidFieldName`, displayLabel: "Prop2", typename: "string" },
          operator: PropertyFilterRuleOperator.IsNull,
        },
      ],
    };
    expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.throw();
  });

  it("throws if rule has non primitive value", () => {
    const filter: PropertyFilterRule = {
      property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
      operator: PropertyFilterRuleOperator.IsEqual,
      value: { valueFormat: PropertyValueFormat.Array, items: [], itemsTypeName: "number" },
    };
    expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.throw();
  });
});

describe("PresentationInstanceFilter.toComponentsPropertyFilter", () => {
  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const propertyField1 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop1", type: "string" } }],
    category,
    name: "propField1",
    label: "Prop1",
  });
  const propertyField2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop2", type: "string" } }],
    category,
    name: "propField2",
    label: "Prop2",
  });
  const propertyField3 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop3", type: "string" } }],
    category,
    name: "propField3",
    label: "Prop3",
  });
  const nestedField = createTestNestedContentField({
    nestedFields: [propertyField3],
    category,
    name: "nestedField",
    label: "NestedProp",
  });
  const nestedField2 = createTestNestedContentField({
    nestedFields: [nestedField],
    category,
    name: "nestedField2",
    label: "NestedProp2",
  });
  propertyField3.rebuildParentship(nestedField);
  const descriptor = createTestContentDescriptor({
    categories: [category],
    fields: [propertyField1, propertyField2, nestedField2],
  });

  it("property filter converts to presentation filter and vise versa correctly", () => {
    const filter: PropertyFilter = {
      operator: PropertyFilterRuleGroupOperator.And,
      rules: [
        {
          property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
          operator: PropertyFilterRuleOperator.IsNull,
          value: undefined,
        },
        {
          property: { name: getPropertyDescriptionName(propertyField2), displayLabel: "Prop2", typename: "string" },
          operator: PropertyFilterRuleOperator.IsNull,
          value: undefined,
        },
      ],
    };

    const presentationFilter = PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter);
    const result = PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter);
    expect(result).to.be.deep.eq(filter);
  });

  it("converts presentation filter with nested conditions to property filter", () => {
    const presentationFilter: PresentationInstanceFilter = {
      operator: PropertyFilterRuleGroupOperator.And,
      conditions: [
        {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field: propertyField1,
              operator: PropertyFilterRuleOperator.IsNull,
              value: undefined,
            },
          ],
        },
      ],
    };

    const propertyFilter: PropertyFilter = {
      operator: PropertyFilterRuleGroupOperator.And,
      rules: [
        {
          operator: PropertyFilterRuleGroupOperator.And,
          rules: [
            {
              property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
              operator: PropertyFilterRuleOperator.IsNull,
              value: undefined,
            },
          ],
        },
      ],
    };

    const result = PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter);
    expect(result).to.be.deep.eq(propertyFilter);
  });

  it("converts presentation filter with nested fields to property filter", () => {
    const presentationFilter: PresentationInstanceFilter = {
      operator: PropertyFilterRuleGroupOperator.And,
      conditions: [
        {
          field: propertyField3,
          operator: PropertyFilterRuleOperator.IsNull,
          value: undefined,
        },
      ],
    };

    const propertyFilter: PropertyFilter = {
      operator: PropertyFilterRuleGroupOperator.And,
      rules: [
        {
          property: {
            name: `${getPropertyDescriptionName(nestedField2)}$${nestedField.name}$${propertyField3.name}`,
            displayLabel: "Prop3",
            typename: "string",
          },
          operator: PropertyFilterRuleOperator.IsNull,
          value: undefined,
        },
      ],
    };

    const result = PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter);
    expect(result).to.be.deep.eq(propertyFilter);
  });

  it("throws if property used in filter is not found in descriptor", () => {
    const propertyField = createTestPropertiesContentField({
      properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop", type: "string" } }],
      category,
      name: "propField",
      label: "Prop",
    });

    const presentationFilter: PresentationInstanceFilter = {
      operator: PropertyFilterRuleGroupOperator.And,
      conditions: [
        {
          field: propertyField,
          operator: PropertyFilterRuleOperator.IsNull,
          value: undefined,
        },
      ],
    };

    expect(() => PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter)).to.throw();
  });
});

describe("PresentationInstanceFilter", () => {
  stubRaf();
  stubDOMMatrix();

  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const classInfo = createTestECClassInfo({ id: "0x123", name: "class1", label: "Class 1" });
  const classInfo2 = createTestECClassInfo({ id: "0x456", name: "class2", label: "Class 2" });
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
  const descriptor = createTestContentDescriptor({
    selectClasses: [
      { selectClassInfo: classInfo, isSelectPolymorphic: false },
      { selectClassInfo: classInfo2, isSelectPolymorphic: false },
    ],
    categories: [category],
    fields: [propertiesField, propertiesField2, propertiesField3],
  });

  const onCloseEvent = new BeEvent<() => void>();
  const imodel = {
    key: "test_imodel",
    onClose: onCloseEvent,
  } as IModelConnection;

  before(() => {
    HTMLElement.prototype.scrollIntoView = () => {};

    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(UiComponents, "translate").callsFake((key) => key as string);
    sinon.stub(Presentation, "localization").get(() => localization);

    const metadataProvider = getIModelMetadataProvider(imodel);
    sinon.stub(metadataProvider, "getECClassInfo").callsFake(async () => {
      return new ECClassInfo(classInfo.id, classInfo.name, classInfo.label, new Set(), new Set());
    });
  });

  after(() => {
    onCloseEvent.raiseEvent();
    sinon.restore();
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  it("invokes 'onInstanceFilterChanged' with filter", async () => {
    const spy = sinon.spy();
    const { container, getByText, getByTitle, getByDisplayValue, user } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);

    // select property
    await user.click(getByTitle(propertiesField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(propertiesField.label));

    // open operator selector
    const operatorSelector = await getRuleOperatorSelector(container);
    await user.click(operatorSelector);

    // select operator
    await user.click(getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.IsNotNull)));

    // wait until operator is selected
    await waitFor(() => getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.IsNotNull)));

    await waitFor(() =>
      expect(spy).to.be.calledWith({
        filter: {
          field: propertiesField,
          operator: PropertyFilterRuleOperator.IsNotNull,
          value: undefined,
        },
        usedClasses: [classInfo],
      }),
    );
  });

  it("renders with initial filter", () => {
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

    const spy = sinon.spy();
    const { container, queryByDisplayValue } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} initialFilter={initialFilter} />,
    );

    const rules = container.querySelectorAll(".rule-property");
    expect(rules.length).to.be.eq(2);
    const rule1 = queryByDisplayValue(propertiesField.label);
    expect(rule1).to.not.be.null;
    const rule2 = queryByDisplayValue(propertiesField2.label);
    expect(rule2).to.not.be.null;
  });

  it("clears property filters upon class selector change", async () => {
    const initialFilter: PresentationInstanceFilterInfo = {
      filter: {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: propertiesField,
            operator: PropertyFilterRuleOperator.IsNull,
            value: undefined,
          },
        ],
      },
      usedClasses: [classInfo, classInfo2],
    };

    const spy = sinon.spy();
    const { container, queryByDisplayValue, user, getByPlaceholderText } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} initialFilter={initialFilter} />,
      {
        addThemeProvider: true,
      },
    );

    // ensure there's a property filter
    const rules = container.querySelectorAll(".rule-property");
    expect(rules.length).to.be.eq(1);
    expect(queryByDisplayValue(propertiesField.label)).to.not.be.null;

    // expand class selector
    const expander = getByPlaceholderText("instance-filter-builder.selected-classes");
    await user.click(expander);

    // deselect class item from dropdown
    const classItem = document.querySelector(`div[label="${classInfo2.label}"]`);
    await user.click(classItem!);

    // assert that filtering rule was cleared
    await waitFor(() => expect(queryByDisplayValue(propertiesField.label)).to.be.null);
  });
});

function getPropertyDescriptionName(field: Field) {
  return `root${INSTANCE_FILTER_FIELD_SEPARATOR}${field.name}`;
}

async function getRulePropertySelector(container: HTMLElement) {
  return waitForElement<HTMLInputElement>(container, ".rule-property input");
}

async function getRuleOperatorSelector(container: HTMLElement) {
  return waitForElement<HTMLDivElement>(container, `.rule-operator [role="combobox"]`);
}
