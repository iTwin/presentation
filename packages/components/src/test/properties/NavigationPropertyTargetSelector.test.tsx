/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createRef } from "react";
import sinon from "sinon";
import { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Content, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { fireEvent, render, waitFor } from "@testing-library/react";
import {
  NavigationPropertyTargetSelector,
  NavigationPropertyTargetSelectorAttributes,
  NavigationPropertyTargetSelectorProps,
} from "../../presentation-components/properties/NavigationPropertyTargetSelector";
import { createTestContentDescriptor, createTestContentItem } from "../_helpers/Content";
import userEvent from "@testing-library/user-event";

function createNavigationPropertyDescription(): PropertyDescription {
  return {
    displayLabel: "TestProp",
    name: "test_prop",
    typename: "navigation",
  };
}

function createRecord() {
  return new PropertyRecord({ valueFormat: PropertyValueFormat.Primitive }, createNavigationPropertyDescription());
}

describe("NavigationPropertyTargetSelector", () => {
  const testImodel = {} as IModelConnection;
  const testNavigationPropertyInfo: NavigationPropertyInfo = {
    classInfo: { id: "1", label: "Prop Class", name: "TestSchema:TestClass" },
    isForwardRelationship: true,
    isTargetPolymorphic: true,
    targetClassInfo: { id: "2", label: "Rel Class", name: "TestSchema:RelationshipClass" },
  };
  const testRecord = createRecord();
  const contentItem = createTestContentItem({
    label: LabelDefinition.fromLabelString("TestLabel"),
    primaryKeys: [{ id: "1", className: "TestSchema:TestClass" }],
    displayValues: {},
    values: {},
  });

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

  it("renders selector", async () => {
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const { getByRole, queryByText } = render(
      <NavigationPropertyTargetSelector imodel={testImodel} getNavigationPropertyInfo={async () => testNavigationPropertyInfo} propertyRecord={testRecord} />,
    );

    const inputContainer = await waitFor(()=> getByRole("textbox"));

    fireEvent.click(inputContainer);

    expect(await waitFor(() => queryByText(contentItem.label.displayValue))).to.not.be.undefined;
  });

  it("invokes onCommit with selected target", async () => {
    const spy = sinon.spy();
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const { getByRole, getByText } = render(
      <NavigationPropertyTargetSelector
        imodel={testImodel}
        getNavigationPropertyInfo={async () => testNavigationPropertyInfo}
        propertyRecord={testRecord}
        onCommit={spy}
      />,
    );

    const inputContainer = await waitFor(()=> getByRole("textbox"));

    fireEvent.click(inputContainer);

    const target = await waitFor(() => getByText(contentItem.label.displayValue));
    fireEvent.click(target);
    expect(spy).to.be.calledOnceWith({
      propertyRecord: testRecord,
      newValue: {
        valueFormat: PropertyValueFormat.Primitive,
        value: contentItem.primaryKeys[0],
        displayValue: contentItem.label.displayValue,
      },
    });
  });

  it("get value from target selector reference", async () => {
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const ref = createRef<NavigationPropertyTargetSelectorAttributes>();
    const { getByRole, getByText } = render(
      <NavigationPropertyTargetSelector
        ref={ref}
        imodel={testImodel}
        getNavigationPropertyInfo={async () => testNavigationPropertyInfo}
        propertyRecord={testRecord}
      />,
    );

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.undefined;

    const inputContainer = await waitFor(()=> getByRole("textbox"));

    fireEvent.click(inputContainer);

    const target = await waitFor(() => getByText(contentItem.label.displayValue));
    fireEvent.click(target);

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(contentItem.primaryKeys[0]);
  });

  it("sets initial value from property record", async () => {
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), []));
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "Target Class Instance",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { queryByText } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    await waitFor(() => expect(queryByText(value.displayValue)).to.not.be.null);
  });

  it("changes value when new record is passed", async () => {
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), []));
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "Target Class Instance",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { rerender, queryByDisplayValue } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    await waitFor(() => expect(queryByDisplayValue(value.displayValue)).to.not.be.null);
    const newValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "2", className: "TestSchema:TargetClass" },
      displayValue: "New Target Class Instance",
    };
    const newPropertyRecord = new PropertyRecord(newValue as PropertyValue, propertyDescription);
    rerender(<NavigationPropertyTargetSelector {...initialProps} propertyRecord={newPropertyRecord} />);
    await waitFor(() => expect(queryByDisplayValue(newValue.displayValue)).to.not.be.null);
  });

  it("click on dropdown button closes and opens menu", async () => {
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "Target Class Instance",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { container, queryByText } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const dropdownButton = await waitFor(() => {
      const element = container.querySelector<HTMLDivElement>(".iui-end-icon");
      expect(element).to.not.be.null;
      return element;
    });

    fireEvent.click(dropdownButton!);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);

    fireEvent.click(dropdownButton!);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
  });

  it("handles input blur", async () => {
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { container, getByDisplayValue, getByRole, queryByText } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const dropdownButton = await waitFor(() => {
      const element = container.querySelector<HTMLDivElement>(".iui-end-icon");
      expect(element).to.not.be.null;
      return element;
    });

    // when input value is empty
    fireEvent.click(dropdownButton!);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    fireEvent.click(dropdownButton!);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
    expect((getByRole("textbox") as HTMLInputElement).value).to.be.eq("");

    // when input value is not empty
    fireEvent.click(dropdownButton!);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    const menuItem = queryByText(contentItem.label.displayValue);
    fireEvent.click(menuItem!);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
    expect(getByDisplayValue(contentItem.label.displayValue)).to.not.be.null;
  });

  it("correctly handles keyDown events", async () => {
    const user = userEvent.setup();
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "Target Class Instance",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { getByDisplayValue, getByRole, queryByText } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    fireEvent.click(inputContainer);
    await user.keyboard("{End}");
    await user.type(inputContainer, "E", { skipClick: true });

    await user.keyboard("{Home}");
    await user.type(inputContainer, "H ", { skipClick: true });

    await waitFor(() => expect(getByDisplayValue("H Target Class InstanceE")).to.not.be.null);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);

    fireEvent.keyDown(inputContainer, { key: "Tab" });
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);

    fireEvent.click(inputContainer);

    await user.keyboard("{Enter}");
    await user.type(inputContainer, "E", { skipClick: true });
    await waitFor(() => expect(getByDisplayValue(`${contentItem.label.displayValue}E`)).to.not.be.null);
  });

  it("click on input does not close menu when menu is openned", async () => {
    sinon.stub(Presentation.presentation, "getContent").resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "Target Class Instance",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { getByRole, queryByText } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    fireEvent.click(inputContainer);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    fireEvent.click(inputContainer);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
  });
});
