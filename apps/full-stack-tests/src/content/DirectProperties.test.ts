/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getDirectPropertyFields,
  getPropertyFieldByName,
  getPropertyFieldsByName,
} from "./Utils.js";

describe("Content", () => {
  describe("Direct properties", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("handles primitive property types", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEnumeration typeName="IntEnum" backingTypeName="int" isStrict="true">
              <ECEnumerator name="Red" value="1" displayLabel="Red" />
              <ECEnumerator name="Green" value="2" displayLabel="Green" />
            </ECEnumeration>
            <ECEnumeration typeName="StrEnum" backingTypeName="string" isStrict="true">
              <ECEnumerator name="A" value="a" displayLabel="AA" />
              <ECEnumerator name="B" value="b" displayLabel="BB" />
            </ECEnumeration>
            <ECEntityClass typeName="A">
              <ECProperty propertyName="StringProp" typeName="string" />
              <ECProperty propertyName="IntProp" typeName="int" />
              <ECProperty propertyName="DoubleProp" typeName="double" />
              <ECProperty propertyName="BoolProp" typeName="boolean" />
              <ECProperty propertyName="LongProp" typeName="long" />
              <ECProperty propertyName="DateTimeProp" typeName="dateTime" />
              <ECProperty propertyName="Point2dProp" typeName="point2d" />
              <ECProperty propertyName="Point3dProp" typeName="point3d" />
              <ECProperty propertyName="IntEnumProp" typeName="IntEnum" />
              <ECProperty propertyName="StrEnumProp" typeName="StrEnum" />
              <ECProperty propertyName="BinaryProp" typeName="binary" />
              <ECProperty propertyName="GuidProp" typeName="binary" extendedTypeName="BeGuid" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { stringProp: "x", intProp: 1 });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      expect(getPropertyFieldByName(descriptor, "StringProp").type).toMatchObject({
        kind: "primitive",
        type: "String",
      });
      expect(getPropertyFieldByName(descriptor, "IntProp").type).toMatchObject({ kind: "primitive", type: "Integer" });
      expect(getPropertyFieldByName(descriptor, "DoubleProp").type).toMatchObject({
        kind: "primitive",
        type: "Double",
      });
      expect(getPropertyFieldByName(descriptor, "BoolProp").type).toMatchObject({ kind: "primitive", type: "Boolean" });
      expect(getPropertyFieldByName(descriptor, "LongProp").type).toMatchObject({ kind: "primitive", type: "Long" });
      expect(getPropertyFieldByName(descriptor, "DateTimeProp").type).toMatchObject({
        kind: "primitive",
        type: "DateTime",
      });
      expect(getPropertyFieldByName(descriptor, "Point2dProp").type).toMatchObject({
        kind: "primitive",
        type: "Point2d",
      });
      expect(getPropertyFieldByName(descriptor, "Point3dProp").type).toMatchObject({
        kind: "primitive",
        type: "Point3d",
      });

      const intEnumField = getPropertyFieldByName(descriptor, "IntEnumProp");
      expect(intEnumField.type.kind).toBe("primitive");
      if (intEnumField.type.kind === "primitive") {
        expect(intEnumField.type.enumeration?.enumerators.map((e) => e.value)).toEqual([1, 2]);
      }

      const strEnumField = getPropertyFieldByName(descriptor, "StrEnumProp");
      expect(strEnumField.type.kind).toBe("primitive");
      if (strEnumField.type.kind === "primitive") {
        expect(strEnumField.type.enumeration?.enumerators.map((e) => e.value)).toEqual(["a", "b"]);
      }

      // binary and GUID properties are not supported and get skipped
      expect(getPropertyFieldsByName(descriptor, "BinaryProp")).toHaveLength(0);
      expect(getPropertyFieldsByName(descriptor, "GuidProp")).toHaveLength(0);
    });

    it("models struct property fields", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECStructClass typeName="MyStruct">
              <ECProperty propertyName="Member" typeName="string" />
            </ECStructClass>
            <ECEntityClass typeName="A">
              <ECStructProperty propertyName="StructProp" typeName="MyStruct" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      const field = getPropertyFieldByName(descriptor, "StructProp");
      expect(field.type.kind).toBe("struct");
      if (field.type.kind === "struct") {
        expect(field.type.members.map((m) => m.name)).toContain("Member");
      }
    });

    it("models array property fields", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECStructClass typeName="MyStruct">
              <ECProperty propertyName="Member" typeName="string" />
            </ECStructClass>
            <ECEntityClass typeName="A">
              <ECArrayProperty propertyName="PrimitiveArrayProp" typeName="string" minOccurs="0" maxOccurs="unbounded" />
              <ECStructArrayProperty propertyName="StructArrayProp" typeName="MyStruct" minOccurs="0" maxOccurs="unbounded" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      const primitiveArrayField = getPropertyFieldByName(descriptor, "PrimitiveArrayProp");
      expect(primitiveArrayField.type.kind).toBe("array");
      if (primitiveArrayField.type.kind === "array") {
        expect(primitiveArrayField.type.elementType).toMatchObject({ kind: "primitive", type: "String" });
      }

      const structArrayField = getPropertyFieldByName(descriptor, "StructArrayProp");
      expect(structArrayField.type.kind).toBe("array");
      if (structArrayField.type.kind === "array") {
        expect(structArrayField.type.elementType.kind).toBe("struct");
        if (structArrayField.type.elementType.kind === "struct") {
          expect(structArrayField.type.elementType.members.map((m) => m.name)).toContain("Member");
        }
      }
    });

    it("models navigation property fields", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECNavigationProperty propertyName="NavToB" relationshipName="AtoB" direction="Forward" />
            </ECEntityClass>
            <ECEntityClass typeName="B" />
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..1)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      const field = getPropertyFieldByName(descriptor, "NavToB");
      expect(field.type.kind).toBe("navigation");
      if (field.type.kind === "navigation") {
        expect(field.type.targetClassName).toBe(setup.schema.items.B.fullName);
      }
    });

    it("enumerates subclass-specific properties for parallel derived classes", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>A</BaseClass>
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.B.fullName, { propA: "a-b", propB: "b" });
        builder.insertInstance(s.items.C.fullName, { propA: "a-c", propC: "c" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      const basePropField = getPropertyFieldByName(descriptor, "PropA");
      expect([...basePropField.valueClassNames].sort()).toEqual(
        [setup.schema.items.B.fullName, setup.schema.items.C.fullName].sort(),
      );
      expect(getPropertyFieldByName(descriptor, "PropB").valueClassNames).toContain(setup.schema.items.B.fullName);
      expect(getPropertyFieldByName(descriptor, "PropC").valueClassNames).toContain(setup.schema.items.C.fullName);
    });

    it("enumerates properties along a nested derived chain", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>B</BaseClass>
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.C.fullName, { propA: "a", propB: "b", propC: "c" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      expect(getPropertyFieldByName(descriptor, "PropA").valueClassNames).toContain(setup.schema.items.C.fullName);
      expect(getPropertyFieldByName(descriptor, "PropB").valueClassNames).toContain(setup.schema.items.C.fullName);
      expect(getPropertyFieldByName(descriptor, "PropC").valueClassNames).toContain(setup.schema.items.C.fullName);
    });

    it("omits properties of subclasses that have no instances", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>A</BaseClass>
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.B.fullName, { propA: "a", propB: "b" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      getPropertyFieldByName(descriptor, "PropB");
      expect(getPropertyFieldsByName(descriptor, "PropC")).toHaveLength(0);
    });

    it("includes mixin properties on a leaf class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="ModelBase" modifier="Abstract" />
            <ECEntityClass typeName="IMix" modifier="Abstract">
              <ECCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.01.00.04">
                  <AppliesToEntityClass>ModelBase</AppliesToEntityClass>
                </IsMixin>
              </ECCustomAttributes>
              <ECProperty propertyName="MixProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="A">
              <BaseClass>ModelBase</BaseClass>
              <BaseClass>IMix</BaseClass>
              <ECProperty propertyName="OwnProp" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { mixProp: "m", ownProp: "o" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      const directFields = getDirectPropertyFields(descriptor);
      expect(directFields.filter((field) => field.propertyName === "MixProp")).toHaveLength(1);
      expect(directFields.filter((field) => field.propertyName === "OwnProp")).toHaveLength(1);
    });

    it("discovers concrete classes and properties across a multi-level derived chain with instances at multiple levels", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="Base">
              <ECProperty propertyName="PropBase" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="D1">
              <BaseClass>Base</BaseClass>
              <ECProperty propertyName="Prop1" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="D2">
              <BaseClass>D1</BaseClass>
              <ECProperty propertyName="Prop2" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.D1.fullName, { propBase: "base1", prop1: "p1" });
        builder.insertInstance(s.items.D2.fullName, { propBase: "base2", prop1: "p1b", prop2: "p2" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Base.fullName }],
      });

      // Both concrete subclasses present in the data are discovered.
      expect([...descriptor.sources[0].resolvedPrimaryClasses].sort()).toEqual(
        [setup.schema.items.D1.fullName, setup.schema.items.D2.fullName].sort(),
      );

      // A base-declared property is supplied by both concrete subclasses.
      expect([...getPropertyFieldByName(descriptor, "PropBase").valueClassNames].sort()).toEqual(
        [setup.schema.items.D1.fullName, setup.schema.items.D2.fullName].sort(),
      );

      // A mid-level property is supplied by its declaring class and its subclass.
      expect([...getPropertyFieldByName(descriptor, "Prop1").valueClassNames].sort()).toEqual(
        [setup.schema.items.D1.fullName, setup.schema.items.D2.fullName].sort(),
      );

      // A leaf property is supplied only by the leaf class.
      expect(getPropertyFieldByName(descriptor, "Prop2").valueClassNames).toEqual([setup.schema.items.D2.fullName]);
    });
  });
});
