/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";
import { PropertyDescription, PropertyValueFormat } from "@itwin/appui-abstract";
import {
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
          operator: "is-null",
        },
        {
          property: { name: getPropertyDescriptionName(propertyField2), displayLabel: "Prop2", typename: "string" },
          operator: "is-null",
        },
      ],
    };
    expect(PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.containSubset({
      operator: PropertyFilterRuleGroupOperator.And,
      conditions: [
        {
          operator: "is-null",
          field: propertyField1,
        },
        {
          operator: "is-null",
          field: propertyField2,
        },
      ],
    });
  });

  it("throws if rule properties field cannot be found", () => {
    const property: PropertyDescription = { name: `${INSTANCE_FILTER_FIELD_SEPARATOR}invalidFieldName`, displayLabel: "Prop", typename: "string" };
    expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, { property, operator: "is-null" })).to.throw();
  });

  it("throws if group has rule with invalid property field", () => {
    const filter: PropertyFilterRuleGroup = {
      operator: PropertyFilterRuleGroupOperator.And,
      rules: [
        {
          property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
          operator: "is-null",
        },
        {
          property: { name: `${INSTANCE_FILTER_FIELD_SEPARATOR}invalidFieldName`, displayLabel: "Prop2", typename: "string" },
          operator: "is-null",
        },
      ],
    };
    expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.throw();
  });

  it("throws if rule has non primitive value", () => {
    const filter: PropertyFilterRule = {
      property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
      operator: "is-equal",
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
          operator: "is-null",
          value: undefined,
        },
        {
          property: { name: getPropertyDescriptionName(propertyField2), displayLabel: "Prop2", typename: "string" },
          operator: "is-null",
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
              operator: "is-null",
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
              operator: "is-null",
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
          operator: "is-null",
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
          operator: "is-null",
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
          operator: "is-null",
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
    await user.click(getByText(/filterBuilder.operators.isNotNull/i));

    // wait until operator is selected
    await waitFor(() => getByText(/filterBuilder.operators.isNotNull/i));

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

  it("renders with initial filter", async () => {
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
    const { queryByDisplayValue } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} initialFilter={initialFilter} />,
    );

    await waitFor(() => {
      expect(queryByDisplayValue(propertiesField.label)).to.not.be.null;
      expect(queryByDisplayValue(propertiesField2.label)).to.not.be.null;
    });
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
    const { container, queryByDisplayValue, user, getByPlaceholderText, getByRole } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} initialFilter={initialFilter} />,
      {
        addThemeProvider: true,
      },
    );

    // ensure there's a property filter
    await waitFor(() => expect(queryByDisplayValue(propertiesField.label)).to.not.be.null);

    // expand class selector
    const expander = getByPlaceholderText("instance-filter-builder.selected-classes");
    await user.click(expander);

    // deselect class item from dropdown
    const classItem = getByRole("option", { name: classInfo2.label });
    await user.click(classItem);

    // assert that filtering rule was cleared
    await waitFor(() => expect(queryByDisplayValue(propertiesField.label)).to.be.null);
  });
});

function getPropertyDescriptionName(field: Field) {
  return `root${INSTANCE_FILTER_FIELD_SEPARATOR}${field.name}`;
}

async function getRulePropertySelector(container: HTMLElement) {
  return waitForElement<HTMLInputElement>(container, ".fb-property-name input");
}

async function getRuleOperatorSelector(container: HTMLElement) {
  return waitForElement<HTMLDivElement>(container, `.fb-row-condition [role="combobox"]`);
}
