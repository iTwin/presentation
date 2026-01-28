/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  insertExternalSourceAspect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertRepositoryLink,
  insertSpatialCategory,
} from "presentation-test-utilities";
import * as sinon from "sinon";
import { PropertyValueFormat } from "@itwin/appui-abstract";
import { assert } from "@itwin/core-bentley";
import { ArrayPropertiesField, combineFieldNames, KeySet, RuleTypes, StructPropertiesField } from "@itwin/presentation-common";
import { DEFAULT_PROPERTY_GRID_RULESET, PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";

import type { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValue } from "@itwin/appui-abstract";
import type { PropertyCategory } from "@itwin/components-react";
import type { InstanceKey, PropertiesField } from "@itwin/presentation-common";
import type { PresentationPropertyDataProviderProps } from "@itwin/presentation-components";

describe("PropertyDataProvider", async () => {
  before(async () => {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  const runTests = (configName: string, setup: (provider: PresentationPropertyDataProvider) => void) => {
    const createProvider = (props: PresentationPropertyDataProviderProps) => {
      const provider = new PresentationPropertyDataProvider(props);
      setup(provider);
      return provider;
    };

    describe(configName, () => {
      afterEach(() => {
        sinon.restore();
      });

      it("creates empty result when properties requested for 0 instances", async function () {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const imodel = await buildTestIModel(this, async (builder) => {
          insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        });
        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        provider.keys = new KeySet();
        const properties = await provider.getData();
        expect(properties.records).to.be.empty;
      });

      it("creates property data when given key with concrete class", async function () {
        let categoryKey: InstanceKey;
        let modelKey: InstanceKey;
        let elementKey: InstanceKey;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
          modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
          elementKey = insertPhysicalElement({
            builder,
            fullClassNameSeparator: ":",
            userLabel: "My Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
        });
        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        provider.keys = new KeySet([elementKey!]);
        const properties = await provider.getData();
        expect((properties.label.value as PrimitiveValue).displayValue).to.contain("My Element");
        validateRecords(properties.records["/selected-item/"], [
          {
            propName: "CodeValue",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: undefined,
              }),
          },
          {
            propName: "UserLabel",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: "My Element",
              }),
          },
          {
            propName: "Model",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: { id: modelKey.id },
              }),
          },
          {
            propName: "Category",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: { id: categoryKey.id },
              }),
          },
        ]);
      });

      it("creates property data when given key with base class", async function () {
        let categoryKey: InstanceKey;
        let modelKey: InstanceKey;
        let elementKey: InstanceKey;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
          modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
          elementKey = insertPhysicalElement({
            builder,
            fullClassNameSeparator: ":",
            userLabel: "My Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
        });
        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        provider.keys = new KeySet([{ className: "BisCore:Element", id: elementKey!.id }]);
        const properties = await provider.getData();
        expect((properties.label.value as PrimitiveValue).displayValue).to.contain("My Element");
        validateRecords(properties.records["/selected-item/"], [
          {
            propName: "CodeValue",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: undefined,
              }),
          },
          {
            propName: "UserLabel",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: "My Element",
              }),
          },
          {
            propName: "Model",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: { id: modelKey.id },
              }),
          },
          {
            propName: "Category",
            valueComparer: (value) =>
              expect(value).to.containSubset({
                valueFormat: PropertyValueFormat.Primitive,
                value: { id: categoryKey.id },
              }),
          },
        ]);
      });

      it("favorites properties", async function () {
        let categoryKey: InstanceKey;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        });
        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        sinon.stub(provider as any, "isFieldFavorite").returns(true);
        provider.keys = new KeySet([categoryKey!]);
        const properties = await provider.getData();
        const favoriteCategoryName = provider.isNestedPropertyCategoryGroupingEnabled ? "Favorite-/selected-item/" : "Favorite";
        validateRecords(properties.records["/selected-item/"], [
          {
            propName: "CodeValue",
          },
          {
            propName: "UserLabel",
          },
          {
            propName: "Model",
          },
        ]);
        validateRecords(properties.records[favoriteCategoryName], [
          {
            propName: "CodeValue",
          },
          {
            propName: "UserLabel",
          },
          {
            propName: "Model",
          },
        ]);
      });

      it("overrides default property category", async function () {
        let categoryKey: InstanceKey;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        });
        using provider = createProvider({
          imodel,
          ruleset: {
            ...DEFAULT_PROPERTY_GRID_RULESET,
            rules: [
              ...DEFAULT_PROPERTY_GRID_RULESET.rules,
              {
                ruleType: RuleTypes.DefaultPropertyCategoryOverride,
                specification: {
                  id: "default",
                  label: "Custom Category",
                  description: "Custom description",
                  autoExpand: true,
                },
              },
            ],
          },
        });
        provider.keys = new KeySet([categoryKey!]);
        const properties = await provider.getData();
        expect(properties.categories.find((category) => category.name === "default")?.label).to.be.eq("Custom Category");
        validateRecords(properties.records.default, [
          {
            propName: "CodeValue",
          },
          {
            propName: "UserLabel",
          },
          {
            propName: "Model",
          },
        ]);
      });

      it("finds root property record keys", async function () {
        let categoryKey: InstanceKey;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        });

        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        provider.keys = new KeySet([categoryKey!]);
        const properties = await provider.getData();

        const category = properties.categories.find((c) => c.name === "/selected-item/");
        expect(category).to.not.be.undefined;

        const record = properties.records[category!.name].find((r) => r.property.displayLabel === "Code");
        expect(record).to.not.be.undefined;

        const keys = await provider.getPropertyRecordInstanceKeys(record!);
        expect(keys).to.deep.eq([categoryKey!]);
      });

      it("finds nested property record keys", async function () {
        let elementKey: InstanceKey;
        let externalsSourceAspectKey: InstanceKey;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const imodel = await buildTestIModel(this, async (builder) => {
          const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
          const modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
          elementKey = insertPhysicalElement({
            builder,
            fullClassNameSeparator: ":",
            userLabel: "My Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
          const repositoryLinkKey = insertRepositoryLink({
            builder,
            fullClassNameSeparator: ":",
            repositoryUrl: "Repository URL",
            repositoryLabel: "Repository Label",
          });
          externalsSourceAspectKey = insertExternalSourceAspect({
            builder,
            fullClassNameSeparator: ":",
            elementId: elementKey.id,
            identifier: "My External Source Aspect",
            repositoryId: repositoryLinkKey.id,
          });
        });

        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        provider.keys = new KeySet([elementKey!]);
        const properties = await provider.getData();

        function findNestedCategory(categories: PropertyCategory[], name: string): PropertyCategory | undefined {
          for (const c of categories) {
            if (c.name === name) {
              return c;
            }

            const nested = findNestedCategory(c.childCategories ?? [], name);
            if (nested) {
              return nested;
            }
          }
          return undefined;
        }
        const category = findNestedCategory(properties.categories, "/selected-item/-source_information");
        expect(category).to.not.be.undefined;

        const record = properties.records[category!.name].find((r) => r.property.displayLabel === "Source Element ID");
        expect(record).to.not.be.undefined;

        const keys = await provider.getPropertyRecordInstanceKeys(record!);
        expect(keys).to.deep.eq([externalsSourceAspectKey!]);
      });
    });
  };

  runTests("with flat property categories", (provider) => (provider.isNestedPropertyCategoryGroupingEnabled = false));
  runTests("with nested property categories", (provider) => (provider.isNestedPropertyCategoryGroupingEnabled = true));

  it("finds array item & struct member fields", async function () {
    const { imodel, ...keys } = await buildIModel(this, async (builder, mochaContext) => {
      const schema = await importSchema(
        mochaContext,
        builder,
        `
          <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
          <ECStructClass typeName="TestStruct">
            <ECProperty propertyName="StringMember" typeName="string" />
            <ECProperty propertyName="NumericMember" typeName="int" />
          </ECStructClass>
          <ECEntityClass typeName="TestPhysicalObject">
            <BaseClass>bis:PhysicalElement</BaseClass>
            <ECArrayProperty propertyName="ArrayProperty" typeName="string" />
            <ECStructProperty propertyName="StructProperty" typeName="TestStruct" />
            <ECStructArrayProperty propertyName="StructArrayProperty" typeName="TestStruct" />
          </ECEntityClass>
        `,
      );
      const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
      const modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
      const elementKey = insertPhysicalElement({
        builder,
        classFullName: `${schema.schemaAlias}:TestPhysicalObject`,
        userLabel: "Test element",
        modelId: modelKey.id,
        categoryId: categoryKey.id,
        ArrayProperty: ["Item 1", "Item 2"],
        StructProperty: { StringMember: "Test string", NumericMember: 123 },
        StructArrayProperty: [
          { StringMember: "Item 1", NumericMember: 456 },
          { StringMember: "Item 2", NumericMember: 789 },
        ],
      });
      return { element: elementKey };
    });

    using provider = new PresentationPropertyDataProvider({ imodel });
    provider.keys = new KeySet([keys.element]);
    const properties = await provider.getData();

    // ensure we get what we expect
    validateRecords(properties.records["/selected-item/"], [
      {
        propName: "ArrayProperty",
        valueComparer: (value, property) => {
          assert(value.valueFormat === PropertyValueFormat.Array);
          expect(value.itemsTypeName).to.eq("string");
          expect(value.items)
            .to.have.lengthOf(2)
            .and.to.containSubset([
              { property: { name: combineFieldNames("[*]", property.name), typename: "string" }, value: { value: "Item 1" } },
              { property: { name: combineFieldNames("[*]", property.name), typename: "string" }, value: { value: "Item 2" } },
            ]);
        },
      },
      {
        propName: "StructProperty",
        valueComparer: (value, property) => {
          assert(value.valueFormat === PropertyValueFormat.Struct);
          expect(value.members).and.to.containSubset({
            StringMember: {
              property: { name: combineFieldNames("StringMember", property.name), typename: "string" },
              value: { value: "Test string" },
            },
            NumericMember: {
              property: { name: combineFieldNames("NumericMember", property.name), typename: "int" },
              value: { value: 123 },
            },
          });
        },
      },
      {
        propName: "StructArrayProperty",
        valueComparer: (value, property) => {
          assert(value.valueFormat === PropertyValueFormat.Array);
          expect(value.itemsTypeName).to.eq("TestStruct");
          expect(value.items)
            .to.have.lengthOf(2)
            .and.to.containSubset([
              {
                property: { name: combineFieldNames("[*]", property.name), typename: "TestStruct" },
                value: {
                  valueFormat: PropertyValueFormat.Struct,
                  members: {
                    StringMember: {
                      property: { name: combineFieldNames("StringMember", combineFieldNames("[*]", property.name)), typename: "string" },
                      value: { value: "Item 1" },
                    },
                    NumericMember: {
                      property: { name: combineFieldNames("NumericMember", combineFieldNames("[*]", property.name)), typename: "int" },
                      value: { value: 456 },
                    },
                  },
                },
              },
              {
                property: { name: combineFieldNames("[*]", property.name), typename: "TestStruct" },
                value: {
                  valueFormat: PropertyValueFormat.Struct,
                  members: {
                    StringMember: {
                      property: { name: combineFieldNames("StringMember", combineFieldNames("[*]", property.name)), typename: "string" },
                      value: { value: "Item 2" },
                    },
                    NumericMember: {
                      property: { name: combineFieldNames("NumericMember", combineFieldNames("[*]", property.name)), typename: "int" },
                      value: { value: 789 },
                    },
                  },
                },
              },
            ]);
        },
      },
    ]);

    // test retrieving array items field
    const arrayRecord = properties.records["/selected-item/"].find((r) => r.property.name.endsWith("ArrayProperty"));
    assert(arrayRecord?.value.valueFormat === PropertyValueFormat.Array);
    const arrayItemRecord = arrayRecord.value.items[0];
    const arrayItemField = (await provider.getFieldByPropertyDescription(arrayItemRecord.property)) as PropertiesField;
    expect(arrayItemField).to.containSubset({
      name: "[*]",
      label: "ArrayProperty",
    });
    expect(arrayItemField.parentArrayField)
      .to.be.instanceOf(ArrayPropertiesField)
      .and.to.containSubset({
        label: "ArrayProperty",
        type: {
          valueFormat: "Array",
          typeName: "string[]",
        },
      });

    // test retrieving struct member field
    const structRecord = properties.records["/selected-item/"].find((r) => r.property.name.endsWith("StructProperty"));
    assert(structRecord?.value.valueFormat === PropertyValueFormat.Struct);
    const structMemberRecord = structRecord.value.members.StringMember;
    const structMemberField = (await provider.getFieldByPropertyDescription(structMemberRecord.property)) as PropertiesField;
    expect(structMemberField).to.containSubset({
      name: "StringMember",
    });
    expect(structMemberField.parentStructField)
      .to.be.instanceOf(StructPropertiesField)
      .and.to.containSubset({
        label: "StructProperty",
        type: {
          valueFormat: "Struct",
          typeName: "TestStruct",
        },
      });

    // test retrieving struct array member field
    const structArrayRecord = properties.records["/selected-item/"].find((r) => r.property.name.endsWith("StructArrayProperty"));
    assert(structArrayRecord?.value.valueFormat === PropertyValueFormat.Array);
    const structArrayItemRecord = structArrayRecord.value.items[0];
    assert(structArrayItemRecord?.value.valueFormat === PropertyValueFormat.Struct);
    const structArrayItemMemberRecord = structArrayItemRecord.value.members.StringMember;
    const structArrayMemberField = (await provider.getFieldByPropertyDescription(structArrayItemMemberRecord.property)) as PropertiesField;
    expect(structArrayMemberField).to.containSubset({
      name: "StringMember",
    });
    expect(structArrayMemberField.parentStructField)
      .to.be.instanceOf(StructPropertiesField)
      .and.to.containSubset({
        label: "StructArrayProperty",
        type: {
          valueFormat: "Struct",
          typeName: "TestStruct",
        },
      });
    expect((structArrayMemberField.parentStructField as StructPropertiesField).parentArrayField)
      .to.be.instanceOf(ArrayPropertiesField)
      .and.to.containSubset({
        label: "StructArrayProperty",
        type: {
          valueFormat: "Array",
          typeName: "TestStruct[]",
        },
      });
  });

  it("gets property data after re-initializing Presentation", async function () {
    let categoryKey: InstanceKey;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const imodel = await buildTestIModel(this, async (builder) => {
      categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
    });
    const checkDataProvider = async () => {
      using provider = new PresentationPropertyDataProvider({ imodel });
      provider.keys = new KeySet([categoryKey]);
      const properties = await provider.getData();
      expect(properties.categories).to.not.be.empty;
    };

    // first request something to make sure we get data back
    await checkDataProvider();

    // re-initialize
    Presentation.terminate();
    await Presentation.initialize({
      presentation: {
        activeLocale: "en-pseudo",
      },
    });

    // repeat request
    await checkDataProvider();
  });
});

function validateRecords(
  records: PropertyRecord[],
  expectations: Array<{ propName: string; valueComparer?: (value: PropertyValue, property: PropertyDescription) => void }>,
) {
  for (const { propName, valueComparer } of expectations) {
    const record = records.find((rec) => rec.property.name.endsWith(propName));
    if (!record) {
      throw new Error(`Failed to find PropertyRecord for property - ${propName}`);
    }
    valueComparer?.(record.value, record.property);
  }
}
