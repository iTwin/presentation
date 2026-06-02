/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyDescription, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyFilterBuilderRuleRangeValue } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { Presentation } from "@itwin/presentation-frontend";
import {
  createInstanceFilterPropertyInfos,
  DEFAULT_ROOT_CATEGORY_NAME,
  filterRuleValidator,
} from "../../presentation-components/instance-filter-builder/Utils.js";
import { QuantityEditorName } from "../../presentation-components/properties/editors/EditorNames.js";
import { createTestECClassInfo } from "../_helpers/Common.js";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../_helpers/Content.js";

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
          properties: [
            {
              property: {
                classInfo: createTestECClassInfo(),
                name: "prop2",
                type: "number",
                kindOfQuantity: { label: "TestKoQ", name: "Test:KoQ", persistenceUnit: "u:M" },
              },
            },
          ],
          category: rootCategory,
        }),
      ],
    });

    const input = createInstanceFilterPropertyInfos(descriptor);
    // replace editor name with a placeholder in snapshot to avoid it changing everytime the test is run
    const expected = input.map((info) =>
      info.propertyDescription.editor?.name === QuantityEditorName
        ? {
            ...info,
            propertyDescription: {
              ...info.propertyDescription,
              editor: { name: "presentation-quantity-editor-{guid}" },
            },
          }
        : info,
    );
    expect(expected).toMatchSnapshot();
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
    expect(propertyInfos[0].categoryLabel).toBeUndefined();
  });

  it("creates property infos when fields are in different categories category", () => {
    const rootCategory = createTestCategoryDescription({ name: "root", label: "Root Category" });
    const nestedCategory1 = createTestCategoryDescription({
      name: "nested1",
      label: "Nested Category 1",
      parent: rootCategory,
    });
    const nestedCategory2 = createTestCategoryDescription({
      name: "nested2",
      label: "Nested Category 2",
      parent: rootCategory,
    });
    const nestedCategory21 = createTestCategoryDescription({
      name: "nested21",
      label: "Nested Category 2 1",
      parent: nestedCategory2,
    });
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
    expect(input).toMatchSnapshot();
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
    expect(input).toMatchSnapshot();
  });

  it("creates property info with nested field content class name", () => {
    const rootCategory = createTestCategoryDescription({ name: "root", label: "Root Category" });
    const propertyField = createTestPropertiesContentField({
      properties: [
        {
          property: { classInfo: createTestECClassInfo({ name: "Schema:PropClass " }), name: "prop1", type: "string" },
        },
      ],
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
    expect(input[0].className).toBe("Schema:RelatedClass");
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
    kindOfQuantityName: "TestKOQ",
    quantityType: "TestKOQ",
  };

  beforeEach(() => {
    vi.spyOn(Presentation, "localization", "get").mockReturnValue(new EmptyLocalization());
  });

  it("returns error message for invalid numeric rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: numericProperty,
        operator: "less",
        value: { valueFormat: PropertyValueFormat.Primitive, value: undefined, displayValue: "Invalid" },
      }),
    ).toBe("instance-filter-builder.error-messages.not-a-number");
  });

  it("does not return error message for invalid numeric value if operator is 'IsEqual' or 'IsNotEqual'", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: numericProperty,
        operator: "is-equal",
        value: { valueFormat: PropertyValueFormat.Primitive, value: "[Invalid]", displayValue: "[Invalid]" },
      }),
    ).toBeUndefined();
  });

  it("returns error message for invalid quantity rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: quantityProperty,
        operator: "less",
        value: { valueFormat: PropertyValueFormat.Primitive, value: undefined, displayValue: "Invalid" },
      }),
    ).toBe("instance-filter-builder.error-messages.invalid");
  });

  it("returns error message for invalid from quantity value in between rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: quantityProperty,
        operator: "between",
        value: PropertyFilterBuilderRuleRangeValue.serialize({
          from: { valueFormat: PropertyValueFormat.Primitive, value: undefined, displayValue: "Invalid" },
          to: { valueFormat: PropertyValueFormat.Primitive, value: 123, displayValue: "123 unit" },
        }),
      }),
    ).toBe("instance-filter-builder.error-messages.invalid");
  });

  it("returns error message for invalid to quantity value in between rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: quantityProperty,
        operator: "between",
        value: PropertyFilterBuilderRuleRangeValue.serialize({
          from: { valueFormat: PropertyValueFormat.Primitive, value: 123, displayValue: "123 unit" },
          to: { valueFormat: PropertyValueFormat.Primitive, value: undefined, displayValue: "Invalid" },
        }),
      }),
    ).toBe("instance-filter-builder.error-messages.invalid");
  });

  it("does not return error message for valid numeric rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: numericProperty,
        operator: "greater",
        value: { valueFormat: PropertyValueFormat.Primitive, value: 10, displayValue: "10" },
      }),
    ).toBeUndefined();
  });

  it("does not return error message for valid quantity rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: quantityProperty,
        operator: "less",
        value: { valueFormat: PropertyValueFormat.Primitive, value: 10, displayValue: "10 unit" },
      }),
    ).toBeUndefined();
  });

  it("does not return error message for valid quantity value in between rule", () => {
    expect(
      filterRuleValidator({
        id: "test-id",
        groupId: "test-group-id",
        property: quantityProperty,
        operator: "between",
        value: PropertyFilterBuilderRuleRangeValue.serialize({
          from: { valueFormat: PropertyValueFormat.Primitive, value: 123, displayValue: "123 unit" },
          to: { valueFormat: PropertyValueFormat.Primitive, value: 456, displayValue: "456 unit" },
        }),
      }),
    ).toBeUndefined();
  });
});
