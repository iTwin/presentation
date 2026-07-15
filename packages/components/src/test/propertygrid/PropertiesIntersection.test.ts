/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IModelConnection } from "@itwin/core-frontend";
import { ClassInfo, Field } from "@itwin/presentation-common";
import { buildIntersectionFieldsSelector } from "../../presentation-components/propertygrid/PropertiesIntersection.js";
import { createTestECClassInfo, createTestPropertyInfo, stubSchemaViewForClasses } from "../_helpers/Common.js";
import {
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestSelectClassInfo,
  createTestSimpleContentField,
} from "../_helpers/Content.js";

const createClassInfo = (id: string, name: string): ClassInfo => createTestECClassInfo({ id, name });
const selectClass = (classInfo: ClassInfo) => createTestSelectClassInfo({ selectClassInfo: classInfo });

describe("buildIntersectionFieldsSelector", () => {
  const imodelMock = { getSchemaView: vi.fn() };
  const imodel = imodelMock as unknown as IModelConnection;

  it("returns undefined when only one distinct non-polymorphic class is present", async () => {
    const descriptor = createTestContentDescriptor({
      fields: [],
      selectClasses: [selectClass(createClassInfo("0xa", "Schema:A"))],
    });
    const result = await buildIntersectionFieldsSelector(imodel, descriptor);
    expect(result).toBeUndefined();
  });

  it("returns undefined when there are no select classes", async () => {
    const descriptor = createTestContentDescriptor({ fields: [], selectClasses: [] });
    const result = await buildIntersectionFieldsSelector(imodel, descriptor);
    expect(result).toBeUndefined();
  });

  describe("with two distinct classes", () => {
    const baseClassInfo = createClassInfo("0x100", "Schema:Base");
    const classAInfo = createClassInfo("0xa", "Schema:ClassA");
    const classBInfo = createClassInfo("0xb", "Schema:ClassB");
    const selectClasses = [selectClass(classAInfo), selectClass(classBInfo)];

    beforeEach(() => {
      // Both ClassA and ClassB derive from Base
      imodelMock.getSchemaView.mockResolvedValue(
        stubSchemaViewForClasses([
          { classInfo: baseClassInfo },
          { classInfo: classAInfo, baseClassFullName: baseClassInfo.name },
          { classInfo: classBInfo, baseClassFullName: baseClassInfo.name },
        ]),
      );
    });

    /** Creates a `PropertiesField` holding a single property of the given class. */
    function propField(name: string, classInfo: ClassInfo) {
      return createTestPropertiesContentField({
        name,
        properties: [{ property: createTestPropertyInfo({ classInfo }) }],
      });
    }

    /** Creates a `NestedContentField` with the given `actualPrimaryClassIds`. */
    function nestedField(name: string, nestedFields: Field[], actualPrimaryClassIds: string[]) {
      const field = createTestNestedContentField({ name, nestedFields });
      field.actualPrimaryClassIds = actualPrimaryClassIds;
      return field;
    }

    /** Runs `buildIntersectionFieldsSelector` for the current select classes and returns the included field descriptors. */
    async function getIncludedFields(fields: Field[]) {
      const descriptor = createTestContentDescriptor({ fields, selectClasses });
      const result = await buildIntersectionFieldsSelector(imodel, descriptor);
      expect(result!.type).toBe("include");
      return result!.fields;
    }

    it("always includes direct simple (non-properties) fields", async () => {
      const simpleField = createTestSimpleContentField({ name: "SimpleField" });
      expect(await getIncludedFields([simpleField])).toEqual([simpleField.getFieldDescriptor()]);
    });

    it("includes direct PropertiesField when its property class is base of all key classes", async () => {
      const sharedProp = propField("SharedProp", baseClassInfo);
      expect(await getIncludedFields([sharedProp])).toEqual([sharedProp.getFieldDescriptor()]);
    });

    it("excludes direct PropertiesField when no single property class covers both key classes", async () => {
      // Field has a property for ClassA only -> ClassB doesn't derive from ClassA
      const classAOnlyProp = propField("ClassAOnlyProp", classAInfo);
      expect(await getIncludedFields([classAOnlyProp])).toHaveLength(0);
    });

    it("includes leaf fields of a matched NestedContentField regardless of their own property classes", async () => {
      // Once the parent matches, its leaf fields are not re-checked against the key classes
      const sharedProp = propField("SharedProp", baseClassInfo);
      const classAOnlyProp = propField("ClassAOnlyProp", classAInfo);
      const classBOnlyProp = propField("ClassBOnlyProp", classBInfo);
      const field = nestedField("RelatedStuff", [sharedProp, classAOnlyProp, classBOnlyProp], [baseClassInfo.id]);

      expect(await getIncludedFields([field])).toEqual([
        sharedProp.getFieldDescriptor(),
        classAOnlyProp.getFieldDescriptor(),
        classBOnlyProp.getFieldDescriptor(),
      ]);
    });

    it("omits NestedContentField when actualPrimaryClassIds does not cover all key classes", async () => {
      // actualPrimaryClassIds only has id for ClassA -> ClassB doesn't derive from ClassA
      const field = nestedField("RelatedStuff", [propField("NestedProp", classAInfo)], [classAInfo.id]);
      expect(await getIncludedFields([field])).toHaveLength(0);
    });

    it("re-checks child NestedContentFields by their own actualPrimaryClassIds", async () => {
      // Parent matches all key classes and has a leaf field plus a child nested content field
      const leafProp = propField("ParentLeafProp", baseClassInfo);
      // Child nested content field only applies to ClassA -> doesn't cover ClassB -> omitted
      const childNestedField = nestedField("ChildRelated", [propField("ChildLeafProp", classAInfo)], [classAInfo.id]);
      const parentNestedField = nestedField("RelatedStuff", [leafProp, childNestedField], [baseClassInfo.id]);

      // Parent's leaf field is included; child nested content field is omitted (doesn't cover ClassB)
      expect(await getIncludedFields([parentNestedField])).toEqual([leafProp.getFieldDescriptor()]);
    });

    it("includes leaf fields of a matched child NestedContentField", async () => {
      const leafProp = propField("ParentLeafProp", baseClassInfo);
      const childLeafProp = propField("ChildLeafProp", classAInfo);
      // Child nested content field covers all key classes -> its leaf fields are included
      const childNestedField = nestedField("ChildRelated", [childLeafProp], [baseClassInfo.id]);
      const parentNestedField = nestedField("RelatedStuff", [leafProp, childNestedField], [baseClassInfo.id]);

      expect(await getIncludedFields([parentNestedField])).toEqual([
        leafProp.getFieldDescriptor(),
        childLeafProp.getFieldDescriptor(),
      ]);
    });

    it("throws on unresolved select class", async () => {
      // Schema view can't resolve the select classes
      imodelMock.getSchemaView.mockResolvedValue(stubSchemaViewForClasses([]));
      const field = createTestPropertiesContentField({
        name: "Prop",
        properties: [{ property: createTestPropertyInfo() }],
      });
      await expect(getIncludedFields([field])).rejects.toThrow(/Failed to resolve select class/);
    });
  });

  describe("with a single polymorphic select class", () => {
    const classXInfo = createClassInfo("0x10", "Schema:X");
    const classAInfo = createClassInfo("0xa", "Schema:A");
    const classBInfo = createClassInfo("0xb", "Schema:B");
    // A single polymorphic select class X: content includes instances of its subclasses (A, B), which may
    // carry subclass-specific properties. Intersection should keep only the properties common to all of
    // them, i.e. the base class X properties.
    const selectClasses = [createTestSelectClassInfo({ selectClassInfo: classXInfo, isSelectPolymorphic: true })];

    beforeEach(() => {
      // A and B derive from X
      imodelMock.getSchemaView.mockResolvedValue(
        stubSchemaViewForClasses([
          { classInfo: classXInfo },
          { classInfo: classAInfo, baseClassFullName: classXInfo.name },
          { classInfo: classBInfo, baseClassFullName: classXInfo.name },
        ]),
      );
    });

    function propField(name: string, classInfo: ClassInfo) {
      return createTestPropertiesContentField({
        name,
        properties: [{ property: createTestPropertyInfo({ classInfo }) }],
      });
    }

    it("keeps only base class properties, dropping subclass-specific ones", async () => {
      const baseProp = propField("BaseProp", classXInfo);
      const classAOnlyProp = propField("ClassAOnlyProp", classAInfo);
      const classBOnlyProp = propField("ClassBOnlyProp", classBInfo);

      const descriptor = createTestContentDescriptor({
        fields: [baseProp, classAOnlyProp, classBOnlyProp],
        selectClasses,
      });
      const result = await buildIntersectionFieldsSelector(imodel, descriptor);

      expect(result!.type).toBe("include");
      expect(result!.fields).toEqual([baseProp.getFieldDescriptor()]);
    });
  });
});
