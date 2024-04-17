/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import { PropsWithChildren, useState } from "react";
import sinon from "sinon";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { omit } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { combineFieldNames, ContentInstancesOfSpecificClassesSpecification, ContentRule, KeySet, RelatedClassInfo, Ruleset } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { PortalTargetContextProvider } from "../../../presentation-components/common/PortalTargetContext";
import { serializeUniqueValues, UniqueValue } from "../../../presentation-components/common/Utils";
import {
  UNIQUE_PROPERTY_VALUES_BATCH_SIZE,
  UniquePropertyValuesSelector,
} from "../../../presentation-components/properties/inputs/UniquePropertyValuesSelector";
import { createTestECClassInfo, createTestPropertyInfo, createTestRelatedClassInfo, createTestRelationshipPath } from "../../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../../_helpers/Content";
import { createTestECInstancesNodeKey } from "../../_helpers/Hierarchy";
import { render, waitFor } from "../../TestUtils";

function TestComponentWithPortalTarget({ children }: PropsWithChildren) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  return (
    <div ref={setPortalTarget}>
      <PortalTargetContextProvider portalTarget={portalTarget}>{children}</PortalTargetContextProvider>
    </div>
  );
}

describe("UniquePropertyValuesSelector", () => {
  let presentationManagerStub: sinon.SinonStub;
  const getDistinctValuesIteratorStub = sinon.stub<
    Parameters<PresentationManager["getDistinctValuesIterator"]>,
    ReturnType<PresentationManager["getDistinctValuesIterator"]>
  >();

  beforeEach(async () => {
    window.innerHeight = 1000;
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
    presentationManagerStub = sinon.stub(Presentation, "presentation").get(() => ({
      getDistinctValuesIterator: getDistinctValuesIteratorStub,
    }));
  });

  afterEach(async () => {
    getDistinctValuesIteratorStub.reset();
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

  it("loads values using `getPagedDistinctValues` when `getDistinctValuesIterator` is not available", async () => {
    presentationManagerStub.resetBehavior();
    presentationManagerStub.get(() => ({
      getPagedDistinctValues: async () => ({
        total: 2,
        items: [
          { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
          { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
        ],
      }),
    }));

    const { getByText, user } = render(
      <TestComponentWithPortalTarget>
        <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      </TestComponentWithPortalTarget>,
    );

    // open menu
    const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(selector);

    // ensure both menu items are shown
    await waitFor(() => getByText("TestValue1"));
    await waitFor(() => getByText("TestValue2"));
  });

  it("opens menu upwards when not enough space below", async () => {
    window.innerHeight = 0;
    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
    });

    const { getByText, user } = render(
      <TestComponentWithPortalTarget>
        <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      </TestComponentWithPortalTarget>,
    );

    // open menu
    const selector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(selector);

    // click on menu item
    const menuItem1 = await waitFor(() => getByText("TestValue1"));
    const menuItem2 = await waitFor(() => getByText("TestValue2"));
    expect(menuItem1).to.not.be.null;
    expect(menuItem2).to.not.be.null;
  });

  it("invokes `onChange` when item from the menu is selected", async () => {
    const spy = sinon.spy();

    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
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

    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
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

    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
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

    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
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
    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "TestValue1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
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
    getDistinctValuesIteratorStub.resolves({
      total: 1,
      items: createAsyncIterator([{ displayValue: undefined, groupedRawValues: [undefined] }]),
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
    getDistinctValuesIteratorStub.resolves({
      total: 1,
      items: createAsyncIterator([{ displayValue: "TestValue", groupedRawValues: [undefined] }]),
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
    getDistinctValuesIteratorStub.resolves({
      total: 1,
      items: createAsyncIterator([{ displayValue: "", groupedRawValues: [""] }]),
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
    getDistinctValuesIteratorStub.resolves({
      total: 1,
      items: createAsyncIterator([{ displayValue: "TestValue", groupedRawValues: [undefined, ""] }]),
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

  it("filters values based on search input", async () => {
    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "Value1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
    });

    const { getByText, user, container } = render(
      <TestComponentWithPortalTarget>
        <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      </TestComponentWithPortalTarget>,
    );

    // open menu
    const menuSelector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(menuSelector);

    // type in search
    const searchSelector = await waitFor(() => container.querySelector(".presentation-async-select-values-container"));
    await user.type(searchSelector!, "test");

    // ensure only the searched for value is shown
    await waitFor(() => getByText("TestValue2"));
    expect(getDistinctValuesIteratorStub).to.be.calledOnce;
  });

  it("changes filter when search input changes", async () => {
    getDistinctValuesIteratorStub.resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "Value1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
    });

    const { getByText, user, container } = render(
      <TestComponentWithPortalTarget>
        <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      </TestComponentWithPortalTarget>,
    );

    // open menu
    const menuSelector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(menuSelector);

    // type in search
    const searchSelector = await waitFor(() => container.querySelector(".presentation-async-select-values-container"));
    await user.type(searchSelector!, "test");
    await waitFor(() => getByText("TestValue2"));

    // change search input
    await user.type(searchSelector!, "value1");

    // ensure new filter is applied
    await waitFor(() => getByText("Value1"));
    expect(getDistinctValuesIteratorStub).to.be.calledOnce;
  });

  it("resets loaded options when descriptor changes", async () => {
    getDistinctValuesIteratorStub.onCall(0).resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "Value1", groupedRawValues: ["TestValue1"] },
        { displayValue: "TestValue2", groupedRawValues: ["TestValue2"] },
      ]),
    });
    getDistinctValuesIteratorStub.onCall(1).resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "Value3", groupedRawValues: ["TestValue3"] },
        { displayValue: "TestValue4", groupedRawValues: ["TestValue4"] },
      ]),
    });

    const { getByText, user, container, rerender } = render(
      <TestComponentWithPortalTarget>
        <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      </TestComponentWithPortalTarget>,
    );

    // open menu
    let menuSelector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(menuSelector);

    // type in search
    const searchSelector = await waitFor(() => container.querySelector(".presentation-async-select-values-container"));
    await user.type(searchSelector!, "test");
    await waitFor(() => getByText("TestValue2"));

    const changedPropertyDescription = {
      name: "#propertyName",
      displayLabel: "propertiesField",
      typename: "string",
      editor: undefined,
    };

    rerender(
      <TestComponentWithPortalTarget>
        <UniquePropertyValuesSelector property={changedPropertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      </TestComponentWithPortalTarget>,
    );

    // close and reopen menu
    await user.click(menuSelector);
    menuSelector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(menuSelector);

    // ensure new filter is applied
    await waitFor(() => getByText("Value3"), { timeout: 2000 });
    await waitFor(() => getByText("TestValue4"));
    expect(getDistinctValuesIteratorStub).to.be.calledTwice;
  });

  it("applies filter to new pages", async () => {
    const pageItems = [
      { displayValue: "SearchedValue1", groupedRawValues: ["SearchedValue1"] },
      { displayValue: "SearchedValue2", groupedRawValues: ["SearchedValue2"] },
    ];

    for (let i = 2; i < UNIQUE_PROPERTY_VALUES_BATCH_SIZE; i++) {
      const name = `SkippedValue${i}`;
      pageItems.push({ displayValue: name, groupedRawValues: [name] });
    }

    getDistinctValuesIteratorStub.onCall(0).resolves({
      total: UNIQUE_PROPERTY_VALUES_BATCH_SIZE,
      items: createAsyncIterator(pageItems),
    });
    getDistinctValuesIteratorStub.onCall(1).resolves({
      total: 2,
      items: createAsyncIterator([
        { displayValue: "SkippedValue", groupedRawValues: ["SkippedValue"] },
        { displayValue: "SearchedValue3", groupedRawValues: ["SearchedValue3"] },
      ]),
    });

    const { getByText, user, container } = render(
      <TestComponentWithPortalTarget>
        <UniquePropertyValuesSelector property={propertyDescription} onChange={() => {}} imodel={testImodel} descriptor={descriptor} />,
      </TestComponentWithPortalTarget>,
    );

    // open menu
    const menuSelector = await waitFor(() => getByText("unique-values-property-editor.select-values"));
    await user.click(menuSelector);

    // type in search
    const searchSelector = await waitFor(() => container.querySelector(".presentation-async-select-values-container"));
    await user.type(searchSelector!, "Searched");

    // ensure both searched for values are shown
    await waitFor(() => getByText("SearchedValue1"));
    await waitFor(() => getByText("SearchedValue2"));
    await waitFor(() => getByText("SearchedValue3"));
    expect(getDistinctValuesIteratorStub).to.be.calledTwice;
  });

  describe("Date formatting", () => {
    it(`displays date in valid format when typename is 'shortDate'`, async () => {
      getDistinctValuesIteratorStub.resolves({
        total: 1,
        items: createAsyncIterator([{ displayValue: "1410-07-15", groupedRawValues: [""] }]),
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
      getDistinctValuesIteratorStub.resolves({
        total: 1,
        items: createAsyncIterator([{ displayValue: "", groupedRawValues: [""] }]),
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
      getDistinctValuesIteratorStub.resolves({
        total: 1,
        items: createAsyncIterator([{ displayValue: "1410-07-15T12:34:00Z", groupedRawValues: [""] }]),
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

  describe("Ruleset creation", () => {
    const getSchemaAndClassNamesFromRuleset = (ruleset: Ruleset) => {
      expect(ruleset.rules.length).to.be.equal(1);
      const contentRule = ruleset.rules[0] as ContentRule;

      expect(contentRule.specifications.length).to.be.equal(1);
      const specification = contentRule.specifications[0] as ContentInstancesOfSpecificClassesSpecification;

      if (Array.isArray(specification.classes)) {
        return specification.classes.map((msc) => omit(msc, ["arePolymorphic"]));
      }
      return omit(specification.classes, ["arePolymorphic"]);
    };

    it("calls 'getDistinctValuesIterator' with ruleset that is supplied by the descriptor", async () => {
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

      const getPagedDistinctValuesCallArguments = getDistinctValuesIteratorStub.firstCall.args[0];
      const ruleset = getPagedDistinctValuesCallArguments.rulesetOrId as Ruleset;
      const expectedKeySet = new KeySet([descriptorInputKeys]);

      expect(ruleset.id).to.be.equal(testDescriptor.ruleset?.id);
      expect(getPagedDistinctValuesCallArguments.keys.nodeKeys).to.be.deep.equal(expectedKeySet.nodeKeys);
    });

    it("calls 'getDistinctValuesIterator' with ruleset that is created from a 'NestedContentField'", async () => {
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

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      const [expectedSchemaName, expectedClassName] = lastStepOfRelationshipPath.targetClassInfo.name.split(":");
      expect(getSchemaAndClassNamesFromRuleset(getDistinctValuesIteratorStub.firstCall.args[0].rulesetOrId as Ruleset)).to.deep.eq({
        schemaName: expectedSchemaName,
        classNames: [expectedClassName],
      });
    });

    it("calls 'getDistinctValuesIterator' with ruleset that is created from a 'NestedContentField' with multiple layers of nesting", async () => {
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

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      const [expectedSchemaName, expectedClassName] = lastStepOfRelationshipPath.targetClassInfo.name.split(":");
      expect(getSchemaAndClassNamesFromRuleset(getDistinctValuesIteratorStub.firstCall.args[0].rulesetOrId as Ruleset)).to.deep.eq({
        schemaName: expectedSchemaName,
        classNames: [expectedClassName],
      });
    });

    it("calls 'getDistinctValuesIterator' with ruleset that is created from a 'PropertiesField' with a single property", async () => {
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

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      const [expectedSchemaName, expectedClassName] = testClassInfo.name.split(":");
      expect(getSchemaAndClassNamesFromRuleset(getDistinctValuesIteratorStub.firstCall.args[0].rulesetOrId as Ruleset)).to.deep.eq({
        schemaName: expectedSchemaName,
        classNames: [expectedClassName],
      });
    });

    it("calls 'getDistinctValuesIterator' with ruleset that is created from a 'PropertiesField' with multiple properties", async () => {
      const testProperty = {
        name: "#testField",
        displayLabel: "testField",
        typename: "number",
      };

      const testClassInfos = [
        createTestECClassInfo({ name: "testSchema1:testClass1" }),
        createTestECClassInfo({ name: "testSchema1:testClass2" }),
        createTestECClassInfo({ name: "testSchema2:testClass3" }),
        createTestECClassInfo({ name: "testSchema2:testClass3" }),
      ];
      const testField = createTestPropertiesContentField({
        name: "testField",
        properties: testClassInfos.map((c) => ({ property: createTestPropertyInfo({ classInfo: c }) })),
      });

      const testDescriptor = createTestContentDescriptor({
        fields: [testField],
      });

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      expect(getSchemaAndClassNamesFromRuleset(getDistinctValuesIteratorStub.firstCall.args[0].rulesetOrId as Ruleset)).to.deep.eq([
        {
          schemaName: "testSchema1",
          classNames: ["testClass1", "testClass2"],
        },
        {
          schemaName: "testSchema2",
          classNames: ["testClass3"],
        },
      ]);
    });

    it("does not create ruleset when field is a 'NestedContentField' with no parent, thus 'getDistinctValuesIterator' is not called", async () => {
      const testProperty = {
        name: "#testField",
        displayLabel: "testField",
        typename: "number",
      };

      const testDescriptor = createTestContentDescriptor({
        fields: [createTestNestedContentField({ name: "testField", nestedFields: [] })],
      });

      const { queryByText, user } = render(
        <UniquePropertyValuesSelector property={testProperty} onChange={() => {}} imodel={testImodel} descriptor={testDescriptor} />,
      );

      // trigger loadTargets function
      const selector = await waitFor(() => queryByText("unique-values-property-editor.select-values"));
      await user.click(selector!);

      expect(getDistinctValuesIteratorStub).to.not.be.called;
    });
  });
});
