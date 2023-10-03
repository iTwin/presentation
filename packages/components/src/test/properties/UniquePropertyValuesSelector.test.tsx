/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import {
  ContentInstancesOfSpecificClassesSpecification,
  ContentRule,
  MultiSchemaClassesSpecification,
  RelatedClassInfo,
  Ruleset,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import { translate } from "../../presentation-components/common/Utils";
import { UniquePropertyValuesSelector } from "../../presentation-components/properties/UniquePropertyValuesSelector";
import { createTestECClassInfo, createTestPropertyInfo, createTestRelatedClassInfo, createTestRelationshipPath, render } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../_helpers/Content";

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
    await waitFor(() => expect(container.querySelector(".iui-tag-label")?.innerHTML).to.include(translate("unique-values-property-editor.empty-value")));
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

    // assert that the row is loaded
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

    // assert that the row is loaded
    await waitFor(() => expect(container.querySelectorAll(".iui-menu-item").length).to.be.equal(1));
  });

  describe("Ruleset Creation", () => {
    const getSchemaAndClassNameFromRuleset = (ruleset: Ruleset) => {
      expect(ruleset.rules.length).to.be.equal(1);
      const contentRule = ruleset.rules[0] as ContentRule;

      expect(contentRule.specifications.length).to.be.equal(1);
      const specifications = contentRule.specifications[0] as ContentInstancesOfSpecificClassesSpecification;
      const schemaAndClassNames = specifications.classes as MultiSchemaClassesSpecification;

      expect(schemaAndClassNames.classNames.length).to.be.equal(1);
      const className = schemaAndClassNames.classNames[0];
      const schemaName = schemaAndClassNames.schemaName;

      return [schemaName, className];
    };

    it("calls 'getPagedDistinctValues' with ruleset that is created from a 'NestedContentField'", async () => {
      const testProperty = {
        name: "#testField",
        displayLabel: "propertiesField",
        typename: "number",
      };

      const relationshipPath = createTestRelationshipPath();
      const lastStepOfRelationshipPath: RelatedClassInfo = createTestRelatedClassInfo({
        targetClassInfo: createTestECClassInfo({ name: "testSchema:testClass" }),
      });
      relationshipPath.push(lastStepOfRelationshipPath);

      // create the field that is checked and set its parent's pathToPrimaryClass
      const testField = createTestPropertiesContentField({ name: "testField", properties: [] });
      const parentField = createTestNestedContentField({ nestedFields: [testField], pathToPrimaryClass: relationshipPath });

      const testDescriptor = createTestContentDescriptor({
        fields: [testField, parentField],
      });

      const spy = sinon.spy(Presentation.presentation, "getPagedDistinctValues");

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      const [expectedSchemaName, expectedClassName] = lastStepOfRelationshipPath.targetClassInfo.name.split(":");
      const [actualSchemaName, actualClassName] = getSchemaAndClassNameFromRuleset(spy.firstCall.args[0].rulesetOrId as Ruleset);

      expect(actualSchemaName).to.be.equal(expectedSchemaName);
      expect(actualClassName).to.be.equal(expectedClassName);
    });

    it("calls 'getPagedDistinctValues' with ruleset that is created from a 'NestedContentField' with multiple layers of nesting", async () => {
      const testProperty = {
        name: "#testField",
        displayLabel: "propertiesField",
        typename: "number",
      };

      const relationshipPath = createTestRelationshipPath();
      const lastStepOfRelationshipPath: RelatedClassInfo = createTestRelatedClassInfo({
        targetClassInfo: createTestECClassInfo({ name: "testSchema:testClass" }),
      });
      relationshipPath.push(lastStepOfRelationshipPath);

      // create the field that is checked and set its 'grandparent' to contain the pathToPrimaryClass
      const testField = createTestPropertiesContentField({ name: "testField", properties: [] });
      const parentTestField = createTestNestedContentField({ nestedFields: [testField] });
      const grandParentField = createTestNestedContentField({ nestedFields: [parentTestField], pathToPrimaryClass: relationshipPath });

      const testDescriptor = createTestContentDescriptor({
        fields: [testField, parentTestField, grandParentField],
      });

      const spy = sinon.spy(Presentation.presentation, "getPagedDistinctValues");

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      const [expectedSchemaName, expectedClassName] = lastStepOfRelationshipPath.targetClassInfo.name.split(":");
      const [actualSchemaName, actualClassName] = getSchemaAndClassNameFromRuleset(spy.firstCall.args[0].rulesetOrId as Ruleset);

      expect(actualSchemaName).to.be.equal(expectedSchemaName);
      expect(actualClassName).to.be.equal(expectedClassName);
    });

    it("calls 'getPagedDistinctValues' with ruleset that is created from a 'PropertiesField'", async () => {
      const testProperty = {
        name: "#testField",
        displayLabel: "testField",
        typename: "number",
      };

      const testClassInfo = createTestECClassInfo({ name: "testSchema:testClass" });
      const testField = createTestPropertiesContentField({
        name: "testField",
        properties: [{ property: createTestPropertyInfo({ classInfo: testClassInfo }) }],
      });

      const testDescriptor = createTestContentDescriptor({
        fields: [testField],
      });

      const spy = sinon.spy(Presentation.presentation, "getPagedDistinctValues");

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      const [expectedSchemaName, expectedClassName] = testClassInfo.name.split(":");
      const [actualSchemaName, actualClassName] = getSchemaAndClassNameFromRuleset(spy.firstCall.args[0].rulesetOrId as Ruleset);

      expect(actualSchemaName).to.be.equal(expectedSchemaName);
      expect(actualClassName).to.be.equal(expectedClassName);
    });

    it("does not create ruleset when field is a 'NestedContentField' with no parent, thus 'getPagedDistinctValues' is not called", async () => {
      const testProperty = {
        name: "#testField",
        displayLabel: "testField",
        typename: "number",
      };

      const testDescriptor = createTestContentDescriptor({
        fields: [createTestNestedContentField({ name: "testField", nestedFields: [] })],
      });

      const spy = sinon.spy(Presentation.presentation, "getPagedDistinctValues");

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      expect(spy).to.not.be.called;
    });
  });
});
