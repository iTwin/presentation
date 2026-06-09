/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { assert } from "@itwin/core-bentley";
import { SchemaViewPrimitiveType, StrengthDirection } from "@itwin/ecschema-metadata";
import {
  createECPropertyFromSchemaView,
  createECSchemaFromSchemaView,
  createECSchemaProviderFromSchemaView,
} from "../../core-interop/schema-provider/SchemaViewProvider.js";

import type { SchemaView } from "@itwin/ecschema-metadata";
import type { EC, Props } from "@itwin/presentation-shared";

describe("createECSchemaProviderFromSchemaView", () => {
  it("returns undefined when schema not found in view", async () => {
    const sv = createMockSchemaView(new Map([["TestSchema", { name: "TestSchema", classes: new Map() }]]));
    const provider = createECSchemaProviderFromSchemaView(sv);
    expect(await provider.getSchema("NonExistentSchema")).toBeUndefined();
  });

  it("returns schema from schema view", async () => {
    const sv = createMockSchemaView(
      new Map([
        ["TestSchema", { name: "TestSchema", readVersion: 1, writeVersion: 2, minorVersion: 3, classes: new Map() }],
      ]),
    );
    const provider = createECSchemaProviderFromSchemaView(sv);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    expect(schema.name).toBe("TestSchema");
    expect(schema.version).toEqual({ read: 1, write: 2, minor: 3 });
    expect(schema.isHidden).toBe(false);
  });

  it("returns class from schema view", async () => {
    const sv = createMockSchemaView(
      new Map([
        [
          "TestSchema",
          { name: "TestSchema", classes: new Map([["TestClass", { name: "TestClass", schemaName: "TestSchema" }]]) },
        ],
      ]),
    );
    const provider = createECSchemaProviderFromSchemaView(sv);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    const cls = schema.getClass("TestClass");
    assert(cls !== undefined);
    expect(cls.name).toBe("TestClass");
    expect(cls.fullName).toBe("TestSchema.TestClass");
    expect(cls.isEntityClass()).toBe(true);
    expect(cls.isHidden).toBeUndefined();
  });

  it("returns property from schema view class", async () => {
    const mockProp = createMockProperty({
      name: "TestProp",
      isPrimitive: () => true,
      isEnumeration: () => false,
      primitiveType: SchemaViewPrimitiveType.String,
      extendedTypeName: undefined,
      kindOfQuantity: undefined,
    } as unknown as SchemaView.Property & { name: string });
    const sv = createMockSchemaView(
      new Map([
        [
          "TestSchema",
          {
            name: "TestSchema",
            classes: new Map([
              [
                "TestClass",
                { name: "TestClass", schemaName: "TestSchema", properties: new Map([["TestProp", mockProp]]) },
              ],
            ]),
          },
        ],
      ]),
    );
    const provider = createECSchemaProviderFromSchemaView(sv);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    const cls = schema.getClass("TestClass");
    assert(cls !== undefined);
    const prop = cls.getProperty("TestProp");
    assert(prop !== undefined);
    expect(prop.name).toBe("TestProp");
    expect(prop.isPrimitive()).toBe(true);
  });
});

describe("createECSchemaFromSchemaView", () => {
  it("returns true for isHidden when schema is hidden", () => {
    const mockSchema = createMockSchema({ name: "HiddenSchema", isHidden: true, classes: new Map() });
    const sv = createMockSchemaView(new Map([["HiddenSchema", { name: "HiddenSchema", isHidden: true }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    expect(ecSchema.isHidden).toBe(true);
  });

  it("returns undefined from getClass for non-existent name", () => {
    const mockSchema = createMockSchema({ name: "TestSchema", classes: new Map() });
    const sv = createMockSchemaView(new Map([["TestSchema", { name: "TestSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    expect(ecSchema.getClass("DoesNotExist")).toBeUndefined();
  });
});

describe("createECClassFromSchemaView", () => {
  it("creates struct class", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([["StructClassX", { name: "StructClassX", schemaName: "ClassSchema", type: "struct" }]]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("StructClassX");
    assert(cls !== undefined);
    expect(cls.isStructClass()).toBe(true);
    expect(cls.isEntityClass()).toBe(false);
    expect(cls.isMixin()).toBe(false);
    expect(cls.isRelationshipClass()).toBe(false);
  });

  it("creates mixin class", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([["MixinClassX", { name: "MixinClassX", schemaName: "ClassSchema", type: "mixin" }]]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("MixinClassX");
    assert(cls !== undefined);
    expect(cls.isMixin()).toBe(true);
    expect(cls.isEntityClass()).toBe(false);
  });

  it("returns isHidden=true for hidden class", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([["HiddenClassX", { name: "HiddenClassX", schemaName: "ClassSchema", isHidden: true }]]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("HiddenClassX");
    assert(cls !== undefined);
    expect(cls.isHidden).toBe(true);
  });

  it("returns base class within the same schema", () => {
    const entityAProps: MockClassProps = { name: "EntityA", schemaName: "ClassSchema" };
    const entityBProps: MockClassProps = {
      name: "EntityB",
      schemaName: "ClassSchema",
      baseClass: () => createMockClass(entityAProps),
    };
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([
        ["EntityA", entityAProps],
        ["EntityB", entityBProps],
      ]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("EntityB");
    assert(cls !== undefined);
    const base = cls.baseClass;
    assert(base !== undefined);
    expect(base.name).toBe("EntityA");
    expect(base.schema.name).toBe("ClassSchema");
  });

  it("creates schema for base class in a different schema", () => {
    const classBProps: MockClassProps = { name: "ClassB", schemaName: "SchemaB" };
    const classAProps: MockClassProps = {
      name: "ClassA",
      schemaName: "SchemaA",
      baseClass: () => createMockClass(classBProps),
    };

    const mockSchemaA = createMockSchema({ name: "SchemaA", classes: new Map([["ClassA", classAProps]]) });
    const mockSchemaB = createMockSchema({ name: "SchemaB", classes: new Map([["ClassB", classBProps]]) });

    const sv: Props<typeof createECSchemaProviderFromSchemaView> = {
      schemaToken: "",
      isOutdated: false,
      schemaCount: 2,
      classCount: 2,
      getSchema: (name) => (name === "SchemaA" ? mockSchemaA : name === "SchemaB" ? mockSchemaB : undefined),
      getSchemaByAlias: () => undefined,
      *getSchemas() {
        yield mockSchemaA;
        yield mockSchemaB;
      },
      findClass: () => undefined,
      findEnumeration: () => undefined,
      findKindOfQuantity: () => undefined,
      findPropertyCategory: () => undefined,
    };

    const ecSchema = createECSchemaFromSchemaView(mockSchemaA, sv);
    const classA = ecSchema.getClass("ClassA");
    assert(classA !== undefined);
    const base = classA.baseClass;
    assert(base !== undefined);
    expect(base.name).toBe("ClassB");
    expect(base.schema.name).toBe("SchemaB");
  });

  it("returns derived classes", () => {
    const entityBProps: MockClassProps = { name: "EntityB", schemaName: "ClassSchema" };
    const entityAProps: MockClassProps = {
      name: "EntityA",
      schemaName: "ClassSchema",
      derivedClasses: () => [createMockClass(entityBProps)],
    };
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([
        ["EntityA", entityAProps],
        ["EntityB", entityBProps],
      ]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("EntityA");
    assert(cls !== undefined);
    const derived = cls.getDerivedClasses();
    expect(derived.length).toBe(1);
    expect(derived[0].name).toBe("EntityB");
  });

  it("returns undefined baseClass when class has no base", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([["EntityA", { name: "EntityA", schemaName: "ClassSchema" }]]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("EntityA");
    assert(cls !== undefined);
    expect(cls.baseClass).toBeUndefined();
  });

  it("evaluates is() with class object", () => {
    const entityAProps: MockClassProps = {
      name: "EntityA",
      schemaName: "ClassSchema",
      is: (name) => name === "ClassSchema.EntityA",
    };
    const entityBProps: MockClassProps = {
      name: "EntityB",
      schemaName: "ClassSchema",
      is: (name) => name === "ClassSchema.EntityA" || name === "ClassSchema.EntityB",
    };
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([
        ["EntityA", entityAProps],
        ["EntityB", entityBProps],
      ]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const entityA = ecSchema.getClass("EntityA")!;
    const entityB = ecSchema.getClass("EntityB")!;
    expect(entityB.is(entityA)).toBe(true);
    expect(entityA.is(entityB)).toBe(false);
  });

  it("evaluates is() with className + schemaName", () => {
    const entityBProps: MockClassProps = {
      name: "EntityB",
      schemaName: "ClassSchema",
      is: (name) => name === "ClassSchema.EntityA" || name === "ClassSchema.EntityB",
    };
    const mockSchema = createMockSchema({ name: "ClassSchema", classes: new Map([["EntityB", entityBProps]]) });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const entityB = ecSchema.getClass("EntityB")!;
    expect(entityB.is("EntityA", "ClassSchema")).toBe(true);
    expect(entityB.is("EntityB", "ClassSchema")).toBe(true);
    expect(entityB.is("StructClassX", "ClassSchema")).toBe(false);
  });

  it("returns undefined from getProperty for non-existent name", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([["EntityA", { name: "EntityA", schemaName: "ClassSchema", properties: new Map() }]]),
    });
    const sv = createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("EntityA")!;
    expect(cls.getProperty("NoSuchProp")).toBeUndefined();
  });

  it("returns all properties via getProperties", () => {
    const mockProp = createMockProperty({
      name: "TestProp",
      isPrimitive: () => true,
      isEnumeration: () => false,
      primitiveType: SchemaViewPrimitiveType.String,
      extendedTypeName: undefined,
      kindOfQuantity: undefined,
    } as unknown as SchemaView.Property & { name: string });
    const mockSchema = createMockSchema({
      name: "TestSchema",
      classes: new Map([
        ["TestClass", { name: "TestClass", schemaName: "TestSchema", properties: new Map([["TestProp", mockProp]]) }],
      ]),
    });
    const sv = createMockSchemaView(new Map([["TestSchema", { name: "TestSchema" }]]));
    const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
    const cls = ecSchema.getClass("TestClass")!;
    const props = cls.getProperties();
    expect(props.length).toBe(1);
    expect(props[0].name).toBe("TestProp");
  });

  describe("Relationship class", () => {
    it("returns forward direction", () => {
      const relFwdProps: MockClassProps = {
        name: "RelFwd",
        schemaName: "RelSchema",
        type: "relationship",
        strengthDirection: StrengthDirection.Forward,
        source: undefined,
        target: undefined,
      };
      const mockSchema = createMockSchema({ name: "RelSchema", classes: new Map([["RelFwd", relFwdProps]]) });
      const sv = createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]]));
      const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
      const cls = ecSchema.getClass("RelFwd")! as EC.RelationshipClass;
      expect(cls.isRelationshipClass()).toBe(true);
      expect(cls.direction).toBe("Forward");
    });

    it("returns backward direction", () => {
      const relBwdProps: MockClassProps = {
        name: "RelBwd",
        schemaName: "RelSchema",
        type: "relationship",
        strengthDirection: StrengthDirection.Backward,
        source: undefined,
        target: undefined,
      };
      const mockSchema = createMockSchema({ name: "RelSchema", classes: new Map([["RelBwd", relBwdProps]]) });
      const sv = createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]]));
      const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
      const cls = ecSchema.getClass("RelBwd")! as EC.RelationshipClass;
      expect(cls.direction).toBe("Backward");
    });

    it("creates source/target constraints with abstract constraint", () => {
      const entityAProps: MockClassProps = { name: "EntityA", schemaName: "RelSchema" };
      const entityBProps: MockClassProps = { name: "EntityB", schemaName: "RelSchema" };
      const sourceConstraint = {
        polymorphic: true,
        multiplicityLower: 1,
        multiplicityUpper: 1,
        get abstractConstraint() {
          return createMockClass(entityAProps);
        },
      } as unknown as SchemaView.RelConstraint;
      const targetConstraint = {
        polymorphic: false,
        multiplicityLower: 0,
        multiplicityUpper: -1,
        get abstractConstraint() {
          return createMockClass(entityBProps);
        },
      } as unknown as SchemaView.RelConstraint;

      const relFwdProps: MockClassProps = {
        name: "RelFwd",
        schemaName: "RelSchema",
        type: "relationship",
        strengthDirection: StrengthDirection.Forward,
        source: sourceConstraint,
        target: targetConstraint,
      };
      const mockSchema = createMockSchema({ name: "RelSchema", classes: new Map([["RelFwd", relFwdProps]]) });
      const sv = createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]]));
      const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
      const rel = ecSchema.getClass("RelFwd")! as EC.RelationshipClass;

      const src = rel.source;
      expect(src.polymorphic).toBe(true);
      expect(src.multiplicity.lowerLimit).toBe(1);
      expect(src.multiplicity.upperLimit).toBe(1);
      expect(src.abstractConstraint?.name).toBe("EntityA");

      const tgt = rel.target;
      expect(tgt.polymorphic).toBe(false);
      expect(tgt.multiplicity.lowerLimit).toBe(0);
      expect(tgt.multiplicity.upperLimit).toBe(-1);
      expect(tgt.abstractConstraint?.name).toBe("EntityB");
    });

    it("creates empty constraints when none are set on relationship", () => {
      const relBwdProps: MockClassProps = {
        name: "RelBwd",
        schemaName: "RelSchema",
        type: "relationship",
        strengthDirection: StrengthDirection.Backward,
        source: undefined,
        target: undefined,
      };
      const mockSchema = createMockSchema({ name: "RelSchema", classes: new Map([["RelBwd", relBwdProps]]) });
      const sv = createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]]));
      const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
      const rel = ecSchema.getClass("RelBwd")! as EC.RelationshipClass;
      expect(rel.source.abstractConstraint).toBeUndefined();
      expect(rel.target.abstractConstraint).toBeUndefined();
    });

    it("returns undefined from abstractConstraint getter when no abstract constraint set on constraint", () => {
      const sourceConstraint = {
        polymorphic: false,
        multiplicityLower: 0,
        multiplicityUpper: -1,
        get abstractConstraint() {
          return undefined;
        },
      } as unknown as SchemaView.RelConstraint;

      const relProps: MockClassProps = {
        name: "RelNoAbstract",
        schemaName: "RelSchema",
        type: "relationship",
        strengthDirection: StrengthDirection.Forward,
        source: sourceConstraint,
        target: undefined,
      };
      const mockSchema = createMockSchema({ name: "RelSchema", classes: new Map([["RelNoAbstract", relProps]]) });
      const sv = createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]]));
      const ecSchema = createECSchemaFromSchemaView(mockSchema, sv);
      const rel = ecSchema.getClass("RelNoAbstract")! as EC.RelationshipClass;
      expect(rel.source.abstractConstraint).toBeUndefined();
    });
  });
});

describe("createECPropertyFromSchemaView", () => {
  const mockSchemaObj = { name: "PropSchema" } as unknown as SchemaView.Schema;
  const dummySv = createMockSchemaView(new Map([["PropSchema", { name: "PropSchema" }]]));
  const dummyEcSchema: EC.Schema = {
    name: "PropSchema",
    version: { read: 1, write: 0, minor: 0 },
    isHidden: false,
    getClass: () => undefined,
  };
  const dummyEcClass = {
    schema: dummyEcSchema,
    fullName: "PropSchema.MainClass",
    name: "MainClass",
    label: undefined,
    isHidden: undefined,
    isEntityClass: () => true,
    isRelationshipClass: () => false,
    isStructClass: () => false,
    isMixin: () => false,
    get baseClass() {
      return undefined;
    },
    is: () => false,
    getProperty: () => undefined,
    getProperties: () => [],
    getDerivedClasses: () => [],
  } as unknown as EC.Class;

  describe("Navigation property", () => {
    it("creates forward navigation property", () => {
      const relClass = createMockClass({ name: "RelClass", schemaName: "PropSchema", type: "relationship" });
      const mockProp = createMockProperty({
        name: "NavFwdProp",
        isNavigation: () => true,
        direction: StrengthDirection.Forward,
        relationshipClass: relClass,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isNavigation()).toBe(true);
      expect(prop.isPrimitive()).toBe(false);
      expect(prop.isArray()).toBe(false);
      expect(prop.isStruct()).toBe(false);
      const nav = prop as EC.NavigationProperty;
      expect(nav.direction).toBe("Forward");
      expect(nav.relationshipClass.name).toBe("RelClass");
    });

    it("creates backward navigation property", () => {
      const relClass = createMockClass({ name: "RelClass", schemaName: "PropSchema", type: "relationship" });
      const mockProp = createMockProperty({
        name: "NavBwdProp",
        isNavigation: () => true,
        direction: StrengthDirection.Backward,
        relationshipClass: relClass,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      const nav = prop as EC.NavigationProperty;
      expect(nav.direction).toBe("Backward");
    });
  });

  describe("Enumeration property", () => {
    it("creates scalar enumeration property", () => {
      const mockProp = createMockProperty({
        name: "EnumScalarProp",
        isEnumeration: () => true,
        isArray: () => false,
        enumeration: undefined,
        kindOfQuantity: undefined,
        extendedTypeName: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isEnumeration()).toBe(true);
      expect(prop.isArray()).toBe(false);
      expect(prop.isNavigation()).toBe(false);
      expect(prop.kindOfQuantity).toBeUndefined();
    });

    it("creates enumeration array property with minOccurs/maxOccurs", () => {
      const mockProp = createMockProperty({
        name: "EnumArrayProp",
        isEnumeration: () => true,
        isArray: () => true,
        arrayMinOccurs: 1,
        arrayMaxOccurs: 5,
        enumeration: undefined,
        kindOfQuantity: undefined,
        extendedTypeName: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isEnumeration()).toBe(true);
      expect(prop.isArray()).toBe(true);
      const arr = prop as EC.EnumerationArrayProperty;
      expect(arr.minOccurs).toBe(1);
      expect(arr.maxOccurs).toBe(5);
    });

    it("returns enumeration data", () => {
      const mockEnum = {
        fullName: "PropSchema:TestEnum",
        name: "TestEnum",
        label: undefined,
        schema: mockSchemaObj,
        primitiveType: SchemaViewPrimitiveType.Integer,
        isStrict: true,
        getEnumerators: () =>
          [
            { name: "Val1", label: undefined, value: 1 },
            { name: "Val2", label: undefined, value: 2 },
          ][Symbol.iterator](),
      } as unknown as SchemaView.Enumeration;

      const mockProp = createMockProperty({
        name: "EnumScalarProp",
        isEnumeration: () => true,
        isArray: () => false,
        enumeration: mockEnum,
        kindOfQuantity: undefined,
        extendedTypeName: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.EnumerationProperty;
      const en = prop.enumeration;
      assert(en !== undefined);
      expect(en.name).toBe("TestEnum");
      expect(en.type).toBe("Number");
      expect(en.isStrict).toBe(true);
      expect(en.enumerators.length).toBe(2);
      expect(en.enumerators[0].name).toBe("Val1");
      expect(en.enumerators[1].name).toBe("Val2");
      expect(en.schema.name).toBe("PropSchema");
    });

    it("returns extendedTypeName for enumeration property", () => {
      const mockProp = createMockProperty({
        name: "EnumKoQProp",
        isEnumeration: () => true,
        isArray: () => false,
        enumeration: undefined,
        kindOfQuantity: undefined,
        extendedTypeName: "ExtTypeName",
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.EnumerationProperty;
      expect(prop.extendedTypeName).toBe("ExtTypeName");
    });

    it("returns undefined extendedTypeName when not set", () => {
      const mockProp = createMockProperty({
        name: "EnumScalarProp",
        isEnumeration: () => true,
        isArray: () => false,
        enumeration: undefined,
        kindOfQuantity: undefined,
        extendedTypeName: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.EnumerationProperty;
      expect(prop.extendedTypeName).toBeUndefined();
    });

    it("defaults minOccurs to 0 when arrayMinOccurs is undefined", () => {
      const mockProp = createMockProperty({
        name: "FakeEnumArrayProp",
        isEnumeration: () => true,
        isArray: () => true,
        arrayMinOccurs: undefined,
        arrayMaxOccurs: 5,
        enumeration: undefined,
        kindOfQuantity: undefined,
        extendedTypeName: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isArray()).toBe(true);
      expect((prop as EC.EnumerationArrayProperty).minOccurs).toBe(0);
    });

    it("returns undefined from enumeration getter when svProp.enumeration is null", () => {
      const mockProp = createMockProperty({
        name: "FakeEnumNoRefProp",
        isEnumeration: () => true,
        isArray: () => false,
        enumeration: undefined,
        kindOfQuantity: undefined,
        extendedTypeName: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.EnumerationProperty;
      expect(prop.enumeration).toBeUndefined();
    });

    it("maps string enumeration type to 'String'", () => {
      const mockStringEnum = {
        fullName: "PropSchema:StringEnum",
        name: "StringEnum",
        label: undefined,
        schema: mockSchemaObj,
        primitiveType: SchemaViewPrimitiveType.String,
        isStrict: false,
        getEnumerators: () => [][Symbol.iterator](),
      } as unknown as SchemaView.Enumeration;

      const mockProp = createMockProperty({
        name: "StringEnumProp",
        isEnumeration: () => true,
        isArray: () => false,
        enumeration: mockStringEnum,
        kindOfQuantity: undefined,
        extendedTypeName: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.EnumerationProperty;
      expect(prop.enumeration?.type).toBe("String");
    });
  });

  describe("Primitive property", () => {
    it("maps all primitive types", () => {
      const cases: [string, SchemaViewPrimitiveType, EC.PrimitiveType][] = [
        ["PrimBoolProp", SchemaViewPrimitiveType.Boolean, "Boolean"],
        ["PrimBinaryProp", SchemaViewPrimitiveType.Binary, "Binary"],
        ["PrimDateTimeProp", SchemaViewPrimitiveType.DateTime, "DateTime"],
        ["PrimDoubleProp", SchemaViewPrimitiveType.Double, "Double"],
        ["PrimIntProp", SchemaViewPrimitiveType.Integer, "Integer"],
        ["PrimLongProp", SchemaViewPrimitiveType.Long, "Long"],
        ["PrimPoint2dProp", SchemaViewPrimitiveType.Point2d, "Point2d"],
        ["PrimPoint3dProp", SchemaViewPrimitiveType.Point3d, "Point3d"],
        ["PrimIGeoProp", SchemaViewPrimitiveType.IGeometry, "IGeometry"],
        ["PrimStringProp", SchemaViewPrimitiveType.String, "String"],
      ];
      for (const [name, svType, expected] of cases) {
        const mockProp = createMockProperty({
          name,
          isPrimitive: () => true,
          isEnumeration: () => false,
          primitiveType: svType,
          extendedTypeName: undefined,
          kindOfQuantity: undefined,
        } as unknown as SchemaView.Property & { name: string });

        const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
        expect(prop.isPrimitive()).toBe(true);
        expect(prop.isEnumeration()).toBe(false);
        expect((prop as EC.PrimitiveProperty).primitiveType).toBe(expected);
      }
    });

    it("creates primitive array property", () => {
      const mockProp = createMockProperty({
        name: "PrimArrayProp",
        isPrimitive: () => true,
        isEnumeration: () => false,
        isArray: () => true,
        primitiveType: SchemaViewPrimitiveType.Integer,
        extendedTypeName: undefined,
        kindOfQuantity: undefined,
        arrayMinOccurs: undefined,
        arrayMaxOccurs: 10,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isPrimitive()).toBe(true);
      expect(prop.isArray()).toBe(true);
      const arr = prop as EC.PrimitiveArrayProperty;
      expect(arr.minOccurs).toBe(0);
      expect(arr.maxOccurs).toBe(10);
    });

    it("returns KoQ for primitive property with KoQ", () => {
      const mockKoq = {
        fullName: "PropSchema:TestKoQ",
        name: "TestKoQ",
        label: undefined,
        schema: mockSchemaObj,
      } as unknown as SchemaView.KindOfQuantity;

      const mockProp = createMockProperty({
        name: "PrimKoQProp",
        isPrimitive: () => true,
        isEnumeration: () => false,
        primitiveType: SchemaViewPrimitiveType.Double,
        extendedTypeName: "ExtTypeName",
        kindOfQuantity: mockKoq,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.PrimitiveProperty;
      expect(prop.kindOfQuantity?.name).toBe("TestKoQ");
    });

    it("returns extendedTypeName for primitive property", () => {
      const mockProp = createMockProperty({
        name: "PrimKoQProp",
        isPrimitive: () => true,
        isEnumeration: () => false,
        primitiveType: SchemaViewPrimitiveType.Double,
        extendedTypeName: "ExtTypeName",
        kindOfQuantity: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.PrimitiveProperty;
      expect(prop.extendedTypeName).toBe("ExtTypeName");
    });

    it("returns undefined KoQ when not set", () => {
      const mockProp = createMockProperty({
        name: "PrimBoolProp",
        isPrimitive: () => true,
        isEnumeration: () => false,
        primitiveType: SchemaViewPrimitiveType.Boolean,
        extendedTypeName: undefined,
        kindOfQuantity: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv) as EC.PrimitiveProperty;
      expect(prop.kindOfQuantity).toBeUndefined();
    });

    it("throws for uninitialized SchemaView primitive type", () => {
      const mockProp = createMockProperty({
        name: "UninitProp",
        isPrimitive: () => true,
        isEnumeration: () => false,
        primitiveType: SchemaViewPrimitiveType.Uninitialized,
        extendedTypeName: undefined,
        kindOfQuantity: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      assert(prop.isPrimitive());
      expect(() => prop.primitiveType).toThrow("Uninitialized CoreSchemaView primitive type");
    });
  });

  describe("Struct property", () => {
    it("creates scalar struct property", () => {
      const structClass = createMockClass({ name: "StructClassX", schemaName: "PropSchema", type: "struct" });
      const mockProp = createMockProperty({
        name: "StructScalarProp",
        isStruct: () => true,
        isArray: () => false,
        structClass,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isStruct()).toBe(true);
      expect(prop.isArray()).toBe(false);
      expect((prop as EC.StructProperty).structClass.name).toBe("StructClassX");
    });

    it("creates struct array property", () => {
      const structClass = createMockClass({ name: "StructClassX", schemaName: "PropSchema", type: "struct" });
      const mockProp = createMockProperty({
        name: "StructArrayProp",
        isStruct: () => true,
        isArray: () => true,
        arrayMinOccurs: undefined,
        arrayMaxOccurs: 3,
        structClass,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isStruct()).toBe(true);
      expect(prop.isArray()).toBe(true);
      const arr = prop as EC.StructArrayProperty;
      expect(arr.minOccurs).toBe(0);
      expect(arr.maxOccurs).toBe(3);
      expect(arr.structClass.name).toBe("StructClassX");
    });
  });

  describe("isHidden", () => {
    it("reflects isHidden=true on property", () => {
      const mockProp = createMockProperty({
        name: "HiddenProp",
        isHidden: true,
        isPrimitive: () => true,
        isEnumeration: () => false,
        primitiveType: SchemaViewPrimitiveType.String,
        extendedTypeName: undefined,
        kindOfQuantity: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummySv);
      expect(prop.isHidden).toBe(true);
    });
  });

  describe("unexpected kind", () => {
    it("throws with declaringClass name included in message", () => {
      const mockClass = { fullName: "TestSchema.TestClass" } as unknown as SchemaView.Class;
      const mockProp = createMockProperty({ name: "BadProp", declaringClass: mockClass });
      expect(() => createECPropertyFromSchemaView(mockProp, {} as EC.Class, dummySv)).toThrow("TestSchema.TestClass");
    });

    it("throws with <ECCView> fallback when declaringClass is undefined", () => {
      const mockProp = createMockProperty({ name: "BadProp", declaringClass: undefined });
      expect(() => createECPropertyFromSchemaView(mockProp, {} as EC.Class, dummySv)).toThrow("<ECCView>");
    });
  });
});

interface MockSchemaProps {
  name: string;
  readVersion?: number;
  writeVersion?: number;
  minorVersion?: number;
  isHidden?: boolean;
  classes?: Map<string, MockClassProps>;
}

interface MockClassProps {
  name: string;
  schemaName: string;
  label?: string;
  isHidden?: boolean | undefined;
  type?: "entity" | "relationship" | "struct" | "mixin";
  baseClass?: () => SchemaView.Class | undefined;
  derivedClasses?: () => readonly SchemaView.Class[];
  is?: (classOrName: string) => boolean;
  properties?: Map<string, SchemaView.Property>;
  strengthDirection?: StrengthDirection;
  source?: SchemaView.RelConstraint | undefined;
  target?: SchemaView.RelConstraint | undefined;
}

function createMockSchema(props: MockSchemaProps): SchemaView.Schema {
  return {
    name: props.name,
    readVersion: props.readVersion ?? 1,
    writeVersion: props.writeVersion ?? 0,
    minorVersion: props.minorVersion ?? 0,
    isHidden: props.isHidden ?? false,
    getClass(name: string) {
      const classProps = props.classes?.get(name);
      return classProps ? createMockClass(classProps) : undefined;
    },
  } as unknown as SchemaView.Schema;
}

function createMockClass(props: MockClassProps): SchemaView.Class {
  const schema = { name: props.schemaName } as unknown as SchemaView.Schema;
  return {
    fullName: `${props.schemaName}:${props.name}`,
    name: props.name,
    label: props.label,
    isHidden: props.isHidden,
    schema,
    isEntity: () => (props.type ?? "entity") === "entity",
    isRelationship: () => props.type === "relationship",
    isStruct: () => props.type === "struct",
    isMixin: () => props.type === "mixin",
    get baseClass() {
      return props.baseClass ? props.baseClass() : undefined;
    },
    get derivedClasses() {
      return props.derivedClasses ? props.derivedClasses() : [];
    },
    is: (classOrName: string) => (props.is ? props.is(classOrName) : false),
    getProperty: (name: string) => props.properties?.get(name) ?? undefined,
    getProperties: () => (props.properties ? [...props.properties.values()] : []),
    strengthDirection: props.strengthDirection ?? StrengthDirection.Forward,
    source: props.source,
    target: props.target,
  } as unknown as SchemaView.Class;
}

function createMockSchemaView(
  schemas: Map<string, MockSchemaProps>,
): Props<typeof createECSchemaProviderFromSchemaView> {
  const builtSchemas = new Map<string, SchemaView.Schema>();
  for (const [name, props] of schemas) {
    builtSchemas.set(name, createMockSchema(props));
  }
  return {
    schemaToken: "",
    isOutdated: false,
    schemaCount: builtSchemas.size,
    classCount: 0,
    getSchema: (name) => builtSchemas.get(name),
    getSchemaByAlias: () => undefined,
    getSchemas: () => builtSchemas.values(),
    findClass: () => undefined,
    findEnumeration: () => undefined,
    findKindOfQuantity: () => undefined,
    findPropertyCategory: () => undefined,
  };
}

function createMockProperty(overrides: Partial<SchemaView.Property> & { name: string }): SchemaView.Property {
  return {
    label: undefined,
    isHidden: false,
    isArray: () => false,
    isNavigation: () => false,
    isEnumeration: () => false,
    isPrimitive: () => false,
    isStruct: () => false,
    declaringClass: undefined,
    ...overrides,
  } as unknown as SchemaView.Property;
}
