/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertExternalSourceAspect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalType,
  insertRepositoryLink,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PrimitiveValue,
  PropertyDescription,
  PropertyRecord,
  PropertyValue,
  PropertyValueFormat,
} from "@itwin/appui-abstract";
import { PropertyCategory } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  ArrayPropertiesField,
  combineFieldNames,
  InstanceKey,
  KeySet,
  PropertiesField,
  RuleTypes,
  StructPropertiesField,
} from "@itwin/presentation-common";
import {
  DEFAULT_PROPERTY_GRID_RULESET,
  PresentationPropertyDataProvider,
  PresentationPropertyDataProviderProps,
} from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { importSchema } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { buildTestIModel } from "../../TestIModelSetup.js";

describe("PropertyDataProvider", async () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
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
        vi.restoreAllMocks();
      });

      it("creates empty result when properties requested for 0 instances", async () => {
        const { imodel } = await buildTestIModel(async (builder) => {
          insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        });
        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        provider.keys = new KeySet();
        const properties = await provider.getData();
        expect(Object.keys(properties.records)).toHaveLength(0);
      });

      it("creates property data when given key with concrete class", async () => {
        let categoryKey: InstanceKey;
        let modelKey: InstanceKey;
        let elementKey: InstanceKey;

        const { imodel } = await buildTestIModel(async (builder) => {
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
        expect((properties.label.value as PrimitiveValue).displayValue).toContain("My Element");
        validateRecords(properties.records["/selected-item/"], [
          {
            propName: "CodeValue",
            valueComparer: (value) =>
              expect(value).toMatchObject({ valueFormat: PropertyValueFormat.Primitive, value: undefined }),
          },
          {
            propName: "UserLabel",
            valueComparer: (value) =>
              expect(value).toMatchObject({ valueFormat: PropertyValueFormat.Primitive, value: "My Element" }),
          },
          {
            propName: "Model",
            valueComparer: (value) =>
              expect(value).toMatchObject({ valueFormat: PropertyValueFormat.Primitive, value: { id: modelKey.id } }),
          },
          {
            propName: "Category",
            valueComparer: (value) =>
              expect(value).toMatchObject({
                valueFormat: PropertyValueFormat.Primitive,
                value: { id: categoryKey.id },
              }),
          },
        ]);
      });

      it("creates property data when given key with base class", async () => {
        let categoryKey: InstanceKey;
        let modelKey: InstanceKey;
        let elementKey: InstanceKey;

        const { imodel } = await buildTestIModel(async (builder) => {
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
        expect((properties.label.value as PrimitiveValue).displayValue).toContain("My Element");
        validateRecords(properties.records["/selected-item/"], [
          {
            propName: "CodeValue",
            valueComparer: (value) =>
              expect(value).toMatchObject({ valueFormat: PropertyValueFormat.Primitive, value: undefined }),
          },
          {
            propName: "UserLabel",
            valueComparer: (value) =>
              expect(value).toMatchObject({ valueFormat: PropertyValueFormat.Primitive, value: "My Element" }),
          },
          {
            propName: "Model",
            valueComparer: (value) =>
              expect(value).toMatchObject({ valueFormat: PropertyValueFormat.Primitive, value: { id: modelKey.id } }),
          },
          {
            propName: "Category",
            valueComparer: (value) =>
              expect(value).toMatchObject({
                valueFormat: PropertyValueFormat.Primitive,
                value: { id: categoryKey.id },
              }),
          },
        ]);
      });

      it("favorites properties", async () => {
        let categoryKey: InstanceKey;

        const { imodel } = await buildTestIModel(async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        });
        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        vi.spyOn(provider as any, "isFieldFavorite").mockReturnValue(true);
        provider.keys = new KeySet([categoryKey!]);
        const properties = await provider.getData();
        const favoriteCategoryName = provider.isNestedPropertyCategoryGroupingEnabled
          ? "Favorite-/selected-item/"
          : "Favorite";
        validateRecords(properties.records["/selected-item/"], [
          { propName: "CodeValue" },
          { propName: "UserLabel" },
          { propName: "Model" },
        ]);
        validateRecords(properties.records[favoriteCategoryName], [
          { propName: "CodeValue" },
          { propName: "UserLabel" },
          { propName: "Model" },
        ]);
      });

      it("overrides default property category", async () => {
        let categoryKey: InstanceKey;

        const { imodel } = await buildTestIModel(async (builder) => {
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
        expect(properties.categories.find((category) => category.name === "default")?.label).toBe("Custom Category");
        validateRecords(properties.records.default, [
          { propName: "CodeValue" },
          { propName: "UserLabel" },
          { propName: "Model" },
        ]);
      });

      it("finds root property record keys", async () => {
        let categoryKey: InstanceKey;

        const { imodel } = await buildTestIModel(async (builder) => {
          categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        });

        using provider = createProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
        provider.keys = new KeySet([categoryKey!]);
        const properties = await provider.getData();

        const category = properties.categories.find((c) => c.name === "/selected-item/");
        expect(category).toBeDefined();

        const record = properties.records[category!.name].find((r) => r.property.displayLabel === "Code");
        expect(record).toBeDefined();

        const keys = await provider.getPropertyRecordInstanceKeys(record!);
        expect(keys).toEqual([categoryKey!]);
      });

      it("finds nested property record keys", async () => {
        let elementKey: InstanceKey;
        let externalsSourceAspectKey: InstanceKey;

        const { imodel } = await buildTestIModel(async (builder) => {
          const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
          const modelKey = insertPhysicalModelWithPartition({
            builder,
            fullClassNameSeparator: ":",
            codeValue: "My Model",
          });
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
        expect(category).toBeDefined();

        const record = properties.records[category!.name].find((r) => r.property.displayLabel === "Source Element ID");
        expect(record).toBeDefined();

        const keys = await provider.getPropertyRecordInstanceKeys(record!);
        expect(keys).toEqual([externalsSourceAspectKey!]);
      });
    });
  };

  runTests("with flat property categories", (provider) => (provider.isNestedPropertyCategoryGroupingEnabled = false));
  runTests("with nested property categories", (provider) => (provider.isNestedPropertyCategoryGroupingEnabled = true));

  it("finds array item & struct member fields", async () => {
    const { imodel, ...keys } = await buildTestIModel(async (builder, testName) => {
      const schema = await importSchema(
        testName,
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
      const modelKey = insertPhysicalModelWithPartition({
        builder,
        fullClassNameSeparator: ":",
        codeValue: "My Model",
      });
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
          expect(value.itemsTypeName).toBe("string");
          expect(value.items).toMatchObject([
            {
              property: { name: combineFieldNames("[*]", property.name), typename: "string" },
              value: { value: "Item 1" },
            },
            {
              property: { name: combineFieldNames("[*]", property.name), typename: "string" },
              value: { value: "Item 2" },
            },
          ]);
        },
      },
      {
        propName: "StructProperty",
        valueComparer: (value, property) => {
          assert(value.valueFormat === PropertyValueFormat.Struct);
          expect(value.members).toMatchObject({
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
          expect(value.itemsTypeName).toBe("TestStruct");
          expect(value.items).toMatchObject([
            {
              property: { name: combineFieldNames("[*]", property.name), typename: "TestStruct" },
              value: {
                valueFormat: PropertyValueFormat.Struct,
                members: {
                  StringMember: {
                    property: {
                      name: combineFieldNames("StringMember", combineFieldNames("[*]", property.name)),
                      typename: "string",
                    },
                    value: { value: "Item 1" },
                  },
                  NumericMember: {
                    property: {
                      name: combineFieldNames("NumericMember", combineFieldNames("[*]", property.name)),
                      typename: "int",
                    },
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
                    property: {
                      name: combineFieldNames("StringMember", combineFieldNames("[*]", property.name)),
                      typename: "string",
                    },
                    value: { value: "Item 2" },
                  },
                  NumericMember: {
                    property: {
                      name: combineFieldNames("NumericMember", combineFieldNames("[*]", property.name)),
                      typename: "int",
                    },
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
    expect(arrayItemField).toMatchObject({ name: "[*]", label: "ArrayProperty" });
    expect(arrayItemField.parentArrayField).toBeInstanceOf(ArrayPropertiesField);
    expect(arrayItemField.parentArrayField).toMatchObject({
      label: "ArrayProperty",
      type: { valueFormat: "Array", typeName: "string[]" },
    });

    // test retrieving struct member field
    const structRecord = properties.records["/selected-item/"].find((r) => r.property.name.endsWith("StructProperty"));
    assert(structRecord?.value.valueFormat === PropertyValueFormat.Struct);
    const structMemberRecord = structRecord.value.members.StringMember;
    const structMemberField = (await provider.getFieldByPropertyDescription(
      structMemberRecord.property,
    )) as PropertiesField;
    expect(structMemberField).toMatchObject({ name: "StringMember" });
    expect(structMemberField.parentStructField).toBeInstanceOf(StructPropertiesField);
    expect(structMemberField.parentStructField).toMatchObject({
      label: "StructProperty",
      type: { valueFormat: "Struct", typeName: "TestStruct" },
    });

    // test retrieving struct array member field
    const structArrayRecord = properties.records["/selected-item/"].find((r) =>
      r.property.name.endsWith("StructArrayProperty"),
    );
    assert(structArrayRecord?.value.valueFormat === PropertyValueFormat.Array);
    const structArrayItemRecord = structArrayRecord.value.items[0];
    assert(structArrayItemRecord?.value.valueFormat === PropertyValueFormat.Struct);
    const structArrayItemMemberRecord = structArrayItemRecord.value.members.StringMember;
    const structArrayMemberField = (await provider.getFieldByPropertyDescription(
      structArrayItemMemberRecord.property,
    )) as PropertiesField;
    expect(structArrayMemberField).toMatchObject({ name: "StringMember" });
    expect(structArrayMemberField.parentStructField).toBeInstanceOf(StructPropertiesField);
    expect(structArrayMemberField.parentStructField).toMatchObject({
      label: "StructArrayProperty",
      type: { valueFormat: "Struct", typeName: "TestStruct" },
    });
    expect((structArrayMemberField.parentStructField as StructPropertiesField).parentArrayField).toBeInstanceOf(
      ArrayPropertiesField,
    );
    expect((structArrayMemberField.parentStructField as StructPropertiesField).parentArrayField).toMatchObject({
      label: "StructArrayProperty",
      type: { valueFormat: "Array", typeName: "TestStruct[]" },
    });
  });

  it("gets property data after re-initializing Presentation", async () => {
    let categoryKey: InstanceKey;

    const { imodel } = await buildTestIModel(async (builder) => {
      categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
    });
    const checkDataProvider = async () => {
      using provider = new PresentationPropertyDataProvider({ imodel });
      provider.keys = new KeySet([categoryKey]);
      const properties = await provider.getData();
      expect(properties.categories).not.toHaveLength(0);
    };

    // first request something to make sure we get data back
    await checkDataProvider();

    // re-initialize
    Presentation.terminate();
    await Presentation.initialize({ presentation: { activeLocale: "en-pseudo" } });

    // repeat request
    await checkDataProvider();
  });

  describe("with `propertiesMergeMode`", () => {
    let imodel: IModelConnection;
    let elementA: InstanceKey;
    let elementB: InstanceKey;

    beforeAll(async () => {
      const result = await buildTestIModel("propertiesMergeMode", async (builder, testName) => {
        const schema = await importSchema(
          testName,
          builder,
          `
            <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
            <ECEntityClass typeName="Base" modifier="Abstract">
              <BaseClass>bis:PhysicalElement</BaseClass>
              <ECProperty propertyName="SharedProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="ElementA">
              <BaseClass>Base</BaseClass>
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="ElementB">
              <BaseClass>Base</BaseClass>
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="CommonAspect">
              <BaseClass>bis:ElementMultiAspect</BaseClass>
              <ECProperty propertyName="CommonAspectProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="AspectAOnly">
              <BaseClass>bis:ElementMultiAspect</BaseClass>
              <ECProperty propertyName="AspectAOnlyProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="MyType">
              <BaseClass>bis:PhysicalType</BaseClass>
              <ECProperty propertyName="TypeProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="CommonTypeAspect">
              <BaseClass>bis:ElementMultiAspect</BaseClass>
              <ECProperty propertyName="CommonTypeAspectProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="TypeAspectAOnly">
              <BaseClass>bis:ElementMultiAspect</BaseClass>
              <ECProperty propertyName="TypeAspectAOnlyProp" typeName="string" />
            </ECEntityClass>
          `,
        );
        const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({
          builder,
          fullClassNameSeparator: ":",
          codeValue: "My Model",
        });
        // Both selected elements have a `MyType` type definition (`PhysicalElement -> PhysicalType`),
        // and each type owns a `CommonTypeAspect` (`PhysicalType -> ElementAspect`), forming two
        // levels of nested content below the selected elements.
        const typeA = insertPhysicalType({
          builder,
          classFullName: schema.items.MyType.fullName,
          userLabel: "Type A",
          TypeProp: "type-a",
        });
        const typeB = insertPhysicalType({
          builder,
          classFullName: schema.items.MyType.fullName,
          userLabel: "Type B",
          TypeProp: "type-b",
        });
        const createdElementA = insertPhysicalElement({
          builder,
          classFullName: schema.items.ElementA.fullName,
          userLabel: "Element A",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          typeDefinitionId: typeA.id,
          SharedProp: "shared-a",
          PropA: "a-only",
        });
        const createdElementB = insertPhysicalElement({
          builder,
          classFullName: schema.items.ElementB.fullName,
          userLabel: "Element B",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          typeDefinitionId: typeB.id,
          SharedProp: "shared-b",
          PropB: "b-only",
        });
        // Both elements own a `CommonAspect` -> its nested content is common to both selected classes.
        builder.insertAspect({
          classFullName: schema.items.CommonAspect.fullName,
          element: { id: createdElementA.id },
          CommonAspectProp: "common-a",
        });
        builder.insertAspect({
          classFullName: schema.items.CommonAspect.fullName,
          element: { id: createdElementB.id },
          CommonAspectProp: "common-b",
        });
        // Only `ElementA` owns an `AspectAOnly` -> its nested content is specific to one selected class.
        builder.insertAspect({
          classFullName: schema.items.AspectAOnly.fullName,
          element: { id: createdElementA.id },
          AspectAOnlyProp: "a-only-aspect",
        });
        // Both types own a `CommonTypeAspect`, which is deeply nested content
        // (`PhysicalElement -> PhysicalType -> ElementAspect`) common to both selected classes.
        builder.insertAspect({
          classFullName: schema.items.CommonTypeAspect.fullName,
          element: { id: typeA.id },
          CommonTypeAspectProp: "common-type-a",
        });
        builder.insertAspect({
          classFullName: schema.items.CommonTypeAspect.fullName,
          element: { id: typeB.id },
          CommonTypeAspectProp: "common-type-b",
        });
        // Only `typeA` owns an `TypeAspectAOnly` -> its nested content is specific to one selected class.
        builder.insertAspect({
          classFullName: schema.items.TypeAspectAOnly.fullName,
          element: { id: typeA.id },
          TypeAspectAOnlyProp: "a-only-type-aspect",
        });
        return { elementA: createdElementA, elementB: createdElementB };
      });
      imodel = result.imodel;
      elementA = result.elementA;
      elementB = result.elementB;
    });

    afterAll(async () => {
      await imodel.close();
    });

    function getAllRecordLabels(records: { [categoryName: string]: PropertyRecord[] }) {
      const collect = (recs: PropertyRecord[]): string[] =>
        recs.flatMap((record) => [
          record.property.displayLabel,
          ...(record.value.valueFormat === PropertyValueFormat.Struct
            ? collect(Object.values(record.value.members))
            : []),
          ...(record.value.valueFormat === PropertyValueFormat.Array ? collect(record.value.items) : []),
        ]);
      return Object.values(records).flatMap(collect);
    }

    it("shows union of properties from all selected classes by default", async () => {
      using provider = new PresentationPropertyDataProvider({ imodel });
      provider.keys = new KeySet([elementA, elementB]);

      const properties = await provider.getData();
      const propLabels = getAllRecordLabels(properties.records);
      // own properties of both selected classes are shown
      expect(propLabels).to.containSubset(["SharedProp", "PropA", "PropB"]);
      // nested content (direct aspects) of both selected classes is shown
      expect(propLabels).to.containSubset(["CommonAspectProp", "AspectAOnlyProp"]);
      // first-level nested content (`MyType` type definition) is shown
      expect(propLabels).to.containSubset(["TypeProp"]);
      // deeply nested content common to both classes (`CommonTypeAspect` owned by both types) is shown
      expect(propLabels).to.containSubset(["CommonTypeAspectProp"]);
      // `TypeAspectAOnly` is deeply nested content (`PhysicalElement -> PhysicalType -> ElementAspect`)
      // owned by only one type. Since only `typeA` owns the aspect, the merged value
      // has nothing for the other instance and the field ends up with no value -> no record is
      // produced for it even in union mode.
      expect(propLabels).not.to.containSubset(["TypeAspectAOnlyProp"]);
    });

    it("shows only properties common to all selected classes when merge mode is `intersection`", async () => {
      using provider = new PresentationPropertyDataProvider({ imodel });
      provider.propertiesMergeMode = "intersection";
      provider.keys = new KeySet([elementA, elementB]);

      const properties = await provider.getData();
      const propLabels = getAllRecordLabels(properties.records);
      // only properties common to both selected classes are shown
      expect(propLabels).to.containSubset(["SharedProp", "CommonAspectProp", "TypeProp", "CommonTypeAspectProp"]);
      // properties specific to one of the selected classes are hidden. Note `TypeAspectAOnlyProp` is
      // never produced (see the union test above), so it is absent here regardless of the merge mode.
      expect(propLabels).not.to.containSubset(["PropA", "PropB", "AspectAOnlyProp", "TypeAspectAOnlyProp"]);
    });
  });
});

function validateRecords(
  records: PropertyRecord[],
  expectations: Array<{
    propName: string;
    valueComparer?: (value: PropertyValue, property: PropertyDescription) => void;
  }>,
) {
  for (const { propName, valueComparer } of expectations) {
    const record = records.find((rec) => rec.property.name.endsWith(propName));
    if (!record) {
      throw new Error(`Failed to find PropertyRecord for property - ${propName}`);
    }
    valueComparer?.(record.value, record.property);
  }
}
