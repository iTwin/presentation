/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ArrayValue, PropertyRecord, StandardTypeNames, StructValue, PropertyValueFormat as UiPropertyValueFormat } from "@itwin/appui-abstract";
import { EnumerationInfo, PropertyValueFormat, traverseContentItem } from "@itwin/presentation-common";
import { PropertyRecordsBuilder } from "../../presentation-components/common/PropertyRecordsBuilder";
import { NumericEditorName } from "../../presentation-components/properties/editors/NumericPropertyEditor";
import { QuantityEditorName } from "../../presentation-components/properties/editors/QuantityPropertyEditor";
import { createTestECClassInfo, createTestECInstanceKey, createTestPropertyInfo } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestContentItem,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../_helpers/Content";

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
    const enumerationInfo: EnumerationInfo = {
      choices: [{ value: 1, label: "One" }],
      isStrict: true,
    };
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          properties: [
            {
              property: createTestPropertyInfo({ enumerationInfo }),
            },
          ],
        }),
      ],
    });
    const item = createTestContentItem({
      values: {},
      displayValues: {},
    });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.enum).to.deep.eq(enumerationInfo);
  });

  it("sets extended data", () => {
    const descriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField()],
    });
    const extendedData = {
      test: 123,
    };
    const item = createTestContentItem({
      values: {},
      displayValues: {},
      extendedData,
    });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].extendedData).to.deep.eq(extendedData);
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
            values: {
              child: "value",
            },
            displayValues: {
              child: "display value",
            },
            mergedFieldNames: [],
          },
        ],
      },
      displayValues: {},
    });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    const record = builder.entries[0];
    expect(record.autoExpand).to.be.true;
    expect((record.value as ArrayValue).items[0].autoExpand).to.be.true;
    expect(((record.value as ArrayValue).items[0].value as StructValue).members.child.autoExpand).to.be.undefined;
  });

  it("sets custom `renderer`", () => {
    const descriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField({ renderer: { name: "custom-renderer" } })],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.renderer).to.deep.eq({
      name: "custom-renderer",
    });
  });

  it("sets custom `editor`", () => {
    const descriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField({ editor: { name: "custom-editor" } })],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.editor).to.deep.eq({
      name: "custom-editor",
    });
  });

  it("sets editor name when field typeName is Number", () => {
    const descriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField({ type: { valueFormat: PropertyValueFormat.Primitive, typeName: StandardTypeNames.Number } })],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.editor).to.deep.eq({
      name: NumericEditorName,
    });
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
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.editor).to.deep.eq({
      name: "custom-editor",
    });
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
                kindOfQuantity: {
                  label: "KOQ Label",
                  name: "testKOQ",
                  persistenceUnit: "testUnit",
                },
              },
            },
          ],
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.quantityType).to.be.eq("testKOQ");
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
                kindOfQuantity: {
                  label: "KOQ Label",
                  name: "testKOQ",
                  persistenceUnit: "testUnit",
                },
              },
            },
          ],
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.quantityType).to.be.eq("testKOQ");
    expect(builder.entries[0].property.editor?.name).to.be.eq(QuantityEditorName);
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
                kindOfQuantity: {
                  label: "KOQ Label",
                  name: "testKOQ",
                  persistenceUnit: "testUnit",
                },
              },
            },
          ],
          editor: { name: "custom-editor" },
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {} });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.quantityType).to.be.eq("testKOQ");
    expect(builder.entries[0].property.editor?.name).to.be.eq("custom-editor");
  });

  it("creates merged property record", () => {
    const fieldName = "test-field;";
    const descriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          name: fieldName,
          properties: [
            {
              property: {
                classInfo: createTestECClassInfo(),
                name: "test-props",
                type: "string",
              },
            },
          ],
        }),
      ],
    });
    const item = createTestContentItem({ values: {}, displayValues: {}, mergedFieldNames: [fieldName] });
    traverseContentItem(builder, descriptor, item);
    expect(builder.entries.length).to.eq(1);
    expect(builder.entries[0].property.name).to.eq(fieldName);
    expect(builder.entries[0].isMerged).to.be.true;
    expect(builder.entries[0].isReadonly).to.be.true;
    expect(builder.entries[0].value).to.deep.eq({
      valueFormat: UiPropertyValueFormat.Primitive,
    });
  });
});
