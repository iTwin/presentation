/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from "vitest";
import {
  ArrayValue,
  PropertyDescription,
  PropertyRecord,
  StandardTypeNames,
  StructValue,
  PropertyValueFormat as UiPropertyValueFormat,
} from "@itwin/appui-abstract";
import { createContentTraverser, EnumerationInfo, PropertyValueFormat } from "@itwin/presentation-common";
import { PropertyValueConstraints, WithConstraints } from "../../presentation-components/common/ContentBuilder.js";
import { PropertyRecordsBuilder } from "../../presentation-components/common/PropertyRecordsBuilder.js";
import { NumericEditorName } from "../../presentation-components/properties/editors/NumericPropertyEditor.js";
import { QuantityEditorName } from "../../presentation-components/properties/editors/QuantityPropertyEditor.js";
import { createTestECClassInfo, createTestECInstanceKey, createTestPropertyInfo } from "../_helpers/Common.js";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestContentItem,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../_helpers/Content.js";
import { createTestLabelDefinition } from "../_helpers/LabelDefinition.js";

class TestPropertyRecordsBuilder extends PropertyRecordsBuilder {
  public entries: Array<PropertyRecord> = [];
  public constructor() {
    super((record) => {
      this.entries.push(record);
    });
  }
}

describe("PropertyRecordsBuilder", () => {
  let builder: TestPropertyRecordsBuilder;

  beforeEach(() => {
    builder = new TestPropertyRecordsBuilder();
  });

  it("sets enum props", () => {
    const enumerationInfo: EnumerationInfo = { choices: [{ value: 1, label: "One" }], isStrict: true };
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ enumerationInfo }) }] }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.enum).toEqual(enumerationInfo);
  });

  it("sets constraints props for `string` type", () => {
    const constraints: PropertyValueConstraints = { minimumLength: 1, maximumLength: 15 };
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ constraints }) }] }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    const property: WithConstraints<PropertyDescription> = builder.entries[0].property;
    expect(property.constraints).toEqual(constraints);
  });

  it("sets constraints props for numeric type", () => {
    const constraints: PropertyValueConstraints = { minimumValue: 1, maximumValue: 15 };
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ constraints }) }] }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    const property: WithConstraints<PropertyDescription> = builder.entries[0].property;
    expect(property.constraints).toEqual(constraints);
  });

  it("sets constraints props for `array` type", () => {
    const constraints: PropertyValueConstraints = { minOccurs: 1, maxOccurs: 15 };
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ constraints }) }] }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    const property: WithConstraints<PropertyDescription> = builder.entries[0].property;
    expect(property.constraints).toEqual(constraints);
  });

  it("sets extended data", () => {
    const descriptor = createTestContentDescriptor({ fields: [createTestSimpleContentField()] });
    const extendedData = { test: 123 };
    const item = createTestContentItem({ values: {}, displayValues: {}, extendedData });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].extendedData).toEqual(extendedData);
  });

  it("sets `autoExpand` flag for nested content field based property records", () => {
    const category = createTestCategoryDescription();
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestNestedContentField({
          name: "parent",
          category,
          autoExpand: true,
          nestedFields: [createTestSimpleContentField({ name: "child", category })],
        }),
      ],
    });
    const item = createTestContentItem({
      values: {
        parent: [
          {
            primaryKeys: [createTestECInstanceKey()],
            values: { child: "value" },
            displayValues: { child: "display value" },
            mergedFieldNames: [],
          },
        ],
      },
      displayValues: {},
    });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    const record = builder.entries[0];
    expect(record.autoExpand).toBe(true);
    expect((record.value as ArrayValue).items[0].autoExpand).toBe(true);
    expect(((record.value as ArrayValue).items[0].value as StructValue).members.child.autoExpand).toBeUndefined();
  });

  it("sets custom `renderer`", () => {
    const descriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField({ renderer: { name: "custom-renderer" } })],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.renderer).toEqual({ name: "custom-renderer" });
  });

  it("sets custom `editor`", () => {
    const descriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField({ editor: { name: "custom-editor" } })],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.editor).toEqual({ name: "custom-editor" });
  });

  it("sets editor name when field typeName is Number", () => {
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestSimpleContentField({
          type: { valueFormat: PropertyValueFormat.Primitive, typeName: StandardTypeNames.Number },
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.editor).toEqual({ name: NumericEditorName });
  });

  it("does not override custom editor when field typeName is Number", () => {
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestSimpleContentField({
          type: { valueFormat: PropertyValueFormat.Primitive, typeName: StandardTypeNames.Number },
          editor: { name: "custom-editor" },
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.editor).toEqual({ name: "custom-editor" });
  });

  it("sets quantity type", () => {
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          properties: [
            {
              property: {
                classInfo: createTestECClassInfo(),
                name: "test-props",
                type: "string",
                kindOfQuantity: { label: "KOQ Label", name: "testKOQ", persistenceUnit: "testUnit" },
              },
            },
          ],
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.kindOfQuantityName).toBe("testKOQ");
  });

  it("sets editor name when field has kind of quantity", () => {
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          properties: [
            {
              property: {
                classInfo: createTestECClassInfo(),
                name: "test-props",
                type: "string",
                kindOfQuantity: { label: "KOQ Label", name: "testKOQ", persistenceUnit: "testUnit" },
              },
            },
          ],
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.kindOfQuantityName).toBe("testKOQ");
    expect(builder.entries[0].property.editor?.name).toBe(QuantityEditorName);
  });

  it("does not override custom editor when field has kind of quantity", () => {
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          properties: [
            {
              property: {
                classInfo: createTestECClassInfo(),
                name: "test-props",
                type: "string",
                kindOfQuantity: { label: "KOQ Label", name: "testKOQ", persistenceUnit: "testUnit" },
              },
            },
          ],
          editor: { name: "custom-editor" },
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.kindOfQuantityName).toBe("testKOQ");
    expect(builder.entries[0].property.editor?.name).toBe("custom-editor");
  });

  it("creates merged property record", () => {
    const fieldName = "test-field;";
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          name: fieldName,
          properties: [{ property: { classInfo: createTestECClassInfo(), name: "test-props", type: "string" } }],
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {}, mergedFieldNames: [fieldName] });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].property.name).toBe(fieldName);
    expect(builder.entries[0].isMerged).toBe(true);
    expect(builder.entries[0].value).toEqual({ valueFormat: UiPropertyValueFormat.Primitive });
  });

  it("creates merged property record with quantity editor when field has kind of quantity", () => {
    const fieldName = "test-field";
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          name: fieldName,
          properties: [
            {
              property: {
                classInfo: createTestECClassInfo(),
                name: "test-props",
                type: "double",
                kindOfQuantity: { label: "Length", name: "testKOQ", persistenceUnit: "m" },
              },
            },
          ],
        }),
      ],
    });
    const item = createTestContentItem({
      values: {},
      displayValues: { [fieldName]: "-- m" },
      mergedFieldNames: [fieldName],
    });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(builder.entries[0].isMerged).toBe(true);
    expect(builder.entries[0].property.editor?.name).toBe(QuantityEditorName);
    expect(builder.entries[0].property.kindOfQuantityName).toBe("testKOQ");
    expect(builder.entries[0].value).toEqual({ valueFormat: UiPropertyValueFormat.Primitive, displayValue: "-- m" });
  });

  it("sorts struct properties", () => {
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestSimpleContentField({
          name: "members",
          label: "members",
          type: {
            valueFormat: PropertyValueFormat.Struct,
            typeName: StandardTypeNames.Struct,
            members: [
              {
                name: "member3",
                label: "memberC",
                type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
              },
              {
                name: "member1",
                label: "memberA",
                type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
              },
              {
                name: "member2",
                label: "memberB",
                type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
              },
            ],
          },
        }),
      ],
    });
    const item = createTestContentItem({
      values: { members: { member3: "value 3", member1: "value 1", member2: "value 2" } },
      displayValues: {
        members: { member3: "display value 3", member1: "display value 1", member2: "display value 2" },
      },
    });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect(Object.keys((builder.entries[0].value as StructValue).members)).toEqual(["member1", "member2", "member3"]);
  });

  it("passes nested content value labels to property records", () => {
    const labelDefinition = createTestLabelDefinition();
    const category = createTestCategoryDescription();
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestNestedContentField({
          name: "parent",
          category,
          autoExpand: true,
          nestedFields: [createTestSimpleContentField({ name: "child", category })],
        }),
      ],
    });
    const item = createTestContentItem({
      values: {
        parent: [
          {
            primaryKeys: [createTestECInstanceKey()],
            values: { child: "value" },
            displayValues: { child: "display value" },
            mergedFieldNames: [],
            labelDefinition,
          },
        ],
      },
      displayValues: {},
    });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect((builder.entries[0].value as ArrayValue).items[0].description).toBe(labelDefinition.displayValue);
  });

  it("replaces unspecified nested content value label with `undefined`", () => {
    const LABEL_NOT_SPECIFIED = "@Presentation:label.notSpecified@";
    const labelDefinition = createTestLabelDefinition({ displayValue: LABEL_NOT_SPECIFIED });
    const category = createTestCategoryDescription();
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestNestedContentField({
          name: "parent",
          category,
          autoExpand: true,
          nestedFields: [createTestSimpleContentField({ name: "child", category })],
        }),
      ],
    });
    const item = createTestContentItem({
      values: {
        parent: [
          {
            primaryKeys: [createTestECInstanceKey()],
            values: { child: "value" },
            displayValues: { child: "display value" },
            mergedFieldNames: [],
            labelDefinition,
          },
        ],
      },
      displayValues: {},
    });
    createContentTraverser(builder)(descriptor, [item]);
    expect(builder.entries).toHaveLength(1);
    expect((builder.entries[0].value as ArrayValue).items[0].description).toBeUndefined();
  });
});
