/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyDescription, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyFilterRuleOperator } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { Descriptor, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { renderHook } from "@testing-library/react";
import {
  createInstanceFilterPropertyInfos,
  DEFAULT_ROOT_CATEGORY_NAME,
  filterRuleValidator,
  INSTANCE_FILTER_FIELD_SEPARATOR,
  useFilterBuilderNavigationPropertyEditorContext,
} from "../../presentation-components/instance-filter-builder/Utils";
import { createTestECClassInfo } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../_helpers/Content";

describe("createInstanceFilterPropertyInfos", () => {
  it("creates property infos when fields are in root category", () => {
    const rootCategory = createTestCategoryDescription({ name: "root", label: "Root Category" });
    const descriptor = createTestContentDescriptor({
      categories: [rootCategory],
      fields: [
        createTestPropertiesContentField({
          properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop1", type: "string" } }],
          category: rootCategory,
        }),
        createTestPropertiesContentField({
          properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop2", type: "number" } }],
          category: rootCategory,
        }),
      ],
    });

    const input = createInstanceFilterPropertyInfos(descriptor);
    expect(input).to.matchSnapshot();
  });

  it("creates property info with default root category name and does not assign a label to it", () => {
    const rootCategory = createTestCategoryDescription({ name: DEFAULT_ROOT_CATEGORY_NAME, label: "Root Category" });
    const descriptor = createTestContentDescriptor({
      categories: [rootCategory],
      fields: [
        createTestPropertiesContentField({
          properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop1", type: "string" } }],
          category: rootCategory,
        }),
      ],
    });

    const propertyInfos = createInstanceFilterPropertyInfos(descriptor);
    expect(propertyInfos[0].categoryLabel).to.be.undefined;
  });

  it("creates property infos when fields are in different categories category", () => {
    const rootCategory = createTestCategoryDescription({ name: "root", label: "Root Category" });
    const nestedCategory1 = createTestCategoryDescription({ name: "nested1", label: "Nested Category 1", parent: rootCategory });
    const nestedCategory2 = createTestCategoryDescription({ name: "nested2", label: "Nested Category 2", parent: rootCategory });
    const nestedCategory21 = createTestCategoryDescription({ name: "nested21", label: "Nested Category 2 1", parent: nestedCategory2 });
    const descriptor = createTestContentDescriptor({
      categories: [rootCategory, nestedCategory1, nestedCategory2, nestedCategory21],
      fields: [
        createTestPropertiesContentField({
          properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop1", type: "string" } }],
          category: nestedCategory1,
        }),
        createTestPropertiesContentField({
          properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop2", type: "number" } }],
          category: nestedCategory21,
        }),
      ],
    });

    const input = createInstanceFilterPropertyInfos(descriptor);
    expect(input).to.matchSnapshot();
  });

  it("creates property infos when property fields are in nested fields", () => {
    const rootCategory = createTestCategoryDescription({ name: "root", label: "Root Category" });
    const propertyField1 = createTestPropertiesContentField({
      properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop1", type: "string" } }],
      category: rootCategory,
    });
    const propertyField2 = createTestPropertiesContentField({
      properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop2", type: "number" } }],
      category: rootCategory,
    });

    const descriptor = createTestContentDescriptor({
      categories: [rootCategory],
      fields: [
        createTestNestedContentField({ nestedFields: [propertyField1], category: rootCategory }),
        createTestNestedContentField({ nestedFields: [propertyField2], category: rootCategory }),
      ],
    });

    const input = createInstanceFilterPropertyInfos(descriptor);
    expect(input).to.matchSnapshot();
  });

  it("creates property info with nested field content class name", () => {
    const rootCategory = createTestCategoryDescription({ name: "root", label: "Root Category" });
    const propertyField = createTestPropertiesContentField({
      properties: [{ property: { classInfo: createTestECClassInfo({ name: "Schema:PropClass " }), name: "prop1", type: "string" } }],
      category: rootCategory,
    });

    const descriptor = createTestContentDescriptor({
      categories: [rootCategory],
      fields: [
        createTestNestedContentField({
          nestedFields: [propertyField],
          category: rootCategory,
          contentClassInfo: createTestECClassInfo({ name: "Schema:RelatedClass" }),
        }),
      ],
    });

    const input = createInstanceFilterPropertyInfos(descriptor);
    expect(input[0].className).to.be.eq("Schema:RelatedClass");
  });
});

describe("filterRuleValidator", () => {
  const numericProperty: PropertyDescription = {
    displayLabel: "Numeric Prop",
    name: "numeric-prop",
    typename: StandardTypeNames.Double,
  };
  const quantityProperty: PropertyDescription = {
    displayLabel: "Quantity Prop",
    name: "quantity-prop",
    typename: StandardTypeNames.Double,
    quantityType: "TestKOQ",
  };

  before(() => {
    sinon.stub(Presentation, "localization").get(() => new EmptyLocalization());
  });

  after(() => {
    sinon.restore();
  });

  it("returns error message for invalid numeric rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: numericProperty,
        operator: PropertyFilterRuleOperator.IsEqual,
        value: {
          valueFormat: PropertyValueFormat.Primitive,
          value: undefined,
          displayValue: "Invalid",
        },
      }),
    ).to.be.eq("instance-filter-builder.error-messages.not-a-number");
  });

  it("returns error message for invalid quantity rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: quantityProperty,
        operator: PropertyFilterRuleOperator.IsEqual,
        value: {
          valueFormat: PropertyValueFormat.Primitive,
          value: undefined,
          displayValue: "Invalid",
        },
      }),
    ).to.be.eq("instance-filter-builder.error-messages.invalid");
  });

  it("does not return error message for valid numeric rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: numericProperty,
        operator: PropertyFilterRuleOperator.IsEqual,
        value: {
          valueFormat: PropertyValueFormat.Primitive,
          value: 10,
          displayValue: "10",
        },
      }),
    ).to.be.undefined;
  });

  it("does not return error message for valid quantity rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: quantityProperty,
        operator: PropertyFilterRuleOperator.IsEqual,
        value: {
          valueFormat: PropertyValueFormat.Primitive,
          value: 10,
          displayValue: "10 unit",
        },
      }),
    ).to.be.undefined;
  });
});

describe("useFilterBuilderNavigationPropertyEditorContext", () => {
  interface Props {
    imodel: IModelConnection;
    descriptor: Descriptor;
  }
  const testImodel = {} as IModelConnection;

  it("returns navigation property info", async () => {
    const navigationPropertyInfo: NavigationPropertyInfo = {
      classInfo: { id: "2", label: "Prop Class", name: "TestSchema:PropClass" },
      targetClassInfo: { id: "3", label: "Target Class", name: "TestSchema:TargetClass" },
      isForwardRelationship: true,
      isTargetPolymorphic: true,
    };
    const fieldName = "field_name";
    const testDescriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          name: fieldName,
          properties: [
            {
              property: {
                classInfo: { id: "1", label: "Field Class", name: "TestSchema:FieldClass" },
                name: "nav_prop",
                type: "navigation",
                navigationPropertyInfo,
              },
            },
          ],
        }),
      ],
    });
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: `test_category${INSTANCE_FILTER_FIELD_SEPARATOR}${fieldName}`,
      typename: "navigation",
    };

    const { result } = renderHook(({ imodel, descriptor }: Props) => useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor), {
      initialProps: { imodel: testImodel, descriptor: testDescriptor },
    });

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).to.be.deep.eq(navigationPropertyInfo);
  });

  it("returns `undefined` for non properties field", async () => {
    const fieldName = "field_name";
    const testDescriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField({ name: fieldName })],
    });
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: `test_category${INSTANCE_FILTER_FIELD_SEPARATOR}${fieldName}`,
      typename: "navigation",
    };

    const { result } = renderHook(({ imodel, descriptor }: Props) => useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor), {
      initialProps: { imodel: testImodel, descriptor: testDescriptor },
    });

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).to.be.undefined;
  });
});
