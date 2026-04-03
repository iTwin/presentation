/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { assert } from "@itwin/core-bentley";
import {
  ECClass as CoreClass,
  EnumerationArrayProperty as CoreEnumerationArrayProperty,
  EnumerationProperty as CoreEnumerationProperty,
  Enumerator as CoreEnumerator,
  NavigationProperty as CoreNavigationProperty,
  PrimitiveArrayProperty as CorePrimitiveArrayProperty,
  PrimitiveProperty as CorePrimitiveProperty,
  Schema as CoreSchema,
  StructArrayProperty as CoreStructArrayProperty,
  StructProperty as CoreStructProperty,
  PrimitiveType,
  RelationshipMultiplicity,
  SchemaContext,
  SchemaItemType,
  SchemaKey,
  StrengthDirection,
} from "@itwin/ecschema-metadata";
import { EC } from "@itwin/presentation-shared";
import { createECSchemaProvider } from "../core-interop/Metadata.js";
import { createECClass, createECProperty, createECSchema } from "../core-interop/MetadataInternal.js";

describe("createECSchemaProvider", () => {
  describe("getSchema", () => {
    it("returns schema from schema context", async () => {
      const schemaContext = {
        getSchema: vi.fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>().mockImplementation(async (key: SchemaKey) => {
          if (key.compareByName("x")) {
            return {
              name: "y",
            } as unknown as CoreSchema;
          }
          return undefined;
        }),
      };

      const provider = createECSchemaProvider(schemaContext as unknown as SchemaContext);
      const schema = await provider.getSchema("x");
      assert(schema !== undefined);

      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
      const calledKey = schemaContext.getSchema.mock.calls[0][0];
      expect(calledKey.compareByName("x")).toBe(true);
      expect(schema.name).toBe("y");
      expect(typeof schema.getClass === "function").toBe(true);
    });

    it(`returns undefined on "schema not found" error`, async () => {
      const schemaContext = {
        getSchema: vi.fn<(key: SchemaKey) => Promise<CoreSchema>>().mockRejectedValue(new Error("schema not found")),
      };

      const provider = createECSchemaProvider(schemaContext as unknown as SchemaContext);
      expect(await provider.getSchema("x")).toBeUndefined();
    });

    it("re-throws SchemaContext errors", async () => {
      const schemaContext = {
        getSchema: vi.fn<(key: SchemaKey) => Promise<CoreSchema>>().mockRejectedValue(new Error("Unknown error")),
      };

      const provider = createECSchemaProvider(schemaContext as unknown as SchemaContext);
      await expect(provider.getSchema("x")).rejects.toThrow();
      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
    });

    it("returns undefined from schema context", async () => {
      const schemaContext = {
        getSchema: vi.fn().mockResolvedValue(undefined),
      };

      const provider = createECSchemaProvider(schemaContext);
      const schema = await provider.getSchema("x");

      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
      const calledKey = schemaContext.getSchema.mock.calls[0][0];
      expect(calledKey.compareByName("x")).toBe(true);
      expect(schema).toBeUndefined();
    });

    it("doesn't repeat requests for the same schema", async () => {
      const schemaContext = {
        getSchema: vi.fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>().mockResolvedValue({ name: "x" } as unknown as CoreSchema),
      };

      const provider = createECSchemaProvider(schemaContext as unknown as SchemaContext);
      await Promise.all([provider.getSchema("x"), provider.getSchema("x")]);

      expect(schemaContext.getSchema).toHaveBeenCalledOnce();
    });

    it("handles duplicate schema in cache error", async () => {
      const schemaContext = {
        getSchema: vi
          .fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>()
          .mockRejectedValueOnce(new Error("The schema, x.01.02.03, already exists within this cache"))
          .mockResolvedValueOnce({ name: "x" } as unknown as CoreSchema),
      };

      const provider = createECSchemaProvider(schemaContext as unknown as SchemaContext);
      await provider.getSchema("x");

      expect(schemaContext.getSchema).toHaveBeenCalledTimes(2);
    });
  });
});

describe("createECSchema", () => {
  describe("getClass", () => {
    it("returns class from core schema", async () => {
      const coreSchema = {
        name: "s",
        getItem: vi.fn().mockResolvedValue({
          fullName: "s.c",
          name: "c",
          label: "C",
          schemaItemType: SchemaItemType.EntityClass,
        }),
      };

      const schema = createECSchema(coreSchema as unknown as CoreSchema);
      const result = await schema.getClass("c");
      assert(result !== undefined);

      expect(coreSchema.getItem).toHaveBeenCalledExactlyOnceWith("c");
      expect(result.schema.name).toBe("s");
      expect(result.fullName).toBe("s.c");
      expect(result.name).toBe("c");
      expect(result.label).toBe("C");
      expect(typeof result.is === "function").toBe(true);
    });

    it("returns undefined from core schema", async () => {
      const coreSchema = {
        name: "s",
        getItem: vi.fn().mockResolvedValue(undefined),
      };

      const schema = createECSchema(coreSchema as unknown as CoreSchema);
      const result = await schema.getClass("c");

      expect(coreSchema.getItem).toHaveBeenCalledExactlyOnceWith("c");
      expect(result).toBeUndefined();
    });
  });
});

describe("createECClass", () => {
  const schema: EC.Schema = {
    name: "s",
    async getClass() {
      return undefined;
    },
  };

  it("creates class using schema from core class", async () => {
    const coreClass = {
      schemaItemType: SchemaItemType.EntityClass,
      fullName: "s.c",
      name: "c",
      label: "C",
      schema: { name: "core-schema" },
    } as unknown as CoreClass;
    const result = createECClass(coreClass);
    expect(result.schema.name).toBe("core-schema");
  });

  it("creates entity class from core class", async () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.EntityClass,
    };
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

  it("creates relationship class from core class", async () => {
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
    expect(result.schema.name).toBe("s");
    expect(result.fullName).toBe("s.c");
    expect(result.name).toBe("c");
    expect(result.label).toBe("C");
    expect(typeof result.is === "function").toBe(true);
  });

  it("creates struct class from core class", async () => {
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
    expect(result.schema.name).toBe("s");
    expect(result.fullName).toBe("s.c");
    expect(result.name).toBe("c");
    expect(result.label).toBe("C");
    expect(typeof result.is === "function").toBe(true);
  });

  it("creates mixin from core class", async () => {
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
    expect(result.schema.name).toBe("s");
    expect(result.fullName).toBe("s.c");
    expect(result.name).toBe("c");
    expect(result.label).toBe("C");
    expect(typeof result.is === "function").toBe(true);
  });

  it("throws when creating class from non-class core schema item", async () => {
    const coreClass = {
      schemaItemType: SchemaItemType.Constant,
      fullName: "s.c",
      name: "c",
      label: "C",
    } as unknown as CoreClass;
    expect(() => createECClass(coreClass, schema)).toThrow();
  });

  describe("is", () => {
    const coreClass = {
      schemaItemType: SchemaItemType.EntityClass,
      fullName: "s.c",
      name: "c",
      label: "C",
      is: vi.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
      coreClass.is.mockClear();
    });

    it("handles CoreClass override", async () => {
      const class1 = createECClass(coreClass as unknown as CoreClass, schema);
      const class2 = createECClass(
        {
          schemaItemType: SchemaItemType.EntityClass,
          fullName: "s.c2",
          name: "c2",
          label: "C2",
        } as unknown as CoreClass,
        schema,
      );
      const result = await class1.is(class2);

      expect(coreClass.is).toHaveBeenCalledExactlyOnceWith("c2", "s");
      expect(result).toBe(true);
    });

    it("handles class and schema names override", async () => {
      const class1 = createECClass(coreClass as unknown as CoreClass, schema);
      const result = await class1.is("a", "b");

      expect(coreClass.is).toHaveBeenCalledExactlyOnceWith("a", "b");
      expect(result).toBe(true);
    });
  });

  describe("getProperties", () => {
    it("returns properties from core class", async () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        label: "C",
        getProperties: vi.fn().mockResolvedValue([
          {
            isArray: () => false,
            isStruct: () => false,
            isEnumeration: () => false,
            isNavigation: () => false,
            isPrimitive: () => true,
          },
        ]),
      } as unknown as CoreClass;
      const ecClass = createECClass(coreClass, schema);
      const properties = await ecClass.getProperties();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreClass.getProperties).toHaveBeenCalledOnce();
      expect(properties.length).toBeGreaterThan(0);
    });
  });

  describe("getProperty", () => {
    it("returns property from core class", async () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        label: "C",
        getProperty: vi.fn().mockResolvedValue({
          isArray: () => false,
          isStruct: () => false,
          isEnumeration: () => false,
          isNavigation: () => false,
          isPrimitive: () => true,
        }),
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      const prop = await ecClass.getProperty("p");

      expect(coreClass.getProperty).toHaveBeenCalledExactlyOnceWith("p", false);
      expect(prop).toBeDefined();
    });

    it("returns undefined from core class", async () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        label: "C",
        getProperty: vi.fn().mockResolvedValue(undefined),
      };
      const ecClass = createECClass(coreClass as unknown as CoreClass, schema);
      const prop = await ecClass.getProperty("p");

      expect(coreClass.getProperty).toHaveBeenCalledExactlyOnceWith("p", false);
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
      it("returns forward direction from core relationship", async () => {
        const rel = createECClass(
          { ...coreRelationshipClass, strengthDirection: StrengthDirection.Forward } as unknown as CoreClass,
          schema,
        ) as EC.RelationshipClass;
        expect(rel.direction).toBe("Forward");
      });

      it("returns backward direction from core relationship", async () => {
        const rel = createECClass(
          { ...coreRelationshipClass, strengthDirection: StrengthDirection.Backward } as unknown as CoreClass,
          schema,
        ) as EC.RelationshipClass;
        expect(rel.direction).toBe("Backward");
      });
    });

    describe("source & target", () => {
      it("returns source constraint", () => {
        const rel = createECClass({ ...coreRelationshipClass, source: {} } as unknown as CoreClass, schema) as EC.RelationshipClass;
        expect(rel.source).toBeDefined();
      });

      it("returns target constraint", () => {
        const rel = createECClass({ ...coreRelationshipClass, target: {} } as unknown as CoreClass, schema) as EC.RelationshipClass;
        expect(rel.target).toBeDefined();
      });

      describe("ECRelationshipConstraint implementation", () => {
        it("returns undefined multiplicity from core constraint", () => {
          const rel = createECClass({ ...coreRelationshipClass, source: { multiplicity: undefined } } as unknown as CoreClass, schema) as EC.RelationshipClass;
          expect(rel.source.multiplicity).toBeUndefined();
        });

        it("returns multiplicity from core constraint", () => {
          const rel = createECClass(
            // eslint-disable-next-line @itwin/no-internal
            { ...coreRelationshipClass, source: { multiplicity: new RelationshipMultiplicity(123, 456) } } as unknown as CoreClass,
            schema,
          ) as EC.RelationshipClass;
          expect(rel.source.multiplicity).toEqual({ lowerLimit: 123, upperLimit: 456 });
        });

        it("returns polymorphic flag from core constraint", () => {
          [
            { in: undefined, expectation: false },
            { in: false, expectation: false },
            { in: true, expectation: true },
          ].forEach((testEntry) => {
            const rel = createECClass(
              { ...coreRelationshipClass, source: { polymorphic: testEntry.in } } as unknown as CoreClass,
              schema,
            ) as EC.RelationshipClass;
            expect(rel.source.polymorphic).toBe(testEntry.expectation);
          });
        });

        it("returns abstract constraint from core constraint", async () => {
          const coreAbstractConstraint = {
            schemaItemType: SchemaItemType.EntityClass,
            fullName: "Schema.TestAbstractConstraint",
            name: "TestAbstractConstraint",
            label: "Test abstract constraint",
          } as unknown as CoreClass;
          const rel = createECClass(
            { ...coreRelationshipClass, source: { abstractConstraint: Promise.resolve(coreAbstractConstraint) } } as unknown as CoreClass,
            schema,
          ) as EC.RelationshipClass;
          const constraint = (await rel.source.abstractConstraint)!;
          expect(constraint.isEntityClass()).toBe(true);
          expect(constraint.fullName).toBe(coreAbstractConstraint.fullName);
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
  };

  describe("Primitive property", () => {
    it("creates property from core property", async () => {
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

    it("maps primitive types", async () => {
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

    it("maps kind of quantity", async () => {
      const coreProperty = {
        ...propertyStub,
        isPrimitive: () => true,
        name: "test-property",
        kindOfQuantity: Promise.resolve({
          fullName: "SchemaName.TestKoq",
          schema: {
            name: "SchemaName",
          },
        }),
      } as unknown as CorePrimitiveProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.PrimitiveProperty;
      const koq = (await property.kindOfQuantity)!;
      expect(koq.fullName).toBe("SchemaName.TestKoq");

      expect(await createECProperty({ ...coreProperty, kindOfQuantity: undefined } as CorePrimitiveProperty, propertyClass).kindOfQuantity).toBeUndefined();
    });
  });

  describe("Navigation property", () => {
    it("creates property from core property", async () => {
      const coreProperty = {
        ...propertyStub,
        isNavigation: () => true,
        name: "test-property",
        label: "Test property",
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

    it("maps direction", async () => {
      const map = [
        [StrengthDirection.Backward, "Backward"],
        [StrengthDirection.Forward, "Forward"],
      ];
      map.forEach(([coreDirection, expectation]) => {
        const coreProperty = {
          ...propertyStub,
          isNavigation: () => true,
          name: "test-property",
          direction: coreDirection,
        } as unknown as CoreNavigationProperty;
        const property = createECProperty(coreProperty, propertyClass) as EC.NavigationProperty;
        expect(property.direction).toBe(expectation);
      });
    });

    it("returns relationship class", async () => {
      const coreProperty = {
        ...propertyStub,
        isNavigation: () => true,
        name: "test-property",
        relationshipClass: Promise.resolve({
          fullName: "SchemaName.RelationshipClass",
          schema: {
            name: "SchemaName",
          },
        }),
      } as unknown as CoreNavigationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.NavigationProperty;
      const relationshipClass = await property.relationshipClass;
      expect(relationshipClass.fullName).toBe("SchemaName.RelationshipClass");
    });
  });

  describe("Enumeration property", () => {
    it("creates property from core property", async () => {
      const coreProperty = {
        ...propertyStub,
        isEnumeration: () => true,
        name: "test-property",
        label: "Test property",
        extendedTypeName: "extended",
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

    it("returns enumeration", async () => {
      const coreProperty = {
        ...propertyStub,
        isEnumeration: () => true,
        name: "test-property",
        enumeration: Promise.resolve({
          schema: {
            name: "SchemaName",
          },
        }),
      } as unknown as CoreEnumerationProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.EnumerationProperty;
      expect(await property.enumeration).toBeDefined();
    });

    describe("ECEnumeration implementation", () => {
      const coreEnumeration = {
        schema: {
          name: "SchemaName",
        },
        isStrict: false,
        type: undefined,
        enumerators: new Array<CoreEnumerator<number>>(),
      };
      const coreEnumerationProperty = {
        ...propertyStub,
        isEnumeration: () => true,
        name: "test-property",
        enumeration: Promise.resolve(coreEnumeration),
      } as unknown as CoreEnumerationProperty;
      let property: EC.EnumerationProperty;

      beforeEach(async () => {
        property = createECProperty(coreEnumerationProperty, propertyClass) as EC.EnumerationProperty;
      });

      it("returns `isStrict` flag", async () => {
        coreEnumeration.isStrict = true;
        const enumeration = (await property.enumeration)!;
        expect(enumeration.isStrict).toBe(true);
      });

      it("maps enumeration type", async () => {
        const typesMap = [
          [PrimitiveType.String, "String"],
          [PrimitiveType.Integer, "Number"],
          [undefined, "Number"],
        ];
        const typeStub = vi.spyOn(coreEnumeration as any, "type", "get");
        for (const [coreType, expectation] of typesMap) {
          typeStub.mockReturnValue(coreType);
          const enumeration = (await property.enumeration)!;
          expect(enumeration.type).toBe(expectation);
        }
      });

      it("returns enumerators", async () => {
        coreEnumeration.enumerators = [
          { name: "1", value: 1, label: "One", description: "Test one" },
          { name: "2", value: 2 },
        ];
        const enumeration = (await property.enumeration)!;
        expect(enumeration.enumerators).toEqual(coreEnumeration.enumerators);
      });
    });
  });

  describe("Struct property", () => {
    it("creates property from core property", async () => {
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

    it("returns struct class", async () => {
      const coreProperty = {
        ...propertyStub,
        isStruct: () => true,
        name: "test-property",
        structClass: {
          fullName: "SchemaName.StructClass",
          schema: {
            name: "SchemaName",
          },
        },
      } as unknown as CoreStructProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.StructProperty;
      expect(property.structClass.fullName).toBe("SchemaName.StructClass");
    });
  });

  describe("Array property", () => {
    it("creates primitive array property from core property", async () => {
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
      expect(property.class).toBe(propertyClass);
      expect(property.isArray()).toBe(true);
      expect(property.isEnumeration()).toBe(false);
      expect(property.isNavigation()).toBe(false);
      expect(property.isPrimitive()).toBe(true);
      expect(property.isStruct()).toBe(false);
      expect(property.name).toBe(coreProperty.name);
      expect(property.label).toBe(coreProperty.label);
      expect(property.minOccurs).toBe(123);
      expect(property.maxOccurs).toBe(456);
    });

    it("creates enumeration array property from core property", async () => {
      const coreProperty = {
        ...propertyStub,
        isArray: () => true,
        isEnumeration: () => true,
        name: "test-property",
        label: "Test property",
        minOccurs: 123,
        maxOccurs: 456,
      } as unknown as CoreEnumerationArrayProperty;
      const property = createECProperty(coreProperty, propertyClass) as EC.EnumerationArrayProperty;
      expect(property.class).toBe(propertyClass);
      expect(property.isArray()).toBe(true);
      expect(property.isEnumeration()).toBe(true);
      expect(property.isNavigation()).toBe(false);
      expect(property.isPrimitive()).toBe(false);
      expect(property.isStruct()).toBe(false);
      expect(property.name).toBe(coreProperty.name);
      expect(property.label).toBe(coreProperty.label);
      expect(property.minOccurs).toBe(123);
      expect(property.maxOccurs).toBe(456);
    });

    it("creates struct array property from core property", async () => {
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
      expect(property.class).toBe(propertyClass);
      expect(property.isArray()).toBe(true);
      expect(property.isEnumeration()).toBe(false);
      expect(property.isNavigation()).toBe(false);
      expect(property.isPrimitive()).toBe(false);
      expect(property.isStruct()).toBe(true);
      expect(property.name).toBe(coreProperty.name);
      expect(property.label).toBe(coreProperty.label);
      expect(property.minOccurs).toBe(123);
      expect(property.maxOccurs).toBe(456);
    });
  });
});
