/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import { UniquePropertyValuesSelector } from "../../presentation-components/properties/UniquePropertyValuesSelector";
import { createTestECClassInfo, render } from "../_helpers/Common";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";

describe("UniquePropertyValuesSelector", () => {
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
    name: "propertyName",
    label: "propertiesField",
    category,
  });

  const descriptor = createTestContentDescriptor({
    selectClasses: [{ selectClassInfo: classInfo, isSelectPolymorphic: false }],
    categories: [category],
    fields: [propertiesField],
  });

  const propertyDescription = {
    name: "#propertyName",
    displayLabel: "propertiesField",
    typename: "number",
    editor: undefined,
  };

  const convertToPropertyValue = (displayValue: string[], groupedRawValues: string[][]): PropertyValue => {
    return {
      valueFormat: PropertyValueFormat.Primitive,
      displayValue: JSON.stringify(displayValue),
      value: JSON.stringify(groupedRawValues),
    };
  };

  const testImodel = {} as IModelConnection;

  it("invokes `onChange` when item from the menu is selected and then deselected", async () => {
    const spy = sinon.spy();

    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });

    const { queryByTestId, queryByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={spy} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    // click on menu item
    const menuItem = await waitFor(() => queryByText("TestValue1"));
    await user.click(menuItem!);
    expect(spy).to.be.calledWith({
      valueFormat: PropertyValueFormat.Primitive,
      displayValue: JSON.stringify(["TestValue1"]),
      value: JSON.stringify([["TestValue1"]]),
    });

    // open menu again
    await user.click(selector!);

    // click on `clear` button
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

  it("menu shows `No options` message when there is no `fieldDescriptor`", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });
    const description: PropertyDescription = {
      name: "",
      displayLabel: "",
      typename: "",
      editor: undefined,
    };
    const { queryByText, user } = render(
      <UniquePropertyValuesSelector property={description} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    expect(queryByText("No options")).to.not.be.null;
  });

  it("sets provided value", () => {
    const displayValue = ["TestValue"];
    const groupedRawValues = [["TestValue"]];
    const value = convertToPropertyValue(displayValue, groupedRawValues);

    const { queryByText } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} value={value} />,
    );

    expect(queryByText(displayValue[0])).to.not.be.null;
  });

  it("selects multiple provided values", () => {
    const displayValue = ["TestValue1", "TestValue2"];
    const groupedRawValues = [["TestValue1"], ["TestValue2"]];
    const value = convertToPropertyValue(displayValue, groupedRawValues);

    const { queryByText } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} value={value} />,
    );

    expect(queryByText(displayValue[0])).to.not.be.null;
    expect(queryByText(displayValue[1])).to.not.be.null;
  });

  it("does not set value when provided value is invalid", () => {
    const { queryByText } = render(
      <UniquePropertyValuesSelector
        property={propertyDescription}
        onChange={() => {}}
        imodel={testImodel}
        descriptor={descriptor}
        value={{ valueFormat: PropertyValueFormat.Primitive, displayValue: "a", value: "a" }}
      />,
    );
    expect(queryByText("unique-values-property-editor.select-values")).to.not.be.null;
  });

  it("sets empty value text if provided value is an empty string", async () => {
    const { container } = render(
      <UniquePropertyValuesSelector
        property={propertyDescription}
        onChange={() => {}}
        imodel={testImodel}
        descriptor={descriptor}
        value={{ valueFormat: PropertyValueFormat.Primitive, displayValue: '[""]', value: '[[""]]' }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".iui-tag-label")?.innerHTML).to.include("Empty Value"));
  });

  it("loads two rows and selects one of them `isOptionSelected`", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });

    const { queryByText, container, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);
    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item.iui-active").length).to.be.equal(0));

    // trigger the addition to selected elements.
    const option = container.querySelector(".iui-menu-item");
    await user.click(option!);
    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item.iui-active").length).to.be.equal(0));

    // click on menu item to make it marked as active
    const menuItem = await waitFor(() => queryByText("TestValue1"));
    await user.click(menuItem!);

    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item.iui-active").length).to.be.equal(1));
  });

  it("does not load a row with undefined values", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: undefined, groupedRawValues: [undefined] }],
    });

    const { queryByText, container, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    // assert that no row is loaded in the dropdown.
    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item").length).to.be.equal(0));
  });

  it("does not load a row with a displayLabel but no defined groupedRawValues", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: "TestValue", groupedRawValues: [undefined] }],
    });

    const { queryByText, container, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    // assert that no row is loaded in the dropdown.
    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item").length).to.be.equal(0));
  });

  it("loads row with empty string as displayValue and sets it to an 'Empty Value' string", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: "", groupedRawValues: [""] }],
    });

    const { queryByText, container, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    // assert that the loaded row is the one with the empty string
    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item").length).to.be.equal(1));
  });

  it("loads row even if one of the groupedRawValues is undefined ", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: "TestValue", groupedRawValues: [undefined, ""] }],
    });

    const { queryByText, container, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item").length).to.be.equal(1));
  });
});
