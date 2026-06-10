/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { assert } from "@itwin/core-bentley";
import {
  ECClass as CoreClass,
  PrimitiveType,
  RelationshipMultiplicity,
  SchemaItemType,
  StrengthDirection,
} from "@itwin/ecschema-metadata";
import { createECSchemaProvider } from "../../core-interop/Metadata.js";
import {
  createECClass,
  createECProperty,
  createECSchema,
} from "../../core-interop/schema-provider/SchemaContextProvider.js";

import type {
  EnumerationArrayProperty as CoreEnumerationArrayProperty,
  EnumerationProperty as CoreEnumerationProperty,
  Enumerator as CoreEnumerator,
  NavigationProperty as CoreNavigationProperty,
  PrimitiveArrayProperty as CorePrimitiveArrayProperty,
  PrimitiveProperty as CorePrimitiveProperty,
  Schema as CoreSchema,
  StructArrayProperty as CoreStructArrayProperty,
  StructProperty as CoreStructProperty,
  SchemaKey,
} from "@itwin/ecschema-metadata";
import type { EC } from "@itwin/presentation-shared";

function stubSchema(name: string, version: EC.SchemaVersion = { read: 0, write: 0, minor: 0 }) {
  return { name, schemaKey: { version }, getItems: () => [] as CoreClass[], customAttributes: undefined };
}

describe("createECSchemaProvider", () => {
  describe("SchemaContext path", () => {
    it("returns schema from schema context", async () => {
      const schemaContext = {
        getSchema: vi
          .fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>()
          .mockImplementation(async (key: SchemaKey) => {
            if (key.compareByName("x")) {
              return stubSchema("y", { read: 1, write: 2, minor: 3 }) as unknown as CoreSchema;
            }
            return undefined;
          }),
      };

      const provider = createECSchemaProvider(schemaContext);
      const schema = await provider.getSchema("x");
      assert(schema !== undefined);

      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
      const calledKey = schemaContext.getSchema.mock.calls[0][0];
      expect(calledKey.compareByName("x")).toBe(true);
      expect(schema.name).toBe("y");
      expect(schema.version).toEqual({ read: 1, write: 2, minor: 3 });
    });

    it(`returns undefined on "schema not found" error`, async () => {
      const schemaContext = {
        getSchema: vi.fn<(key: SchemaKey) => Promise<CoreSchema>>().mockRejectedValue(new Error("schema not found")),
      };

      const provider = createECSchemaProvider(schemaContext);
      expect(await provider.getSchema("x")).toBeUndefined();
    });

    it("re-throws SchemaContext errors", async () => {
      const schemaContext = {
        getSchema: vi.fn<(key: SchemaKey) => Promise<CoreSchema>>().mockRejectedValue(new Error("Unknown error")),
      };

      const provider = createECSchemaProvider(schemaContext);
      await expect(provider.getSchema("x")).rejects.toThrow();
      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
    });

    it("returns undefined from schema context", async () => {
      const schemaContext = { getSchema: vi.fn().mockResolvedValue(undefined) };

      const provider = createECSchemaProvider(schemaContext);
      const schema = await provider.getSchema("x");

      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
      expect(schema).toBeUndefined();
    });

    it("doesn't repeat requests for the same schema", async () => {
      const schemaContext = {
        getSchema: vi
          .fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>()
          .mockResolvedValue(stubSchema("x") as unknown as CoreSchema),
      };

      const provider = createECSchemaProvider(schemaContext);
      await Promise.all([provider.getSchema("x"), provider.getSchema("x")]);

      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
    });

    it("handles duplicate schema in cache error", async () => {
      const schemaContext = {
        getSchema: vi
          .fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>()
          .mockRejectedValueOnce(new Error("The schema, x.01.02.03, already exists within this cache"))
          .mockResolvedValueOnce(stubSchema("x") as unknown as CoreSchema),
      };

      const provider = createECSchemaProvider(schemaContext);
      await provider.getSchema("x");

      expect(schemaContext.getSchema).toHaveBeenCalledTimes(2);
    });

    it("force-loads class data (base classes, koq/enum/nav properties, rel constraints)", async () => {
      const baseClassGetter = vi.fn().mockResolvedValue({ fullName: "x.Base" });
      const koqGetter = vi.fn().mockResolvedValue({});
      const enumerationGetter = vi.fn().mockResolvedValue({});
      const navRelClassGetter = vi.fn().mockResolvedValue({});
      const sourceConstraintGetter = vi.fn().mockResolvedValue({});
      const targetConstraintGetter = vi.fn().mockResolvedValue({});

      const schemaContext = {
        getSchema: vi
          .fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>()
          .mockImplementation(async (key: SchemaKey) => {
            if (!key.compareByName("x")) {
              return undefined;
            }
            return {
              name: "x",
              schemaKey: { version: { read: 0, write: 0, minor: 0 } },
              customAttributes: undefined,
              getItemSync: () => undefined,
              getItems: () => [
                {
                  schemaItemType: SchemaItemType.EntityClass,
                  get baseClass() {
                    return baseClassGetter();
                  },
                  getPropertiesSync: () => [
                    {
                      get kindOfQuantity() {
                        return koqGetter();
                      },
                      isEnumeration: () => false,
                      isNavigation: () => false,
                    },
                    {
                      kindOfQuantity: undefined,
                      isEnumeration: () => true,
                      get enumeration() {
                        return enumerationGetter();
                      },
                      isNavigation: () => false,
                    },
                    {
                      kindOfQuantity: undefined,
                      isEnumeration: () => false,
                      isNavigation: () => true,
                      get relationshipClass() {
                        return navRelClassGetter();
                      },
                    },
                  ],
                },
                {
                  schemaItemType: SchemaItemType.EntityClass,
                  get baseClass() {
                    return baseClassGetter();
                  },
                  getPropertiesSync: () => [],
                },
                {
                  schemaItemType: SchemaItemType.RelationshipClass,
                  baseClass: undefined,
                  getPropertiesSync: () => [],
                  source: {
                    get abstractConstraint() {
                      return sourceConstraintGetter();
                    },
                  },
                  target: {
                    get abstractConstraint() {
                      return targetConstraintGetter();
                    },
                  },
                },
                {
                  schemaItemType: SchemaItemType.RelationshipClass,
                  baseClass: undefined,
                  getPropertiesSync: () => [],
                  source: { abstractConstraint: undefined },
                  target: { abstractConstraint: undefined },
                },
              ],
            } as unknown as CoreSchema;
          }),
      };

      const provider = createECSchemaProvider(schemaContext);
      await provider.getSchema("x");

      expect(baseClassGetter).toHaveBeenCalled();
      expect(koqGetter).toHaveBeenCalled();
      expect(enumerationGetter).toHaveBeenCalled();
      expect(navRelClassGetter).toHaveBeenCalled();
      expect(sourceConstraintGetter).toHaveBeenCalled();
      expect(targetConstraintGetter).toHaveBeenCalled();
    });
  });
});

describe("createECSchema", () => {
  describe("getClass", () => {
    it("returns class from core schema", () => {
      const item = { fullName: "s.c", name: "c", label: "C", schemaItemType: SchemaItemType.EntityClass };
      const coreSchema = { ...stubSchema("s"), getItemSync: vi.fn().mockReturnValue(item) };

      const schema = createECSchema(coreSchema as unknown as CoreSchema, new Map());
      const result = schema.getClass("c");
      assert(result !== undefined);

      expect(coreSchema.getItemSync).toHaveBeenCalledExactlyOnceWith("c", CoreClass);
      expect(result.schema.name).toBe("s");
      expect(result.fullName).toBe("s.c");
      expect(result.name).toBe("c");
      expect(result.label).toBe("C");
      expect(typeof result.is === "function").toBe(true);
    });

    it("returns undefined from core schema", () => {
      const coreSchema = { ...stubSchema("s"), getItemSync: vi.fn().mockReturnValue(undefined) };

      const schema = createECSchema(coreSchema as unknown as CoreSchema, new Map());
      const result = schema.getClass("c");

      expect(coreSchema.getItemSync).toHaveBeenCalledExactlyOnceWith("c", CoreClass);
      expect(result).toBeUndefined();
    });
  });

  describe("isHidden", () => {
    it("returns false when schema has no HiddenSchema custom attribute", () => {
      const coreSchema = { ...stubSchema("s"), customAttributes: undefined };
      const schema = createECSchema(coreSchema as unknown as CoreSchema, new Map());
      expect(schema.isHidden).toBe(false);
    });

    it("returns true when schema has HiddenSchema custom attribute", () => {
      const coreSchema = { ...stubSchema("s"), customAttributes: new Map([["CoreCustomAttributes.HiddenSchema", {}]]) };
      const schema = createECSchema(coreSchema as unknown as CoreSchema, new Map());
      expect(schema.isHidden).toBe(true);
    });
  });
});

describe("createECClass", () => {
  const schema: EC.Schema = {
    name: "s",
    version: { read: 1, write: 0, minor: 0 },
    isHidden: false,
    getClass() {
      return undefined;
    },
  };

  it("creates class using schema from core class", () => {
    const coreClass = {
      schemaItemType: SchemaItemType.EntityClass,
      fullName: "s.c",
      name: "c",
      label: "C",
      schema: stubSchema("core-schema"),
    } as unknown as CoreClass;
    const result = createECClass(coreClass);
    expect(result.schema.name).toBe("core-schema");
  });

  it("creates entity class from core class", () => {
    const coreClass = { fullName: "s.c", name: "c", label: "C", schemaItemType: SchemaItemType.EntityClass };
    const result = createECClass(coreClass as unknown as CoreClass, schema);
    expect(result.isEntityClass()).toBe(true);
    expect(result.isRelationshipClass()).toBe(false);
    expect(result.isStructClass()).toBe(false);
    expect(result.isMixin()).toBe(false);
    expect(result.schema.name).toBe("s");
    expect(result.fullName).toBe("s.c");
    expect(result.name).toBe("c");
    expect(result.label).toBe("C");
    expect(typeof result.is === "function").toBe(true);
  });

  it("creates relationship class from core class", () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.RelationshipClass,
    } as unknown as CoreClass;
    const result = createECClass(coreClass, schema);
    expect(result.isEntityClass()).toBe(false);
    expect(result.isRelationshipClass()).toBe(true);
    expect(result.isStructClass()).toBe(false);
    expect(result.isMixin()).toBe(false);
  });

  it("creates struct class from core class", () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.StructClass,
    } as unknown as CoreClass;
    const result = createECClass(coreClass, schema);
    expect(result.isEntityClass()).toBe(false);
    expect(result.isRelationshipClass()).toBe(false);
    expect(result.isStructClass()).toBe(true);
    expect(result.isMixin()).toBe(false);
  });

  it("creates mixin from core class", () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.Mixin,
    } as unknown as CoreClass;
    const result = createECClass(coreClass, schema);
    expect(result.isEntityClass()).toBe(false);
    expect(result.isRelationshipClass()).toBe(false);
    expect(result.isStructClass()).toBe(false);
    expect(result.isMixin()).toBe(true);
  });

  it("throws when creating class from non-class core schema item", () => {
    const coreClass = {
      schemaItemType: SchemaItemType.Constant,
      fullName: "s.c",
      name: "c",
      label: "C",
    } as unknown as CoreClass;
    expect(() => createECClass(coreClass, schema)).toThrow();
  });

  describe("isHidden", () => {
    it("returns true when class has HiddenClass custom attribute", () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        customAttributes: new Map([["CoreCustomAttributes.HiddenClass", {}]]),
        schema: { customAttributes: undefined },
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      expect(ecClass.isHidden).toBe(true);
    });

    it("returns false when class has HiddenClass attribute with Show=true", () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        customAttributes: new Map([["CoreCustomAttributes.HiddenClass", { ["Show"]: true }]]),
        schema: { customAttributes: undefined },
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      expect(ecClass.isHidden).toBe(false);
    });

    it("returns true when schema has HiddenSchema and class has no override", () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        customAttributes: undefined,
        schema: { ...stubSchema("s"), customAttributes: new Map([["CoreCustomAttributes.HiddenSchema", {}]]) },
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass);
      expect(ecClass.isHidden).toBe(true);
    });

    it("returns undefined when no hidden attributes", () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        customAttributes: undefined,
        schema: { customAttributes: undefined },
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      expect(ecClass.isHidden).toBeUndefined();
    });
  });

  describe("baseClass", () => {
    it("returns base class from getBaseClassSync", () => {
      const coreBaseClass = { schemaItemType: SchemaItemType.EntityClass, fullName: "s.b", name: "b" };
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        getBaseClassSync: vi.fn().mockReturnValue(coreBaseClass),
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      expect(ecClass.baseClass!.fullName).toBe("s.b");
    });

    it("returns undefined when getBaseClassSync returns undefined", () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        getBaseClassSync: vi.fn().mockReturnValue(undefined),
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      expect(ecClass.baseClass).toBeUndefined();
    });
  });

  describe("getDerivedClasses", () => {
    it("returns derived classes from derivedMap", () => {
      const coreDerived = { schemaItemType: SchemaItemType.EntityClass, fullName: "s.d", name: "d" };
      const coreClass = { schemaItemType: SchemaItemType.EntityClass, fullName: "s.c", name: "c" };
      const derivedMap = new Map([["s.c" as const, [coreDerived as unknown as CoreClass]]]);
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema, derivedMap);
      const result = ecClass.getDerivedClasses();
      expect(result).toHaveLength(1);
      expect(result[0].fullName).toBe("s.d");
    });

    it("returns empty list when no derivedMap", () => {
      const coreClass = { schemaItemType: SchemaItemType.EntityClass, fullName: "s.c", name: "c" };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      expect(ecClass.getDerivedClasses()).toHaveLength(0);
    });
  });

  describe("is", () => {
    it("delegates to isSync for EC.Class override", () => {
      const coreBase = { schemaItemType: SchemaItemType.EntityClass, fullName: "s.b", name: "b" };
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        isSync: vi.fn().mockReturnValue(true),
      };
      const class1 = createECClass(coreClass as unknown as CoreClass, schema);
      const class2 = createECClass(coreBase as unknown as CoreClass, schema);
      expect(class1.is(class2)).toBe(true);
      expect(coreClass.isSync).toHaveBeenCalledWith("b", "s");
    });

    it("returns false from isSync when class is not in hierarchy", () => {
      const coreOther = { schemaItemType: SchemaItemType.EntityClass, fullName: "s.other", name: "other" };
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        isSync: vi.fn().mockReturnValue(false),
      };
      const class1 = createECClass(coreClass as unknown as CoreClass, schema);
      const class2 = createECClass(coreOther as unknown as CoreClass, schema);
      expect(class1.is(class2)).toBe(false);
    });

    it("handles class and schema name string overload", () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        isSync: vi.fn().mockReturnValue(true),
      };
      const class1 = createECClass(coreClass as unknown as CoreClass, schema);
      expect(class1.is("a", "b")).toBe(true);
      expect(coreClass.isSync).toHaveBeenCalledWith("a", "b");
    });
  });

  describe("getProperties", () => {
    it("returns properties using getPropertiesSync", () => {
      const mockProp = {
        isArray: () => false,
        isStruct: () => false,
        isEnumeration: () => false,
        isNavigation: () => false,
        isPrimitive: () => true,
        name: "p",
        fullName: "s.c.p",
        customAttributes: undefined,
        getKindOfQuantitySync: () => undefined,
      };
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        getPropertiesSync: vi.fn().mockReturnValue([mockProp]),
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      const properties = ecClass.getProperties();

      expect(coreClass.getPropertiesSync).toHaveBeenCalledOnce();
      expect(properties.length).toBe(1);
    });
  });

  describe("getProperty", () => {
    it("returns property using getPropertySync", () => {
      const mockProp = {
        isArray: () => false,
        isStruct: () => false,
        isEnumeration: () => false,
        isNavigation: () => false,
        isPrimitive: () => true,
        name: "p",
        fullName: "s.c.p",
        customAttributes: undefined,
        getKindOfQuantitySync: () => undefined,
      };
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        getPropertySync: vi.fn().mockReturnValue(mockProp),
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      const prop = ecClass.getProperty("p");

      expect(coreClass.getPropertySync).toHaveBeenCalledExactlyOnceWith("p", false);
      expect(prop).toBeDefined();
    });

    it("returns undefined from core class", () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        getPropertySync: vi.fn().mockReturnValue(undefined),
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      const prop = ecClass.getProperty("p");

      expect(coreClass.getPropertySync).toHaveBeenCalledExactlyOnceWith("p", false);
      expect(prop).toBeUndefined();
    });
  });

  describe("Relationship class", () => {
    const coreRelationshipClass = {
      schemaItemType: SchemaItemType.RelationshipClass,
      fullName: "Schema.TestRelationship",
      name: "TestRelationship",
      label: "Test relationship",
    };

    describe("direction", () => {
      it("returns forward direction from core relationship", () => {
        const rel = createECClass(
          { ...coreRelationshipClass, strengthDirection: StrengthDirection.Forward } as unknown as CoreClass,
          schema,
        ) as EC.RelationshipClass;
        expect(rel.direction).toBe("Forward");
      });

      it("returns backward direction from core relationship", () => {
        const rel = createECClass(
          { ...coreRelationshipClass, strengthDirection: StrengthDirection.Backward } as unknown as CoreClass,
          schema,
        ) as EC.RelationshipClass;
        expect(rel.direction).toBe("Backward");
      });
    });

    describe("source & target", () => {
      it("returns source constraint", () => {
        const rel = createECClass(
          { ...coreRelationshipClass, source: {}, schema: { customAttributes: undefined } } as unknown as CoreClass,
          schema,
        ) as EC.RelationshipClass;
        expect(rel.source).toBeDefined();
      });

      it("returns target constraint", () => {
        const rel = createECClass(
          { ...coreRelationshipClass, target: {}, schema: { customAttributes: undefined } } as unknown as CoreClass,
          schema,
        ) as EC.RelationshipClass;
        expect(rel.target).toBeDefined();
      });

      describe("ECRelationshipConstraint implementation", () => {
        it("returns undefined multiplicity from core constraint", () => {
          const rel = createECClass(
            {
              ...coreRelationshipClass,
              source: { multiplicity: undefined },
              schema: { customAttributes: undefined },
            } as unknown as CoreClass,
            schema,
          ) as EC.RelationshipClass;
          expect(rel.source.multiplicity).toBeUndefined();
        });

        it("returns multiplicity from core constraint", () => {
          const rel = createECClass(
            {
              ...coreRelationshipClass,
              // eslint-disable-next-line @itwin/no-internal
              source: { multiplicity: new RelationshipMultiplicity(123, 456) },
              schema: { customAttributes: undefined },
            } as unknown as CoreClass,
            schema,
          ) as EC.RelationshipClass;
          expect(rel.source.multiplicity).toEqual({ lowerLimit: 123, upperLimit: 456 });
        });

        it("returns polymorphic flag from core constraint", () => {
          [false, true].forEach((isPolymorphic) => {
            const rel = createECClass(
              {
                ...coreRelationshipClass,
                source: { polymorphic: isPolymorphic },
                schema: { customAttributes: undefined },
              } as unknown as CoreClass,
              schema,
            ) as EC.RelationshipClass;
            expect(rel.source.polymorphic).toBe(isPolymorphic);
          });
        });

        it("returns abstract constraint via schema lookup", () => {
          const coreAbstractConstraint = {
            schemaItemType: SchemaItemType.EntityClass,
            fullName: "Schema.TestAbstractConstraint",
            name: "TestAbstractConstraint",
            label: "Test abstract constraint",
          };
          const abstractConstraintRef = {}; // simulates LazyLoadedRelationshipConstraintClass (SchemaItemKey)
          const coreSchema = {
            lookupItemSync: vi.fn().mockReturnValue(coreAbstractConstraint),
            customAttributes: undefined,
          };
          const rel = createECClass(
            {
              ...coreRelationshipClass,
              source: { abstractConstraint: abstractConstraintRef },
              schema: coreSchema,
            } as unknown as CoreClass,
            schema,
          ) as EC.RelationshipClass;
          const constraint = rel.source.abstractConstraint!;
          expect(constraint.isEntityClass()).toBe(true);
          expect(constraint.fullName).toBe("Schema.TestAbstractConstraint");
          expect(coreSchema.lookupItemSync).toHaveBeenCalledWith(abstractConstraintRef, CoreClass);
        });

        it("returns undefined abstract constraint when not set", () => {
          const rel = createECClass(
            {
              ...coreRelationshipClass,
              source: { abstractConstraint: undefined },
              schema: { customAttributes: undefined },
            } as unknown as CoreClass,
            schema,
          ) as EC.RelationshipClass;
          expect(rel.source.abstractConstraint).toBeUndefined();
        });

        it("returns undefined when abstract constraint class cannot be resolved synchronously", () => {
          const abstractConstraintRef = {};
          const coreSchema = { lookupItemSync: vi.fn().mockReturnValue(undefined), customAttributes: undefined };
          const rel = createECClass(
            {
              ...coreRelationshipClass,
              source: { abstractConstraint: abstractConstraintRef },
              schema: coreSchema,
            } as unknown as CoreClass,
            schema,
          ) as EC.RelationshipClass;
          expect(rel.source.abstractConstraint).toBeUndefined();
        });
      });
    });
  });
});

describe("createECProperty", () => {
  const propertyClass: EC.Class = {} as unknown as EC.Class;
  const propertyStub = {
    isArray: () => false,
    isEnumeration: () => false,
    isNavigation: () => false,
    isPrimitive: () => false,
    isStruct: () => false,
    fullName: "",
    name: "",
    customAttributes: undefined,
    getKindOfQuantitySync: () => undefined,
  };

  describe("isHidden", () => {
    it("returns false when property has no HiddenProperty custom attribute", () => {
      const coreProperty = {
        ...propertyStub,
        isPrimitive: () => true,
        name: "test-property",
        customAttributes: undefined,
      } as unknown as CorePrimitiveProperty;
      const property = createECProperty(coreProperty, propertyClass);
      expect(property.isHidden).toBe(false);
    });

    it("returns true when property has HiddenProperty custom attribute", () => {
      const coreProperty = {
        ...propertyStub,
        isPrimitive: () => true,
        name: "test-property",
        customAttributes: new Map([["CoreCustomAttributes.HiddenProperty", {}]]),
      } as unknown as CorePrimitiveProperty;
      const property = createECProperty(coreProperty, propertyClass);
      expect(property.isHidden).toBe(true);
    });

    it("returns false when property has HiddenProperty CA with Show=true", () => {
      const coreProperty = {
        ...propertyStub,
        isPrimitive: () => true,
        name: "test-property",
        customAttributes: new Map([["CoreCustomAttributes.HiddenProperty", { ["Show"]: true }]]),
      } as unknown as CorePrimitiveProperty;
      const property = createECProperty(coreProperty, propertyClass);
      expect(property.isHidden).toBe(false);
    });
  });

  describe("Primitive property", () => {
    it("creates property from core property", () => {
      const coreProperty = {
        ...propertyStub,
        isPrimitive: () => true,
        name: "test-property",
        label: "Test property",
        extendedTypeName: "extended",
      } as unknown as CorePrimitiveProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.PrimitiveProperty;
      expect(property.class).toBe(propertyClass);
      expect(property.isArray()).toBe(false);
      expect(property.isEnumeration()).toBe(false);
      expect(property.isNavigation()).toBe(false);
      expect(property.isPrimitive()).toBe(true);
      expect(property.isStruct()).toBe(false);
      expect(property.name).toBe(coreProperty.name);
      expect(property.label).toBe(coreProperty.label);
      expect(property.extendedTypeName).toBe(coreProperty.extendedTypeName);
    });

    it("maps primitive types", () => {
      const types: [PrimitiveType, EC.PrimitiveType][] = [
        [PrimitiveType.Binary, "Binary"],
        [PrimitiveType.Boolean, "Boolean"],
        [PrimitiveType.DateTime, "DateTime"],
        [PrimitiveType.Double, "Double"],
        [PrimitiveType.IGeometry, "IGeometry"],
        [PrimitiveType.Integer, "Integer"],
        [PrimitiveType.Long, "Long"],
        [PrimitiveType.Point2d, "Point2d"],
        [PrimitiveType.Point3d, "Point3d"],
        [PrimitiveType.String, "String"],
      ];
      types.forEach(([coreType, expectation]) => {
        const coreProperty = {
          ...propertyStub,
          isPrimitive: () => true,
          name: "test-property",
          primitiveType: coreType,
        } as unknown as CorePrimitiveProperty;
        const property = createECProperty(coreProperty, propertyClass) as EC.PrimitiveProperty;
        expect(property.primitiveType).toBe(expectation);
      });

      const uninitializedTypes = [undefined, PrimitiveType.Uninitialized];
      uninitializedTypes.forEach((coreType) => {
        const uninitializedProperty = createECProperty(
          {
            ...propertyStub,
            isPrimitive: () => true,
            name: "test-property",
            primitiveType: coreType,
          } as unknown as CorePrimitiveProperty,
          propertyClass,
        ) as EC.PrimitiveProperty;
        expect(() => uninitializedProperty.primitiveType).toThrow();
      });
    });

    it("maps kind of quantity from getKindOfQuantitySync", () => {
      const coreKoq = { fullName: "SchemaName.TestKoq", name: "TestKoq", schema: stubSchema("SchemaName") };
      const coreProperty = {
        ...propertyStub,
        isPrimitive: () => true,
        name: "test-property",
        getKindOfQuantitySync: vi.fn().mockReturnValue(coreKoq),
      } as unknown as CorePrimitiveProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.PrimitiveProperty;
      const koq = property.kindOfQuantity!;
      expect(koq.fullName).toBe("SchemaName.TestKoq");

      const propertyNoKoq = createECProperty(
        { ...propertyStub, isPrimitive: () => true, name: "test-property" } as unknown as CorePrimitiveProperty,
        propertyClass,
      ) as EC.PrimitiveProperty;
      expect(propertyNoKoq.kindOfQuantity).toBeUndefined();
    });
  });

  describe("Navigation property", () => {
    it("creates property from core property", () => {
      const coreRelClass = {
        schemaItemType: SchemaItemType.RelationshipClass,
        fullName: "s.rel",
        name: "rel",
        schema: stubSchema("s"),
      };
      const coreProperty = {
        ...propertyStub,
        isNavigation: () => true,
        name: "test-property",
        label: "Test property",
        getRelationshipClassSync: vi.fn().mockReturnValue(coreRelClass),
      } as unknown as CoreNavigationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.NavigationProperty;
      expect(property.class).toBe(propertyClass);
      expect(property.isArray()).toBe(false);
      expect(property.isEnumeration()).toBe(false);
      expect(property.isNavigation()).toBe(true);
      expect(property.isPrimitive()).toBe(false);
      expect(property.isStruct()).toBe(false);
      expect(property.name).toBe(coreProperty.name);
      expect(property.label).toBe(coreProperty.label);
    });

    it("maps direction", () => {
      const coreRelClass = {
        schemaItemType: SchemaItemType.RelationshipClass,
        fullName: "s.rel",
        name: "rel",
        schema: stubSchema("s"),
      };
      const map: [StrengthDirection, string][] = [
        [StrengthDirection.Backward, "Backward"],
        [StrengthDirection.Forward, "Forward"],
      ];
      map.forEach(([coreDirection, expectation]) => {
        const coreProperty = {
          ...propertyStub,
          isNavigation: () => true,
          name: "test-property",
          direction: coreDirection,
          getRelationshipClassSync: vi.fn().mockReturnValue(coreRelClass),
        } as unknown as CoreNavigationProperty;
        const property = createECProperty(coreProperty, propertyClass) as EC.NavigationProperty;
        expect(property.direction).toBe(expectation);
      });
    });

    it("returns relationship class from getRelationshipClassSync", () => {
      const coreRelClass = {
        schemaItemType: SchemaItemType.RelationshipClass,
        fullName: "SchemaName.RelationshipClass",
        name: "RelationshipClass",
        schema: stubSchema("SchemaName"),
      };
      const coreProperty = {
        ...propertyStub,
        isNavigation: () => true,
        name: "test-property",
        direction: StrengthDirection.Forward,
        getRelationshipClassSync: vi.fn().mockReturnValue(coreRelClass),
      } as unknown as CoreNavigationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.NavigationProperty;
      expect(property.relationshipClass.fullName).toBe("SchemaName.RelationshipClass");
    });
  });

  describe("Enumeration property", () => {
    it("creates property from core property", () => {
      const coreProperty = {
        ...propertyStub,
        isEnumeration: () => true,
        name: "test-property",
        label: "Test property",
        extendedTypeName: "extended",
        enumeration: undefined,
      } as unknown as CoreEnumerationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.EnumerationProperty;
      expect(property.class).toBe(propertyClass);
      expect(property.isArray()).toBe(false);
      expect(property.isEnumeration()).toBe(true);
      expect(property.isNavigation()).toBe(false);
      expect(property.isPrimitive()).toBe(false);
      expect(property.isStruct()).toBe(false);
      expect(property.name).toBe(coreProperty.name);
      expect(property.label).toBe(coreProperty.label);
      expect(property.extendedTypeName).toBe(coreProperty.extendedTypeName);
    });

    it("returns undefined enumeration when not set", () => {
      const coreProperty = {
        ...propertyStub,
        isEnumeration: () => true,
        name: "test-property",
        enumeration: undefined,
      } as unknown as CoreEnumerationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.EnumerationProperty;
      expect(property.enumeration).toBeUndefined();
    });

    it("returns undefined enumeration when lookupItemSync returns undefined", () => {
      const enumRef = {};
      const coreSchema = { lookupItemSync: vi.fn().mockReturnValue(undefined) };
      const coreProperty = {
        ...propertyStub,
        isEnumeration: () => true,
        name: "test-property",
        enumeration: enumRef,
        class: { schema: coreSchema },
      } as unknown as CoreEnumerationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.EnumerationProperty;
      expect(property.enumeration).toBeUndefined();
    });

    it("returns enumeration via schema lookup", () => {
      const coreEnumeration = {
        schema: stubSchema("SchemaName"),
        isStrict: false,
        type: undefined,
        enumerators: [] as CoreEnumerator<number>[],
        fullName: "SchemaName.TestEnum",
        name: "TestEnum",
      };
      const enumRef = {}; // simulates LazyLoadedEnumeration (SchemaItemKey & Promise<Enumeration>)
      const coreSchema = { lookupItemSync: vi.fn().mockReturnValue(coreEnumeration) };
      const coreProperty = {
        ...propertyStub,
        isEnumeration: () => true,
        name: "test-property",
        enumeration: enumRef,
        class: { schema: coreSchema },
      } as unknown as CoreEnumerationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.EnumerationProperty;
      expect(property.enumeration).toBeDefined();
      expect(coreSchema.lookupItemSync).toHaveBeenCalledWith(enumRef);
    });

    describe("ECEnumeration implementation", () => {
      const coreEnumeration = {
        schema: stubSchema("SchemaName"),
        isStrict: false,
        type: undefined as PrimitiveType | undefined,
        enumerators: new Array<CoreEnumerator<number>>(),
        fullName: "SchemaName.TestEnum",
        name: "TestEnum",
      };
      let property: EC.EnumerationProperty;

      beforeEach(() => {
        const enumRef = {};
        const coreSchema = { lookupItemSync: vi.fn().mockReturnValue(coreEnumeration) };
        const coreProperty = {
          ...propertyStub,
          isEnumeration: () => true,
          name: "test-property",
          enumeration: enumRef,
          class: { schema: coreSchema },
        } as unknown as CoreEnumerationProperty;
        property = createECProperty(coreProperty, propertyClass) as EC.EnumerationProperty;
      });

      it("returns `isStrict` flag", () => {
        coreEnumeration.isStrict = true;
        expect(property.enumeration!.isStrict).toBe(true);
      });

      it("maps enumeration type", () => {
        const typesMap: [PrimitiveType | undefined, string][] = [
          [PrimitiveType.String, "String"],
          [PrimitiveType.Integer, "Number"],
          [undefined, "Number"],
        ];
        for (const [coreType, expectation] of typesMap) {
          coreEnumeration.type = coreType;
          const enumRef2 = {};
          const coreSchema2 = { lookupItemSync: vi.fn().mockReturnValue(coreEnumeration) };
          const prop = createECProperty(
            {
              ...propertyStub,
              isEnumeration: () => true,
              name: "test-property",
              enumeration: enumRef2,
              class: { schema: coreSchema2 },
            } as unknown as CoreEnumerationProperty,
            propertyClass,
          ) as EC.EnumerationProperty;
          expect(prop.enumeration!.type).toBe(expectation);
        }
      });

      it("returns enumerators", () => {
        coreEnumeration.enumerators = [
          { name: "1", value: 1, label: "One", description: "Test one" },
          { name: "2", value: 2 },
        ];
        expect(property.enumeration!.enumerators).toEqual(coreEnumeration.enumerators);
      });
    });
  });

  describe("Struct property", () => {
    it("creates property from core property", () => {
      const coreProperty = {
        ...propertyStub,
        isStruct: () => true,
        name: "test-property",
        label: "Test property",
      } as unknown as CoreStructProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.StructProperty;
      expect(property.class).toBe(propertyClass);
      expect(property.isArray()).toBe(false);
      expect(property.isEnumeration()).toBe(false);
      expect(property.isNavigation()).toBe(false);
      expect(property.isPrimitive()).toBe(false);
      expect(property.isStruct()).toBe(true);
      expect(property.name).toBe(coreProperty.name);
      expect(property.label).toBe(coreProperty.label);
    });

    it("returns struct class", () => {
      const coreProperty = {
        ...propertyStub,
        isStruct: () => true,
        name: "test-property",
        structClass: { fullName: "SchemaName.StructClass", schema: stubSchema("SchemaName") },
      } as unknown as CoreStructProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.StructProperty;
      expect(property.structClass.fullName).toBe("SchemaName.StructClass");
    });
  });

  describe("Array property", () => {
    it("creates primitive array property from core property", () => {
      const coreProperty = {
        ...propertyStub,
        isArray: () => true,
        isPrimitive: () => true,
        name: "test-property",
        label: "Test property",
        minOccurs: 123,
        maxOccurs: 456,
      } as unknown as CorePrimitiveArrayProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.PrimitiveArrayProperty;
      expect(property.isArray()).toBe(true);
      expect(property.isPrimitive()).toBe(true);
      expect(property.isEnumeration()).toBe(false);
      expect(property.minOccurs).toBe(123);
      expect(property.maxOccurs).toBe(456);
    });

    it("creates enumeration array property from core property", () => {
      const coreProperty = {
        ...propertyStub,
        isArray: () => true,
        isEnumeration: () => true,
        name: "test-property",
        label: "Test property",
        minOccurs: 123,
        maxOccurs: 456,
        enumeration: undefined,
      } as unknown as CoreEnumerationArrayProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.EnumerationArrayProperty;
      expect(property.isArray()).toBe(true);
      expect(property.isEnumeration()).toBe(true);
      expect(property.isPrimitive()).toBe(false);
      expect(property.minOccurs).toBe(123);
      expect(property.maxOccurs).toBe(456);
    });

    it("creates struct array property from core property", () => {
      const coreProperty = {
        ...propertyStub,
        isArray: () => true,
        isStruct: () => true,
        name: "test-property",
        label: "Test property",
        minOccurs: 123,
        maxOccurs: 456,
      } as unknown as CoreStructArrayProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.StructArrayProperty;
      expect(property.isArray()).toBe(true);
      expect(property.isStruct()).toBe(true);
      expect(property.isPrimitive()).toBe(false);
      expect(property.minOccurs).toBe(123);
      expect(property.maxOccurs).toBe(456);
    });
  });
});
