import { render, waitFor } from "@testing-library/react";
import { UniquePropertyValuesTargetSelector } from "../../presentation-components/properties/UniquePropertyValuesTargetSelector";
import sinon from "sinon";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyFilterRuleOperator } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";
import { createTestECClassInfo } from "../_helpers/Common";
import userEvent from "@testing-library/user-event";
import { expect } from "chai";
import { EmptyLocalization } from "@itwin/core-common";
import { Presentation } from "@itwin/presentation-frontend";

describe.only("UniquePropertyValuesTargetSelector", () => {
  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    await Presentation.initialize();
  });

  afterEach(async () => {
    Presentation.terminate();
    sinon.restore();
  });

  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const classInfo = createTestECClassInfo();

  const propertiesField = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop1", type: "string" } }],
    name: "prop1Field",
    label: "propertiesField",
    category,
  });

  const descriptor = createTestContentDescriptor({
    selectClasses: [{ selectClassInfo: classInfo, isSelectPolymorphic: false }],
    categories: [category],
    fields: [propertiesField],
  });

  it("invokes `onChange` when item from the menu is selected and then deselected", async () => {
    const user = userEvent.setup();
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });
    const spy = sinon.spy();
    const description: PropertyDescription = {
      name: "propertyName",
      displayLabel: "propertiesField",
      typename: "number",
      editor: undefined,
    };
    const { queryByTestId, queryByText } = render(
      <UniquePropertyValuesTargetSelector
        property={description}
        onChange={spy}
        operator={PropertyFilterRuleOperator.IsEqual}
        imodel={{} as IModelConnection}
        descriptor={descriptor}
      />,
    );

    const selector = await waitFor(() => queryByText("search"));
    await user.click(selector!);

    const menuItem = await waitFor(() => queryByText("TestValue1"));
    await user.click(menuItem!);
    expect(spy).to.be.calledWith({
      valueFormat: PropertyValueFormat.Primitive,
      displayValue: JSON.stringify(["TestValue1"]),
      value: JSON.stringify([["TestValue1"]]),
    });

    await user.click(selector!);

    const clearIndicator = await waitFor(() => queryByTestId("multi-tag-select-clearIndicator"));
    await user.click(clearIndicator!);
    await waitFor(() =>
      expect(spy).to.be.calledWith({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: undefined,
        value: undefined,
      }),
    );
  });

  it("menu showss `No options` message when there is no fieldDescriptor", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });
    const user = userEvent.setup();
    const description: PropertyDescription = {
      name: "propertyName",
      displayLabel: "NotpropertiesField",
      typename: "number",
      editor: undefined,
    };
    const { queryByText } = render(
      <UniquePropertyValuesTargetSelector
        property={description}
        onChange={() => {}}
        operator={PropertyFilterRuleOperator.IsEqual}
        imodel={{} as IModelConnection}
        descriptor={descriptor}
      />,
    );

    const selector = await waitFor(() => queryByText("search"));
    await user.click(selector!);

    expect(queryByText("No options")).to.not.be.null;
  });

  it("sets provided value", () => {
    const description: PropertyDescription = {
      name: "propertyName",
      displayLabel: "propertiesField",
      typename: "number",
      editor: undefined,
    };

    const value: PropertyValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: JSON.stringify(["TestValue"]),
      displayValue: JSON.stringify("TestValue"),
    };

    render(
      <UniquePropertyValuesTargetSelector
        property={description}
        onChange={() => {}}
        operator={PropertyFilterRuleOperator.IsEqual}
        imodel={{} as IModelConnection}
        descriptor={descriptor}
        value={value}
      />,
    );
  });

  it("sets multiple provided values", () => {
    const description: PropertyDescription = {
      name: "propertyName",
      displayLabel: "propertiesField",
      typename: "number",
      editor: undefined,
    };

    const value: PropertyValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: JSON.stringify([["TestValue1"], ["TestValue2"]]),
      displayValue: JSON.stringify(["TestValue1, TestValue2"]),
    };

    render(
      <UniquePropertyValuesTargetSelector
        property={description}
        onChange={() => {}}
        operator={PropertyFilterRuleOperator.IsEqual}
        imodel={{} as IModelConnection}
        descriptor={descriptor}
        value={value}
      />,
    );
  });
});
