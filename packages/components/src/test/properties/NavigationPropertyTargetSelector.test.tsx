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
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  NavigationPropertyTargetSelector,
  NavigationPropertyTargetSelectorAttributes,
  NavigationPropertyTargetSelectorProps,
} from "../../presentation-components/properties/NavigationPropertyTargetSelector";
import { createTestContentDescriptor, createTestContentItem } from "../_helpers/Content";

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

  const getContentStub = sinon.stub<Parameters<PresentationManager["getContent"]>, ReturnType<PresentationManager["getContent"]>>();

  before(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(Presentation, "presentation").get(() => ({
      getContent: getContentStub,
    }));
  });

  after(async () => {
    sinon.restore();
  });

  beforeEach(() => {
    getContentStub.reset();
  });

  it("renders selector", async () => {
    const user = userEvent.setup();
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const { getByRole, queryByText } = render(
      <NavigationPropertyTargetSelector imodel={testImodel} getNavigationPropertyInfo={async () => testNavigationPropertyInfo} propertyRecord={testRecord} />,
    );

    const inputContainer = await waitFor(() => getByRole("combobox"));
    await user.click(inputContainer);

    expect(await waitFor(() => queryByText(contentItem.label.displayValue))).to.not.be.undefined;
  });

  it("invokes onCommit with selected target", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const { getByRole, getByText } = render(
      <NavigationPropertyTargetSelector
        imodel={testImodel}
        getNavigationPropertyInfo={async () => testNavigationPropertyInfo}
        propertyRecord={testRecord}
        onCommit={spy}
      />,
    );

    const inputContainer = await waitFor(() => getByRole("combobox"));
    await user.click(inputContainer);

    const target = await waitFor(() => getByText(contentItem.label.displayValue));
    await user.click(target);
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
    const user = userEvent.setup();
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
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

    const inputContainer = await waitFor(() => getByRole("combobox"));
    await user.click(inputContainer);

    const target = await waitFor(() => getByText(contentItem.label.displayValue));
    await user.click(target);

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(contentItem.primaryKeys[0]);
  });

  it("sets initial value from property record", async () => {
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), []));
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
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), []));
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
    const user = userEvent.setup();
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
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
      const element = container.querySelector<HTMLDivElement>(".presentation-navigation-property-select-input-icon");
      expect(element).to.not.be.null;
      return element;
    });
    await user.click(dropdownButton!);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    await user.click(dropdownButton!);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
  });

  it("handles input blur", async () => {
    const user = userEvent.setup();
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
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
    const { container, getByRole, getByText, queryByText } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const dropdownButton = await waitFor(() => {
      const element = container.querySelector<HTMLDivElement>(".presentation-navigation-property-select-input-icon");
      expect(element).to.not.be.null;
      return element;
    });

    // when input value is empty
    await user.click(dropdownButton!);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    await user.click(dropdownButton!);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
    expect((getByRole("combobox") as HTMLInputElement).value).to.be.eq("");

    // when input value is not empty
    await user.click(dropdownButton!);
    const menuItem = getByText(contentItem.label.displayValue);
    await user.click(menuItem);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
    expect((getByRole("combobox") as HTMLInputElement).value).to.be.eq(contentItem.label.displayValue);
  });

  it("correctly handles keyDown events", async () => {
    const user = userEvent.setup();
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
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

    const inputContainer = await waitFor(() => getByRole("combobox"));

    await user.click(inputContainer);

    // Check if input's cursor is at the end of the text after pressing `End`.
    await user.keyboard("{End}");
    await user.type(inputContainer, "E", { skipClick: true });

    // Check if input's cursor is at the start of the text after pressing `Home`.
    await user.keyboard("{Home}");
    await user.type(inputContainer, "H", { skipClick: true });

    // Check if pressing `Space` does not invoke default `react-select` behavior.
    await user.type(inputContainer, " ", { skipClick: true });

    await waitFor(() => expect(getByDisplayValue("H Target Class InstanceE")).to.not.be.null);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);

    // Check if the menu is closed after the `tab` key was pressed.
    await user.keyboard("{Tab}");
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);

    await user.click(inputContainer);

    // Check if it's possible to type after option is selected and menu is opened again
    await user.keyboard("{Enter}");
    await user.type(inputContainer, "E", { skipClick: true });
    await waitFor(() => expect(getByDisplayValue(`${contentItem.label.displayValue}E`)).to.not.be.null);
  });

  it("click on input does not close menu when menu is opened", async () => {
    const user = userEvent.setup();
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
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

    const inputContainer = await waitFor(() => getByRole("combobox"));

    await user.click(inputContainer);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    await user.click(inputContainer);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
  });
});
