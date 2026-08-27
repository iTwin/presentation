/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { assert } from "@itwin/core-bentley";
import { SchemaViewPrimitiveType, StrengthDirection } from "@itwin/ecschema-metadata";
import {
  createECClassHierarchyResolver,
  createECPropertyFromSchemaView,
  createECSchemaFromSchemaView,
  createECSchemaProvider,
} from "../core-interop/Metadata.js";
import { createCoreECSqlReaderStub } from "./Utils.js";

import type { QueryRowProxy } from "@itwin/core-common";
import type { SchemaView } from "@itwin/ecschema-metadata";
import type { EC, Props } from "@itwin/presentation-shared";
import type { ECClassHierarchyResolver } from "../core-interop/Metadata.js";
import type { CoreECSqlReaderFactory } from "../core-interop/QueryExecutor.js";

describe("createECSchemaProvider", () => {
  it("returns undefined when schema not found in view", async () => {
    const imodel = createMockIModel({
      schemaView: createMockSchemaView(new Map([["TestSchema", { name: "TestSchema", classes: new Map() }]])),
    });
    const provider = createECSchemaProvider(imodel);
    expect(await provider.getSchema("NonExistentSchema")).toBeUndefined();
  });

  it("returns schema from schema view", async () => {
    const imodel = createMockIModel({
      schemaView: createMockSchemaView(
        new Map([
          ["TestSchema", { name: "TestSchema", readVersion: 1, writeVersion: 2, minorVersion: 3, classes: new Map() }],
        ]),
      ),
    });
    const provider = createECSchemaProvider(imodel);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    expect(schema.name).toBe("TestSchema");
    expect(schema.version).toEqual({ read: 1, write: 2, minor: 3 });
    expect(schema.isHidden).toBe(false);
  });

  it("returns class from schema view", async () => {
    const imodel = createMockIModel({
      schemaView: createMockSchemaView(
        new Map([
          [
            "TestSchema",
            { name: "TestSchema", classes: new Map([["TestClass", { name: "TestClass", schemaName: "TestSchema" }]]) },
          ],
        ]),
      ),
    });
    const provider = createECSchemaProvider(imodel);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    const cls = schema.getClass("TestClass");
    assert(cls !== undefined);
    expect(cls.name).toBe("TestClass");
    expect(cls.fullName).toBe("TestSchema.TestClass");
    expect(cls.isEntityClass()).toBe(true);
    expect(cls.isHidden).toBeUndefined();
  });

  it("returns enumeration from schema view", async () => {
    const imodel = createMockIModel({
      schemaView: createMockSchemaView(
        new Map([
          [
            "TestSchema",
            {
              name: "TestSchema",
              enumerations: new Map([
                [
                  "TestEnum",
                  {
                    name: "TestEnum",
                    schemaName: "TestSchema",
                    label: "Test Enum",
                    primitiveType: SchemaViewPrimitiveType.Integer,
                    isStrict: true,
                    enumerators: [{ name: "One", label: "One Label", value: 1 }],
                  },
                ],
              ]),
            },
          ],
        ]),
      ),
    });
    const provider = createECSchemaProvider(imodel);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    expect(schema.getEnumeration("NonExistent")).toBeUndefined();
    const enumeration = schema.getEnumeration("TestEnum");
    assert(enumeration !== undefined);
    expect(enumeration.name).toBe("TestEnum");
    expect(enumeration.fullName).toBe("TestSchema.TestEnum");
    expect(enumeration.schema).toBe(schema);
    expect(enumeration.type).toBe("Number");
    expect(enumeration.isStrict).toBe(true);
    expect(enumeration.enumerators).toEqual([{ name: "One", label: "One Label", value: 1 }]);
  });

  it("returns kind of quantity from schema view", async () => {
    const imodel = createMockIModel({
      schemaView: createMockSchemaView(
        new Map([
          [
            "TestSchema",
            {
              name: "TestSchema",
              kindOfQuantities: new Map([
                [
                  "TestKoq",
                  {
                    name: "TestKoq",
                    schemaName: "TestSchema",
                    label: "Test Koq",
                    relativeError: 0.001,
                    persistenceUnit: "Units.M",
                  },
                ],
              ]),
            },
          ],
        ]),
      ),
    });
    const provider = createECSchemaProvider(imodel);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    expect(schema.getKindOfQuantity("NonExistent")).toBeUndefined();
    const koq = schema.getKindOfQuantity("TestKoq");
    assert(koq !== undefined);
    expect(koq.name).toBe("TestKoq");
    expect(koq.fullName).toBe("TestSchema.TestKoq");
    expect(koq.label).toBe("Test Koq");
    expect(koq.relativeError).toBe(0.001);
    expect(koq.persistenceUnit).toBe("Units.M");
    expect(koq.schema).toBe(schema);
  });

  it("returns property category from schema view", async () => {
    const imodel = createMockIModel({
      schemaView: createMockSchemaView(
        new Map([
          [
            "TestSchema",
            {
              name: "TestSchema",
              propertyCategories: new Map([
                [
                  "TestCategory",
                  { name: "TestCategory", schemaName: "TestSchema", label: "Test Category", priority: 5 },
                ],
              ]),
            },
          ],
        ]),
      ),
    });
    const provider = createECSchemaProvider(imodel);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    expect(schema.getPropertyCategory("NonExistent")).toBeUndefined();
    const category = schema.getPropertyCategory("TestCategory");
    assert(category !== undefined);
    expect(category.name).toBe("TestCategory");
    expect(category.fullName).toBe("TestSchema.TestCategory");
    expect(category.label).toBe("Test Category");
    expect(category.priority).toBe(5);
    expect(category.schema).toBe(schema);
  });

  it("returns property from schema view class", async () => {
    const imodel = createMockIModel({
      schemaView: createMockSchemaView(
        new Map([
          [
            "TestSchema",
            {
              name: "TestSchema",
              classes: new Map([
                [
                  "TestClass",
                  {
                    name: "TestClass",
                    schemaName: "TestSchema",
                    properties: new Map([
                      [
                        "TestProp",
                        createMockProperty({
                          name: "TestProp",
                          isPrimitive: () => true,
                          isEnumeration: () => false,
                          primitiveType: SchemaViewPrimitiveType.String,
                          extendedTypeName: undefined,
                          kindOfQuantity: undefined,
                        } as unknown as SchemaView.Property),
                      ],
                    ]),
                  },
                ],
              ]),
            },
          ],
        ]),
      ),
    });
    const provider = createECSchemaProvider(imodel);
    const schema = await provider.getSchema("TestSchema");
    assert(schema !== undefined);
    const cls = schema.getClass("TestClass");
    assert(cls !== undefined);
    const prop = cls.getProperty("TestProp");
    assert(prop !== undefined);
    expect(prop.name).toBe("TestProp");
    expect(prop.isPrimitive()).toBe(true);
  });

  it("batches schema view requests made within the same frame", async () => {
    const schemaView = createMockSchemaView(
      new Map([
        ["SchemaA", { name: "SchemaA", classes: new Map() }],
        ["SchemaB", { name: "SchemaB", classes: new Map() }],
      ]),
    );
    const getSchemaView = vi.fn(async () => schemaView);
    const imodel = { getSchemaView, createQueryReader: () => createCoreECSqlReaderStub() };
    const provider = createECSchemaProvider(imodel);

    const [schemaA, schemaB] = await Promise.all([provider.getSchema("SchemaA"), provider.getSchema("SchemaB")]);
    expect(schemaA?.name).toBe("SchemaA");
    expect(schemaB?.name).toBe("SchemaB");
    expect(getSchemaView).toHaveBeenCalledTimes(1);
    expect(getSchemaView).toHaveBeenCalledWith({ schemas: ["SchemaA", "SchemaB"] });
  });

  it("reuses the cached schema while the schema view is not outdated", async () => {
    const schemaView = createMockSchemaView(new Map([["SchemaA", { name: "SchemaA", classes: new Map() }]]));
    const getSchemaView = vi.fn(async () => schemaView);
    const imodel = { getSchemaView, createQueryReader: () => createCoreECSqlReaderStub() };
    const provider = createECSchemaProvider(imodel);

    await provider.getSchema("SchemaA");
    await provider.getSchema("SchemaA");
    expect(getSchemaView).toHaveBeenCalledTimes(1);
  });

  it("shares a single request between concurrent calls for the same schema", async () => {
    const schemaView = createMockSchemaView(new Map([["SchemaA", { name: "SchemaA", classes: new Map() }]]));
    const getSchemaView = vi.fn(async () => schemaView);
    const imodel = { getSchemaView, createQueryReader: () => createCoreECSqlReaderStub() };
    const provider = createECSchemaProvider(imodel);

    const [first, second] = await Promise.all([provider.getSchema("SchemaA"), provider.getSchema("SchemaA")]);
    expect(getSchemaView).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("reuses the same `EC.Class` instance for repeated class lookups", async () => {
    const schemaView = createMockSchemaView(
      new Map([
        [
          "TestSchema",
          { name: "TestSchema", classes: new Map([["TestClass", { name: "TestClass", schemaName: "TestSchema" }]]) },
        ],
      ]),
    );
    const getSchemaView = vi.fn(async () => schemaView);
    const imodel = { getSchemaView, createQueryReader: () => createCoreECSqlReaderStub() };
    const provider = createECSchemaProvider(imodel);

    const schema = await provider.getSchema("TestSchema");
    const first = schema!.getClass("TestClass");
    const second = schema!.getClass("TestClass");
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it("issues a new request when the cached schema view is outdated", async () => {
    const view1 = createMockSchemaView(new Map([["SchemaA", { name: "SchemaA", classes: new Map() }]]));
    const view2 = createMockSchemaView(new Map([["SchemaA", { name: "SchemaA", classes: new Map() }]]));
    const getSchemaView = vi.fn().mockResolvedValueOnce(view1).mockResolvedValueOnce(view2);
    const imodel = { getSchemaView, createQueryReader: () => createCoreECSqlReaderStub() };
    const provider = createECSchemaProvider(imodel);

    await provider.getSchema("SchemaA");
    // Simulate the host replacing the view with a newer one, marking the cached one outdated.
    (view1 as { isOutdated: boolean }).isOutdated = true;
    await provider.getSchema("SchemaA");
    expect(getSchemaView).toHaveBeenCalledTimes(2);
  });

  describe("classDerivesFrom", () => {
    function stubIModelWithQueryRows(rows: Array<[string, string]>) {
      const createQueryReader = vi.fn(() =>
        (async function* () {
          for (const row of rows) {
            yield row as unknown as QueryRowProxy;
          }
        })(),
      );
      return { getSchemaView: async () => createMockSchemaView(new Map()), createQueryReader };
    }

    it("returns `true` synchronously when the class names are equal, without loading the hierarchy", () => {
      const imodel = stubIModelWithQueryRows([]);
      const provider = createECSchemaProvider(imodel);
      expect(provider.classDerivesFrom("Schema.A", "Schema.A")).toBe(true);
      expect(imodel.createQueryReader).not.toHaveBeenCalled();
    });

    it("returns a promise on the first call and resolves to `true` for a derived class", async () => {
      const provider = createECSchemaProvider(stubIModelWithQueryRows([["Schema.B", "Schema.A"]]));
      const result = provider.classDerivesFrom("Schema.B", "Schema.A");
      expect(result).toBeInstanceOf(Promise);
      expect(await result).toBe(true);
    });

    it("resolves to `false` for unrelated classes", async () => {
      const provider = createECSchemaProvider(stubIModelWithQueryRows([["Schema.B", "Schema.A"]]));
      expect(await provider.classDerivesFrom("Schema.B", "Schema.C")).toBe(false);
    });

    it("answers synchronously once the class hierarchy has been loaded", async () => {
      const provider = createECSchemaProvider(stubIModelWithQueryRows([["Schema.B", "Schema.A"]]));
      await provider.classDerivesFrom("Schema.B", "Schema.A");
      expect(provider.classDerivesFrom("Schema.B", "Schema.A")).toBe(true);
    });
  });
});

describe("createECSchemaFromSchemaView", () => {
  it("returns true for isHidden when schema is hidden", () => {
    const mockSchema = createMockSchema({ name: "HiddenSchema", isHidden: true, classes: new Map() });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["HiddenSchema", { name: "HiddenSchema", isHidden: true }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
    expect(ecSchema.isHidden).toBe(true);
  });

  it("returns undefined from getClass for non-existent name", () => {
    const mockSchema = createMockSchema({ name: "TestSchema", classes: new Map() });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["TestSchema", { name: "TestSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
    expect(ecSchema.getClass("DoesNotExist")).toBeUndefined();
  });
});

describe("createECClassFromSchemaView", () => {
  it("creates struct class", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([["StructClassX", { name: "StructClassX", schemaName: "ClassSchema", type: "struct" }]]),
    });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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

    const mockContext = createMockSchemaViewContext({
      schemaView: {
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
      },
    });

    const ecSchema = createECSchemaFromSchemaView(mockSchemaA, mockContext);
    const classA = ecSchema.getClass("ClassA");
    assert(classA !== undefined);
    const base = classA.baseClass;
    assert(base !== undefined);
    expect(base.name).toBe("ClassB");
    expect(base.schema.name).toBe("SchemaB");
  });

  it("returns derived classes", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([
        ["EntityA", { name: "EntityA", schemaName: "ClassSchema" }],
        ["EntityB", { name: "EntityB", schemaName: "ClassSchema" }],
      ]),
    });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
      derivedClassNames: ["ClassSchema.EntityB", "NotLoadedSchema.EntityC"],
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
    const cls = ecSchema.getClass("EntityA");
    assert(cls !== undefined);
    expect(cls.getDerivedClassNames()).toEqual(["ClassSchema.EntityB", "NotLoadedSchema.EntityC"]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockContext.classHierarchyResolver.getDerivedClassNames).toHaveBeenCalledWith(
      "ClassSchema.EntityA",
      undefined,
    );
  });

  it("returns undefined baseClass when class has no base", () => {
    const mockSchema = createMockSchema({
      name: "ClassSchema",
      classes: new Map([["EntityA", { name: "EntityA", schemaName: "ClassSchema" }]]),
    });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["ClassSchema", { name: "ClassSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["TestSchema", { name: "TestSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
    const cls = ecSchema.getClass("TestClass")!;
    const props = cls.getProperties();
    expect(props.length).toBe(1);
    expect(props[0].name).toBe("TestProp");
  });

  it("returns own properties via getOwnProperties", () => {
    const inheritedProp = createMockProperty({
      name: "InheritedProp",
      isPrimitive: () => true,
      isEnumeration: () => false,
      primitiveType: SchemaViewPrimitiveType.String,
      extendedTypeName: undefined,
      kindOfQuantity: undefined,
    } as unknown as SchemaView.Property & { name: string });
    const ownProp = createMockProperty({
      name: "OwnProp",
      isPrimitive: () => true,
      isEnumeration: () => false,
      primitiveType: SchemaViewPrimitiveType.String,
      extendedTypeName: undefined,
      kindOfQuantity: undefined,
    } as unknown as SchemaView.Property & { name: string });
    const mockSchema = createMockSchema({
      name: "TestSchema",
      classes: new Map([
        [
          "TestClass",
          {
            name: "TestClass",
            schemaName: "TestSchema",
            properties: new Map([
              ["InheritedProp", inheritedProp],
              ["OwnProp", ownProp],
            ]),
            ownProperties: new Map([["OwnProp", ownProp]]),
          },
        ],
      ]),
    });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["TestSchema", { name: "TestSchema" }]])),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
    const cls = ecSchema.getClass("TestClass")!;
    const ownProps = cls.getOwnProperties();
    expect(ownProps.map((p) => p.name)).toEqual(["OwnProp"]);
  });

  it("returns mixins from entity class", () => {
    const mixinAProps: MockClassProps = { name: "MixinA", schemaName: "ClassSchema", type: "mixin" };
    const mixinBProps: MockClassProps = { name: "MixinB", schemaName: "OtherSchema", type: "mixin" };
    const entityProps: MockClassProps = {
      name: "EntityWithMixins",
      schemaName: "ClassSchema",
      mixins: () => [createMockClass(mixinAProps), createMockClass(mixinBProps)],
    };
    const mockSchema = createMockSchema({ name: "ClassSchema", classes: new Map([["EntityWithMixins", entityProps]]) });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(
        new Map([
          ["ClassSchema", { name: "ClassSchema" }],
          ["OtherSchema", { name: "OtherSchema" }],
        ]),
      ),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
    const cls = ecSchema.getClass("EntityWithMixins")! as EC.EntityClass;
    const mixins = cls.getMixins();
    expect(mixins.map((m) => m.name)).toEqual(["MixinA", "MixinB"]);
    expect(mixins[0].schema.name).toBe("ClassSchema");
    expect(mixins[1].schema.name).toBe("OtherSchema");
  });

  it("resolves property.class to the base class for a property inherited by a derived entity", () => {
    const baseClassObj = createMockClass({ name: "BaseClass", schemaName: "BaseSchema" });
    const inheritedProp = createMockProperty({
      name: "InheritedProp",
      isPrimitive: () => true,
      isEnumeration: () => false,
      primitiveType: SchemaViewPrimitiveType.String,
      extendedTypeName: undefined,
      kindOfQuantity: undefined,
      declaringClass: baseClassObj,
    } as unknown as SchemaView.Property & { name: string });
    const mockSchema = createMockSchema({
      name: "DerivedSchema",
      classes: new Map([
        [
          "DerivedClass",
          {
            name: "DerivedClass",
            schemaName: "DerivedSchema",
            baseClass: () => baseClassObj,
            properties: new Map([["InheritedProp", inheritedProp]]),
          },
        ],
      ]),
    });
    const mockContext = createMockSchemaViewContext({
      schemaView: createMockSchemaView(
        new Map([
          ["DerivedSchema", { name: "DerivedSchema" }],
          ["BaseSchema", { name: "BaseSchema" }],
        ]),
      ),
    });
    const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
    const derivedClass = ecSchema.getClass("DerivedClass")!;
    const prop = derivedClass.getProperty("InheritedProp")!;
    // The property was enumerated from `DerivedClass`, but it's declared by `BaseClass` - `property.class`
    // must reflect the true source, not the class the property was queried through.
    expect(prop.class.fullName).toBe("BaseSchema.BaseClass");
    expect(prop.class.fullName).not.toBe(derivedClass.fullName);
    expect(prop.class.schema.name).toBe("BaseSchema");
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
      const mockContext = createMockSchemaViewContext({
        schemaView: createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]])),
      });
      const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
      const mockContext = createMockSchemaViewContext({
        schemaView: createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]])),
      });
      const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
      const mockContext = createMockSchemaViewContext({
        schemaView: createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]])),
      });
      const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
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
      const mockContext = createMockSchemaViewContext({
        schemaView: createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]])),
      });
      const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
      const rel = ecSchema.getClass("RelBwd")! as EC.RelationshipClass;
      expect(rel.source.abstractConstraint).toBeUndefined();
      expect(rel.target.abstractConstraint).toBeUndefined();
    });

    it("returns undefined from abstractConstraint getter when no abstract constraint set on constraint", () => {
      const sourceConstraint = {
        polymorphic: false,
        multiplicityLower: 0,
        multiplicityUpper: -1,
        constraintClasses: [],
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
      const mockContext = createMockSchemaViewContext({
        schemaView: createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]])),
      });
      const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
      const rel = ecSchema.getClass("RelNoAbstract")! as EC.RelationshipClass;
      expect(rel.source.abstractConstraint).toBeUndefined();
    });

    it("falls back to the sole constraint class as abstract constraint when none is explicitly set", () => {
      const entityAProps: MockClassProps = { name: "EntityA", schemaName: "RelSchema" };
      const sourceConstraint = {
        polymorphic: true,
        multiplicityLower: 1,
        multiplicityUpper: 1,
        constraintClasses: [createMockClass(entityAProps)],
        get abstractConstraint() {
          return undefined;
        },
      } as unknown as SchemaView.RelConstraint;

      const relProps: MockClassProps = {
        name: "RelSingleConstraint",
        schemaName: "RelSchema",
        type: "relationship",
        strengthDirection: StrengthDirection.Forward,
        source: sourceConstraint,
        target: undefined,
      };
      const mockSchema = createMockSchema({ name: "RelSchema", classes: new Map([["RelSingleConstraint", relProps]]) });
      const mockContext = createMockSchemaViewContext({
        schemaView: createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]])),
      });
      const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
      const rel = ecSchema.getClass("RelSingleConstraint")! as EC.RelationshipClass;
      expect(rel.source.abstractConstraint?.name).toBe("EntityA");
    });

    it("returns constraint classes from constraintClasses getter", () => {
      const entityAProps: MockClassProps = { name: "EntityA", schemaName: "RelSchema" };
      const entityBProps: MockClassProps = { name: "EntityB", schemaName: "RelSchema" };
      const sourceConstraint = {
        polymorphic: true,
        multiplicityLower: 1,
        multiplicityUpper: 1,
        constraintClasses: [createMockClass(entityAProps), createMockClass(entityBProps)],
        get abstractConstraint() {
          return undefined;
        },
      } as unknown as SchemaView.RelConstraint;
      const relProps: MockClassProps = {
        name: "RelWithConstraints",
        schemaName: "RelSchema",
        type: "relationship",
        strengthDirection: StrengthDirection.Forward,
        source: sourceConstraint,
        target: undefined,
      };
      const mockSchema = createMockSchema({ name: "RelSchema", classes: new Map([["RelWithConstraints", relProps]]) });
      const mockContext = createMockSchemaViewContext({
        schemaView: createMockSchemaView(new Map([["RelSchema", { name: "RelSchema" }]])),
      });
      const ecSchema = createECSchemaFromSchemaView(mockSchema, mockContext);
      const rel = ecSchema.getClass("RelWithConstraints")! as EC.RelationshipClass;
      const classes = rel.source.constraintClasses;
      expect(classes.map((c) => c.name)).toEqual(["EntityA", "EntityB"]);
    });
  });
});

describe("createECClassHierarchyResolver", () => {
  // Hierarchy used by the tests below:
  //   A (root)         M (root)
  //   ├─ B             │
  //   │  └─ C ─────────┘  (C also derives from M)
  //   └─ D
  const hierarchyRows: Array<[string, string | undefined]> = [
    ["Schema.A", undefined],
    ["Schema.M", undefined],
    ["Schema.B", "Schema.A"],
    ["Schema.C", "Schema.B"],
    ["Schema.C", "Schema.M"],
    ["Schema.D", "Schema.A"],
  ];

  async function createResolver() {
    const imodel: CoreECSqlReaderFactory = {
      createQueryReader: () =>
        (async function* () {
          for (const row of hierarchyRows) {
            yield row as unknown as QueryRowProxy;
          }
        })(),
    };
    return createECClassHierarchyResolver(imodel);
  }

  describe("classDerivesFrom", () => {
    it("returns true for a direct base class", async () => {
      const resolver = await createResolver();
      expect(resolver.classDerivesFrom("Schema.B", "Schema.A")).toBe(true);
    });

    it("returns true for a transitive base class", async () => {
      const resolver = await createResolver();
      expect(resolver.classDerivesFrom("Schema.C", "Schema.A")).toBe(true);
    });

    it("returns false when the candidate is not a base class", async () => {
      const resolver = await createResolver();
      expect(resolver.classDerivesFrom("Schema.C", "Schema.D")).toBe(false);
    });

    it("returns false for a class without any base classes", async () => {
      const resolver = await createResolver();
      expect(resolver.classDerivesFrom("Schema.A", "Schema.B")).toBe(false);
    });
  });

  describe("getDerivedClassNames", () => {
    it("returns only direct derived classes when `onlyDirect` is set", async () => {
      const resolver = await createResolver();
      expect(resolver.getDerivedClassNames("Schema.A", { onlyDirect: true })).toEqual(["Schema.B", "Schema.D"]);
    });

    it("returns all derived classes recursively", async () => {
      const resolver = await createResolver();
      expect(resolver.getDerivedClassNames("Schema.A")).toEqual(["Schema.B", "Schema.C", "Schema.D"]);
    });

    it("returns an empty array for a class without derived classes", async () => {
      const resolver = await createResolver();
      expect(resolver.getDerivedClassNames("Schema.C")).toEqual([]);
    });
  });
});

describe("createECPropertyFromSchemaView", () => {
  const mockSchemaObj = { name: "PropSchema" } as unknown as SchemaView.Schema;
  const dummyEcSchema: EC.Schema = {
    name: "PropSchema",
    version: { read: 1, write: 0, minor: 0 },
    isHidden: false,
    getClass: () => undefined,
    getEnumeration: () => undefined,
    getKindOfQuantity: () => undefined,
    getPropertyCategory: () => undefined,
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
  const dummyMockContext = {
    ...createMockSchemaViewContext({
      schemaView: createMockSchemaView(new Map([["PropSchema", { name: "PropSchema" }]])),
    }),
    schema: dummyEcSchema,
  };

  describe("Property class (declaring class)", () => {
    it("uses declaringClass for property.class, including its own schema context", () => {
      const declaringClass = createMockClass({ name: "OtherClass", schemaName: "OtherSchema" });
      const mockProp = createMockProperty({
        name: "TestProp",
        isPrimitive: () => true,
        primitiveType: SchemaViewPrimitiveType.String,
        declaringClass,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
      expect(prop.class).not.toBe(dummyEcClass);
      expect(prop.class.fullName).toBe("OtherSchema.OtherClass");
      expect(prop.class.schema.name).toBe("OtherSchema");
    });

    it("uses the declaring mixin for property.class", () => {
      const declaringMixin = createMockClass({ name: "MixinClass", schemaName: "MixinSchema", type: "mixin" });
      const mockProp = createMockProperty({
        name: "MixinProp",
        isPrimitive: () => true,
        primitiveType: SchemaViewPrimitiveType.String,
        declaringClass: declaringMixin,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
      expect(prop.class.fullName).toBe("MixinSchema.MixinClass");
      expect(prop.class.isMixin()).toBe(true);
      expect(prop.class.schema.name).toBe("MixinSchema");
    });

    it("falls back to the enumerated class when declaringClass is undefined (view property)", () => {
      const mockProp = createMockProperty({
        name: "ViewProp",
        isPrimitive: () => true,
        primitiveType: SchemaViewPrimitiveType.String,
        declaringClass: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
      expect(prop.class).toBe(dummyEcClass);
    });
  });

  describe("Navigation property", () => {
    it("creates forward navigation property", () => {
      const relClass = createMockClass({ name: "RelClass", schemaName: "PropSchema", type: "relationship" });
      const mockProp = createMockProperty({
        name: "NavFwdProp",
        isNavigation: () => true,
        direction: StrengthDirection.Forward,
        relationshipClass: relClass,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.EnumerationProperty;
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.EnumerationProperty;
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.EnumerationProperty;
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.EnumerationProperty;
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.EnumerationProperty;
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

        const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.PrimitiveProperty;
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.PrimitiveProperty;
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext) as EC.PrimitiveProperty;
      expect(prop.kindOfQuantity).toBeUndefined();
    });

    it("returns property category when set", () => {
      const mockCategory = {
        fullName: "PropSchema:TestCategory",
        name: "TestCategory",
        label: "Test Category",
        schema: mockSchemaObj,
      } as unknown as SchemaView.PropertyCategory;
      const mockProp = createMockProperty({
        name: "PropWithCategory",
        category: mockCategory,
        isPrimitive: () => true,
        isEnumeration: () => false,
        primitiveType: SchemaViewPrimitiveType.String,
        extendedTypeName: undefined,
        kindOfQuantity: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
      const category = prop.category;
      assert(category !== undefined);
      expect(category.name).toBe("TestCategory");
      expect(category.label).toBe("Test Category");
      expect(category.fullName).toBe("PropSchema.TestCategory");
      expect(category.schema.name).toBe("PropSchema");
    });

    it("throws for uninitialized SchemaView primitive type", () => {
      const mockProp = createMockProperty({
        name: "UninitializedProp",
        isPrimitive: () => true,
        isEnumeration: () => false,
        primitiveType: SchemaViewPrimitiveType.Uninitialized,
        extendedTypeName: undefined,
        kindOfQuantity: undefined,
      } as unknown as SchemaView.Property & { name: string });

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
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

      const prop = createECPropertyFromSchemaView(mockProp, dummyEcClass, dummyMockContext);
      expect(prop.isHidden).toBe(true);
    });
  });

  describe("unexpected kind", () => {
    it("throws with declaringClass name included in message", () => {
      const mockClass = { fullName: "TestSchema.TestClass" } as unknown as SchemaView.Class;
      const mockProp = createMockProperty({ name: "BadProp", declaringClass: mockClass });
      expect(() => createECPropertyFromSchemaView(mockProp, {} as EC.Class, dummyMockContext)).toThrow(
        "TestSchema.TestClass",
      );
    });

    it("throws with <ECCView> fallback when declaringClass is undefined", () => {
      const mockProp = createMockProperty({ name: "BadProp", declaringClass: undefined });
      expect(() => createECPropertyFromSchemaView(mockProp, {} as EC.Class, dummyMockContext)).toThrow("<ECCView>");
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
  enumerations?: Map<string, MockEnumerationProps>;
  kindOfQuantities?: Map<string, MockKoqProps>;
  propertyCategories?: Map<string, MockPropertyCategoryProps>;
}

interface MockEnumerationProps {
  name: string;
  schemaName: string;
  label?: string;
  description?: string;
  primitiveType?: SchemaViewPrimitiveType;
  isStrict?: boolean;
  enumerators?: Array<{ name: string; label?: string; value: string | number }>;
}

interface MockKoqProps {
  name: string;
  schemaName: string;
  label?: string;
  description?: string;
  relativeError?: number;
  persistenceUnit?: string;
}

interface MockPropertyCategoryProps {
  name: string;
  schemaName: string;
  label?: string;
  description?: string;
  priority?: number;
}

interface MockClassProps {
  name: string;
  schemaName: string;
  label?: string;
  isHidden?: boolean | undefined;
  type?: "entity" | "relationship" | "struct" | "mixin";
  baseClass?: () => SchemaView.Class | undefined;
  derivedClasses?: () => readonly SchemaView.Class[];
  mixins?: () => readonly SchemaView.Class[];
  is?: (classOrName: string) => boolean;
  properties?: Map<string, SchemaView.Property>;
  ownProperties?: Map<string, SchemaView.Property>;
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
    getEnumeration(name: string) {
      const enumProps = props.enumerations?.get(name);
      return enumProps ? createMockEnumeration(enumProps) : undefined;
    },
    getKindOfQuantity(name: string) {
      const koqProps = props.kindOfQuantities?.get(name);
      return koqProps ? createMockKoq(koqProps) : undefined;
    },
    getPropertyCategory(name: string) {
      const categoryProps = props.propertyCategories?.get(name);
      return categoryProps ? createMockPropertyCategory(categoryProps) : undefined;
    },
  } as unknown as SchemaView.Schema;
}

function createMockEnumeration(props: MockEnumerationProps): SchemaView.Enumeration {
  const schema = { name: props.schemaName } as unknown as SchemaView.Schema;
  return {
    fullName: `${props.schemaName}:${props.name}`,
    name: props.name,
    label: props.label,
    description: props.description,
    schema,
    primitiveType: props.primitiveType ?? SchemaViewPrimitiveType.String,
    isStrict: props.isStrict ?? true,
    getEnumerators: () => (props.enumerators ?? [])[Symbol.iterator](),
  } as unknown as SchemaView.Enumeration;
}

function createMockKoq(props: MockKoqProps): SchemaView.KindOfQuantity {
  const schema = { name: props.schemaName } as unknown as SchemaView.Schema;
  return {
    fullName: `${props.schemaName}:${props.name}`,
    name: props.name,
    label: props.label,
    description: props.description,
    schema,
    relativeError: props.relativeError ?? 0,
    persistenceUnit: props.persistenceUnit ?? "",
  } as unknown as SchemaView.KindOfQuantity;
}

function createMockPropertyCategory(props: MockPropertyCategoryProps): SchemaView.PropertyCategory {
  const schema = { name: props.schemaName } as unknown as SchemaView.Schema;
  return {
    fullName: `${props.schemaName}:${props.name}`,
    name: props.name,
    label: props.label,
    description: props.description,
    schema,
    priority: props.priority ?? 0,
  } as unknown as SchemaView.PropertyCategory;
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
    get mixins() {
      return props.mixins ? props.mixins() : [];
    },
    is: (classOrName: string) => (props.is ? props.is(classOrName) : false),
    getProperty: (name: string) => props.properties?.get(name) ?? undefined,
    getProperties: () => (props.properties ? [...props.properties.values()] : []),
    getOwnProperties: () => (props.ownProperties ? [...props.ownProperties.values()] : []),
    strengthDirection: props.strengthDirection ?? StrengthDirection.Forward,
    source: props.source,
    target: props.target,
  } as unknown as SchemaView.Class;
}

type PublicSchemaView = Awaited<ReturnType<Props<typeof createECSchemaProvider>["getSchemaView"]>>;

function createMockIModel(props?: { schemaView?: PublicSchemaView }) {
  return {
    getSchemaView: async () => props?.schemaView ?? createMockSchemaView(new Map()),
    createQueryReader: () => createCoreECSqlReaderStub(),
  };
}

function createMockSchemaViewContext({
  schemaView,
  derivedClassNames,
}: {
  schemaView: PublicSchemaView;
  derivedClassNames?: EC.FullClassNameDotNotation[];
}) {
  const classHierarchyResolver: ECClassHierarchyResolver = {
    classDerivesFrom: vi.fn(),
    getDerivedClassNames: vi.fn().mockReturnValue(derivedClassNames ?? []),
  };
  return { schemaView, classHierarchyResolver, classCache: new Map() };
}

function createMockSchemaView(schemas: Map<string, MockSchemaProps>): PublicSchemaView {
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
