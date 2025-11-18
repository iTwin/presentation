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
import { Content, Item, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { stubVirtualization } from "../../_helpers/Common.js";
import { createTestContentDescriptor, createTestContentItem } from "../../_helpers/Content.js";
import { PropertyEditorAttributes } from "../../../presentation-components/properties/editors/Common.js";
import { VALUE_BATCH_SIZE } from "../../../presentation-components/properties/inputs/ItemsLoader.js";
import {
  NavigationPropertyTargetSelector,
  NavigationPropertyTargetSelectorProps,
} from "../../../presentation-components/properties/inputs/NavigationPropertyTargetSelector.js";
import { render, waitFor } from "../../TestUtils.js";

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

  stubVirtualization();
  before(() => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(Presentation, "presentation").get(() => ({
      getContent: getContentStub,
    }));
  });

  after(() => {
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
    const baseContentItem = createTestContentItem({
      label: LabelDefinition.fromLabelString(value.displayValue),
      primaryKeys: [{ id: "1", className: "TestSchema:TargetClass" }],
      displayValues: {},
      values: {},
    });
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem, baseContentItem]));

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { getByDisplayValue } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    await waitFor(() => getByDisplayValue(value.displayValue));
  });

  it("changes value when new record is passed", async () => {
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "Target Class Instance",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);
    const baseContentItem = createTestContentItem({
      label: LabelDefinition.fromLabelString(value.displayValue),
      primaryKeys: [{ id: "1", className: "TestSchema:TargetClass" }],
      displayValues: {},
      values: {},
    });
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem, baseContentItem]));

    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };
    const { rerender, getByDisplayValue } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    await waitFor(() => {
      getByDisplayValue(value.displayValue);
    });
    const newValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "2", className: "TestSchema:TargetClass" },
      displayValue: "New Target Class Instance",
    };
    const newPropertyRecord = new PropertyRecord(newValue as PropertyValue, propertyDescription);
    const newContentItem = createTestContentItem({
      label: LabelDefinition.fromLabelString(newValue.displayValue),
      primaryKeys: [{ id: "2", className: "TestSchema:TargetClass" }],
      displayValues: {},
      values: {},
    });

    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem, baseContentItem, newContentItem]));
    rerender(<NavigationPropertyTargetSelector {...initialProps} propertyRecord={newPropertyRecord} />);

    await waitFor(() => {
      getByDisplayValue(newValue.displayValue);
    });
  });

  it("does not load options on filter change when there is enough options", async () => {
    const propertyDescription = createNavigationPropertyDescription();
    const value = {
      valueFormat: PropertyValueFormat.Primitive,
      value: { id: "1", className: "TestSchema:TargetClass" },
      displayValue: "1",
    };
    const propertyRecord = new PropertyRecord(value as PropertyValue, propertyDescription);
    const initialProps: NavigationPropertyTargetSelectorProps = {
      imodel: testImodel,
      getNavigationPropertyInfo: async () => testNavigationPropertyInfo,
      propertyRecord,
    };

    const items: Item[] = [];
    for (let i = 1; i <= VALUE_BATCH_SIZE; i++) {
      items.push(
        createTestContentItem({
          label: LabelDefinition.fromLabelString(`1${i.toString()}`),
          primaryKeys: [{ id: "1", className: "TestSchema:TargetClass" }],
          displayValues: {},
          values: {},
        }),
      );
    }

    getContentStub.callsFake(async () => new Content(createTestContentDescriptor({ fields: [], categories: [] }), items));

    const { getByPlaceholderText, user } = render(<NavigationPropertyTargetSelector {...initialProps} />);
    await waitFor(() => {
      expect(getContentStub.calledOnce);
    });

    const combobox = await waitFor(() => getByPlaceholderText("navigation-property-editor.select-target-instance"));
    await user.click(combobox);
    await user.clear(combobox);
    await user.type(combobox, "1");

    await waitFor(() => {
      expect(getContentStub.calledOnce);
    });
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
    const { getByDisplayValue, getByRole, queryByText, user, getByText } = render(<NavigationPropertyTargetSelector {...initialProps} />);

    const inputContainer = await waitFor(() => getByRole("combobox"));

    await user.click(inputContainer);
    await user.type(inputContainer, "E", { skipClick: true });
    // Check if input's cursor is at the start of the text after pressing `Home`.
    await user.keyboard("{Home}");
    await user.type(inputContainer, "H", { skipClick: true });
    await waitFor(() => getByDisplayValue("HE"));
    // position cursor before last character.
    await user.keyboard("{End}{ArrowLeft}");
    // Check if pressing `Space` does not invoke default `react-select` behavior.
    await user.type(inputContainer, " ", { skipClick: true });
    await waitFor(() => getByDisplayValue("H E"));
    // Check if the menu is closed after the `tab` key was pressed.
    await user.keyboard("{Tab}");
    await waitFor(() => expect(queryByText(contentItem.label.displayValue)).to.be.null);
    await user.click(inputContainer);
    // Check if it's possible to type after option is selected and menu is opened again
    await user.keyboard("{Enter}");
    await waitFor(() => getByText(contentItem.label.displayValue));
  });
});
