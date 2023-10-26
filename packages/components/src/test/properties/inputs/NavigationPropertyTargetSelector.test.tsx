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
import { PropertyEditorAttributes } from "../../../presentation-components/properties/editors/Common";
import {
  NavigationPropertyTargetSelector,
  NavigationPropertyTargetSelectorProps,
} from "../../../presentation-components/properties/inputs/NavigationPropertyTargetSelector";
import { createTestContentDescriptor, createTestContentItem } from "../../_helpers/Content";
import { render, waitFor } from "../../TestUtils";

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
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
  });

  it("renders selector", async () => {
    const { getByRole, queryByText, user } = render(
      <NavigationPropertyTargetSelector imodel={testImodel} getNavigationPropertyInfo={async () => testNavigationPropertyInfo} propertyRecord={testRecord} />,
    );

    const inputContainer = await waitFor(() => getByRole("combobox"));
    await user.click(inputContainer);

    expect(await waitFor(() => queryByText(contentItem.label.displayValue))).to.not.be.undefined;
  });

  it("invokes onCommit with selected target", async () => {
    const spy = sinon.spy();
    const { getByRole, getByText, user } = render(
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
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, getByText, user } = render(
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
    const { container, queryByText, user } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const dropdownButton = await waitFor(() => {
      const element = container.querySelector<HTMLDivElement>(".presentation-navigation-property-select-input-icon");
      expect(element).to.not.be.null;
      return element as HTMLDivElement;
    });
    await user.click(dropdownButton);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    await user.click(dropdownButton);

    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
  });

  it("handles input blur", async () => {
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
    const { container, getByRole, getByText, queryByText, user } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const dropdownButton = await waitFor(() => {
      const element = container.querySelector<HTMLDivElement>(".presentation-navigation-property-select-input-icon");
      expect(element).to.not.be.null;
      return element as HTMLDivElement;
    });

    // when input value is empty
    await user.click(dropdownButton);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    await user.click(dropdownButton);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
    expect((getByRole("combobox") as HTMLInputElement).value).to.be.eq("");

    // when input value is not empty
    await user.click(dropdownButton);
    const menuItem = getByText(contentItem.label.displayValue);
    await user.click(menuItem);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
    expect((getByRole("combobox") as HTMLInputElement).value).to.be.eq(contentItem.label.displayValue);
  });

  it("correctly handles keyDown events", async () => {
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
    const { queryByDisplayValue, getByRole, queryByText, user } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const inputContainer = await waitFor(() => getByRole("combobox"));

    await user.click(inputContainer);

    // Check if input's cursor is at the end of the text after pressing `End`.
    await user.keyboard("{End}");
    await user.type(inputContainer, "E", { skipClick: true });
    await waitFor(() => expect(queryByDisplayValue("Target Class InstanceE")).to.not.be.null);

    // Check if input's cursor is at the start of the text after pressing `Home`.
    await user.keyboard("{Home}");
    await user.type(inputContainer, "H", { skipClick: true });
    await waitFor(() => expect(queryByDisplayValue("HTarget Class InstanceE")).to.not.be.null);

    // position cursor before last character.
    await user.keyboard("{End}{ArrowLeft}");
    // Check if pressing `Space` does not invoke default `react-select` behavior.
    await user.type(inputContainer, " ", { skipClick: true });
    await waitFor(() => expect(queryByDisplayValue("HTarget Class Instance E")).to.not.be.null);

    // check if the menu is opened.
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);

    // Check if the menu is closed after the `tab` key was pressed.
    await user.keyboard("{Tab}");
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);

    await user.click(inputContainer);

    // Check if it's possible to type after option is selected and menu is opened again
    await user.keyboard("{Enter}");
    await user.type(inputContainer, "E", { skipClick: true });
    await waitFor(() => expect(queryByDisplayValue(`${contentItem.label.displayValue}E`)).to.not.be.null);
  });

  it("click on input does not close menu when menu is opened", async () => {
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
    const { getByRole, queryByText, user } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const inputContainer = await waitFor(() => getByRole("combobox"));

    await user.click(inputContainer);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
    await user.click(inputContainer);
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.not.be.null);
  });
});
