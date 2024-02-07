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
  combineFieldNames,
  ContentInstancesOfSpecificClassesSpecification,
  ContentRule,
  KeySet,
  MultiSchemaClassesSpecification,
  RelatedClassInfo,
  Ruleset,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { serializeUniqueValues, UniqueValue } from "../../../presentation-components/common/Utils";
import { UniquePropertyValuesSelector } from "../../../presentation-components/properties/inputs/UniquePropertyValuesSelector";
import { createTestECClassInfo, createTestPropertyInfo, createTestRelatedClassInfo, createTestRelationshipPath } from "../../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../../_helpers/Content";
import { createTestECInstancesNodeKey } from "../../_helpers/Hierarchy";
import { render, waitFor } from "../../TestUtils";

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

  const convertToPropertyValue = (uniqueValue: UniqueValue[]): PropertyValue => {
    const { displayValues, groupedRawValues } = serializeUniqueValues(uniqueValue);

    return {
      valueFormat: PropertyValueFormat.Primitive,
      displayValue: displayValues,
      value: groupedRawValues,
    };
  };

  const testImodel = {} as IModelConnection;

  it("invokes `onChange` when item from the menu is selected", async () => {
    const spy = sinon.spy();

    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });

    const { getByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={spy} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(selector);

    // click on menu item
    const menuItem = await waitFor(() => getByText("TestValue1"));
    await user.click(menuItem);

    const expectedValue = convertToPropertyValue([
      {
        displayValue: "TestValue1",
        groupedRawValues: ["TestValue1"],
      },
    ]);
    expect(spy).to.be.calledWith(expectedValue);
  });

  it("invokes `onChange` with multiple values when additional item is selected", async () => {
    const spy = sinon.spy();

    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });

    const initialValue = convertToPropertyValue([
      {
        displayValue: "TestValue2",
        groupedRawValues: ["TestValue2"],
      },
    ]);

    const { getByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={spy} imodel={testImodel} descriptor={descriptor} value={initialValue} />,
    );

    // open menu
    const selector = await waitFor(() => getByText("TestValue2"));
    await user.click(selector);

    // click on first menu item
    const menuItem = await waitFor(() => getByText("TestValue1"));
    await user.click(menuItem);

    const expectedValue = convertToPropertyValue([
      {
        displayValue: "TestValue2",
        groupedRawValues: ["TestValue2"],
      },
      {
        displayValue: "TestValue1",
        groupedRawValues: ["TestValue1"],
      },
    ]);
    expect(spy).to.be.calledWith(expectedValue);
  });

  it("invokes `onChange` when item from the menu is deselected", async () => {
    const spy = sinon.spy();

    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });

    const initialValue = convertToPropertyValue([
      {
        displayValue: "TestValue1",
        groupedRawValues: ["TestValue1"],
      },
      {
        displayValue: "TestValue2",
        groupedRawValues: ["TestValue2"],
      },
    ]);

    const { getByText, getAllByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={spy} imodel={testImodel} descriptor={descriptor} value={initialValue} />,
    );

    // open menu
    const selector = await waitFor(() => getByText("TestValue2"));
    await user.click(selector);

    // click on menu item
    const menuItem = await waitFor(() => getAllByText("TestValue2"));
    // first shown in selector, second in dropdown menu
    expect(menuItem).to.have.lengthOf(2);
    await user.click(menuItem[1]);

    const expectedValue = convertToPropertyValue([
      {
        displayValue: "TestValue1",
        groupedRawValues: ["TestValue1"],
      },
    ]);
    expect(spy).to.be.calledWith(expectedValue);
  });

  it("invokes `onChange` when selected items are cleared", async () => {
    const spy = sinon.spy();

    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 2,
      items: [
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ],
    });

    const initialValue = convertToPropertyValue([
      {
        displayValue: "TestValue2",
        groupedRawValues: ["TestValue2"],
      },
    ]);

    const { container, queryByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={spy} imodel={testImodel} descriptor={descriptor} value={initialValue} />,
    );

    // make sure value is selected
    await waitFor(() => {
      expect(queryByText("TestValue2")).to.not.be.null;
    });

    // click on `clear` button
    const clearIndicator = await waitFor(() => {
      const indicators = container.querySelectorAll(".presentation-async-select-input-icon");
      // expect to have 2 indicators: "Clear" and "Open dropdown"
      expect(indicators.length).to.be.eq(2);
      return indicators[0];
    });
    await user.click(clearIndicator);

    await waitFor(() =>
      expect(spy).to.be.calledWith({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: undefined,
        value: undefined,
      }),
    );
  });

  it("menu shows `No values` message when there is no `fieldDescriptor`", async () => {
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

    expect(queryByText("unique-values-property-editor.no-values")).to.not.be.null;
  });

  it("sets provided value", () => {
    const value = convertToPropertyValue([
      {
        displayValue: "TestValue",
        groupedRawValues: ["TestValue"],
      },
    ]);

    const { queryByText } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} value={value} />,
    );

    expect(queryByText("TestValue")).to.not.be.null;
  });

  it("selects multiple provided values", () => {
    const value = convertToPropertyValue([
      {
        displayValue: "TestValue1",
        groupedRawValues: ["TestValue1"],
      },
      {
        displayValue: "TestValue2",
        groupedRawValues: ["TestValue2"],
      },
    ]);

    const { queryByText } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} value={value} />,
    );

    expect(queryByText("TestValue1")).to.not.be.null;
    expect(queryByText("TestValue2")).to.not.be.null;
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
    const initialValue = convertToPropertyValue([
      {
        displayValue: "",
        groupedRawValues: [""],
      },
    ]);
    const { queryByText } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} value={initialValue} />,
    );
    await waitFor(() => {
      expect(queryByText("unique-values-property-editor.empty-value")).to.not.be.null;
    });
  });

  it("does not load a row with undefined values", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: undefined, groupedRawValues: [undefined] }],
    });

    const { queryByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    await waitFor(() => {
      expect(queryByText("unique-values-property-editor.no-values")).to.not.be.null;
    });
  });

  it("does not load a row with a displayLabel but no defined groupedRawValues", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: "TestValue", groupedRawValues: [undefined] }],
    });

    const { queryByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    await waitFor(() => {
      expect(queryByText("unique-values-property-editor.no-values")).to.not.be.null;
    });
  });

  it("loads row with empty string as displayValue and sets it to an 'Empty Value' string", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: "", groupedRawValues: [""] }],
    });

    const { queryByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    // assert that the row is loaded
    await waitFor(() => {
      expect(queryByText("unique-values-property-editor.empty-value")).to.not.be.null;
    });
  });

  it("loads row even if one of the groupedRawValues is undefined ", async () => {
    sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
      total: 1,
      items: [{ displayValue: "TestValue", groupedRawValues: [undefined, ""] }],
    });

    const { queryByText, user } = render(
      <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
    );

    // open menu
    const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
    await user.click(selector!);

    // assert that the row is loaded
    await waitFor(() => {
      expect(queryByText("TestValue")).to.not.be.null;
    });
  });

  describe("Date formatting", () => {
    it(`displays date in valid format when typename is 'shortDate'`, async () => {
      sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
        total: 1,
        items: [{ displayValue: "1410-07-15", groupedRawValues: [""] }],
      });
      const datePropertyDescription = {
        name: "#propertyName",
        displayLabel: "property",
        typename: "shortDate",
        editor: undefined,
      };

      const { queryByText, getByText, user } = render(
        <UniquePropertyValuesSelector property={datePropertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      );

      // open menu
      const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
      await user.click(selector);

      // assert that row is displayed correctly
      await waitFor(() => {
        expect(queryByText(new Date("1410-07-15").toLocaleDateString())).to.not.be.null;
      });
    });

    it(`displays empty value string when typename is 'dateTime' but date is set as empty string`, async () => {
      sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
        total: 1,
        items: [{ displayValue: "", groupedRawValues: [""] }],
      });
      const datePropertyDescription = {
        name: "#propertyName",
        displayLabel: "property",
        typename: "dateTime",
        editor: undefined,
      };

      const { queryByText, getByText, user } = render(
        <UniquePropertyValuesSelector property={datePropertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      );

      // open menu
      const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
      await user.click(selector);

      // assert that row is displayed correctly
      await waitFor(() => {
        expect(queryByText("unique-values-property-editor.empty-value")).to.not.be.null;
      });
    });

    it(`displays date in valid format when typename is 'dateTime'`, async () => {
      sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
        total: 1,
        items: [{ displayValue: "1410-07-15T12:34:00Z", groupedRawValues: [""] }],
      });
      const datePropertyDescription = {
        name: "#propertyName",
        displayLabel: "property",
        typename: "dateTime",
        editor: undefined,
      };

      const { queryByText, getByText, user } = render(
        <UniquePropertyValuesSelector property={datePropertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      );

      // open menu
      const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
      await user.click(selector);

      await waitFor(() => {
        expect(queryByText(new Date("1410-07-15T12:34:00Z").toLocaleString())).to.not.be.null;
      });
    });
  });

  describe("Date formatting", () => {
    it(`displays date in valid format when typename is 'shortDate'`, async () => {
      sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
        total: 1,
        items: [{ displayValue: "1410-07-15", groupedRawValues: [""] }],
      });
      const datePropertyDescription = {
        name: "#propertyName",
        displayLabel: "property",
        typename: "shortDate",
        editor: undefined,
      };

      const { queryByText, getByText, user } = render(
        <UniquePropertyValuesSelector property={datePropertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      );

      // open menu
      const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
      await user.click(selector);

      // assert that row is displayed correctly
      await waitFor(() => {
        expect(queryByText(new Date("1410-07-15").toLocaleDateString())).to.not.be.null;
      });
    });

    it(`displays empty value string when typename is 'dateTime' but date is set as empty string`, async () => {
      sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
        total: 1,
        items: [{ displayValue: "", groupedRawValues: [""] }],
      });
      const datePropertyDescription = {
        name: "#propertyName",
        displayLabel: "property",
        typename: "dateTime",
        editor: undefined,
      };

      const { queryByText, getByText, user } = render(
        <UniquePropertyValuesSelector property={datePropertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      );

      // open menu
      const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
      await user.click(selector);

      // assert that row is displayed correctly
      await waitFor(() => {
        expect(queryByText("unique-values-property-editor.empty-value")).to.not.be.null;
      });
    });

    it(`displays date in valid format when typename is 'dateTime'`, async () => {
      sinon.stub(Presentation.presentation, "getPagedDistinctValues").resolves({
        total: 1,
        items: [{ displayValue: "1410-07-15T12:34:00Z", groupedRawValues: [""] }],
      });
      const datePropertyDescription = {
        name: "#propertyName",
        displayLabel: "property",
        typename: "dateTime",
        editor: undefined,
      };

      const { queryByText, getByText, user } = render(
        <UniquePropertyValuesSelector property={datePropertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      );

      // open menu
      const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
      await user.click(selector);

      await waitFor(() => {
        expect(queryByText(new Date("1410-07-15T12:34:00Z").toLocaleString())).to.not.be.null;
      });
    });
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

    it("calls 'getPagedDistinctValues' with a ruleset that is supplied by the descriptor", async () => {
      const testProperty = {
        name: "#testField",
        displayLabel: "propertiesField",
        typename: "number",
      };
      const descriptorInputKeys = createTestECInstancesNodeKey();
      const testDescriptor = createTestContentDescriptor({
        fields: [createTestPropertiesContentField({ name: "testField", properties: [] })],
        ruleset: { id: "TestRuleset", rules: [] },
      });

      const spy = sinon.spy(Presentation.presentation, "getPagedDistinctValues");

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector
          property={testProperty}
          onChange={() => {}}
          imodel={testImodel}
          descriptor={testDescriptor}
          descriptorInputKeys={[descriptorInputKeys]}
        />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      const getPagedDistinctValuesCallArguments = spy.firstCall.args[0];
      const ruleset = getPagedDistinctValuesCallArguments.rulesetOrId as Ruleset;
      const expectedKeySet = new KeySet([descriptorInputKeys]);

      expect(ruleset.id).to.be.equal(testDescriptor.ruleset?.id);
      expect(getPagedDistinctValuesCallArguments.keys.nodeKeys).to.be.deep.equal(expectedKeySet.nodeKeys);
    });

    it("calls 'getPagedDistinctValues' with ruleset that is created from a 'NestedContentField'", async () => {
      const testProperty = {
        name: `#${combineFieldNames("testField", "parentField")}`,
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
      const parentField = createTestNestedContentField({ name: "parentField", nestedFields: [testField], pathToPrimaryClass: relationshipPath });

      const testDescriptor = createTestContentDescriptor({
        fields: [parentField],
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
        name: `#${combineFieldNames("testField", `${combineFieldNames("parentField", "grandParentField")}`)}`,
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
      const parentTestField = createTestNestedContentField({ name: "parentField", nestedFields: [testField] });
      const grandParentField = createTestNestedContentField({
        name: "grandParentField",
        nestedFields: [parentTestField],
        pathToPrimaryClass: relationshipPath,
      });

      const testDescriptor = createTestContentDescriptor({
        fields: [grandParentField],
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
