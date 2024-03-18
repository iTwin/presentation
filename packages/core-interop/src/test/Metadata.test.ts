/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
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
import {
  ECClass,
  ECEnumerationArrayProperty,
  ECEnumerationProperty,
  ECNavigationProperty,
  ECPrimitiveArrayProperty,
  ECPrimitiveProperty,
  ECPrimitiveType,
  ECRelationshipClass,
  ECSchema,
  ECStructArrayProperty,
  ECStructProperty,
} from "@itwin/presentation-hierarchy-builder";
import { createMetadataProvider } from "../core-interop/Metadata";
import { createECClass, createECProperty, createECSchema } from "../core-interop/MetadataInternal";

describe("createMetadataProvider", () => {
  describe("getSchema", () => {
    it("returns schema from schema context", async () => {
      const matchSchemaName = sinon.match((key: SchemaKey) => key.compareByName("x"));
      const schemaContext = {
        getSchema: sinon
          .stub<[SchemaKey], CoreSchema>()
          .withArgs(matchSchemaName)
          .resolves({
            name: "y",
          } as unknown as CoreSchema),
      } as unknown as SchemaContext;

      const provider = createMetadataProvider(schemaContext);
      const schema = await provider.getSchema("x");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(schemaContext.getSchema).to.be.calledOnceWith(matchSchemaName);
      expect(schema!.name).to.eq("y");
      expect(typeof schema!.getClass === "function").to.be.true;
    });

    it("returns undefined from schema context", async () => {
      const matchSchemaName = sinon.match((key: SchemaKey) => key.compareByName("x"));
      const schemaContext = {
        getSchema: sinon.stub().resolves(undefined),
      } as unknown as SchemaContext;

      const provider = createMetadataProvider(schemaContext);
      const schema = await provider.getSchema("x");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(schemaContext.getSchema).to.be.calledOnceWith(matchSchemaName);
      expect(schema).to.be.undefined;
    });
  });
});

describe("createECSchema", () => {
  describe("getClass", () => {
    it("returns class from core schema", async () => {
      const coreSchema = {
        name: "s",
        getItem: sinon.stub().resolves({
          fullName: "s.c",
          name: "c",
          label: "C",
          schemaItemType: SchemaItemType.EntityClass,
        }),
      } as unknown as CoreSchema;

      const schema = createECSchema(coreSchema);
      const result = await schema.getClass("c");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreSchema.getItem).to.be.calledOnceWith("c");
      expect(result!.schema.name).to.eq("s");
      expect(result!.fullName).to.eq("s.c");
      expect(result!.name).to.eq("c");
      expect(result!.label).to.eq("C");
      expect(typeof result!.is === "function").to.be.true;
    });

    it("returns undefined from core schema", async () => {
      const coreSchema = {
        name: "s",
        getItem: sinon.stub().resolves(undefined),
      } as unknown as CoreSchema;

      const schema = createECSchema(coreSchema);
      const result = await schema.getClass("c");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreSchema.getItem).to.be.calledOnceWith("c");
      expect(result).to.be.undefined;
    });
  });
});

describe("createECClass", () => {
  const schema: ECSchema = {
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
    expect(result.schema.name).to.eq("core-schema");
  });

  it("creates entity class from core class", async () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.EntityClass,
    } as unknown as CoreClass;
    const result = createECClass(coreClass, schema);
    expect(result.isEntityClass()).to.be.true;
    expect(result.isRelationshipClass()).to.be.false;
    expect(result.isStructClass()).to.be.false;
    expect(result.isMixin()).to.be.false;
    expect(result.schema.name).to.eq("s");
    expect(result.fullName).to.eq("s.c");
    expect(result.name).to.eq("c");
    expect(result.label).to.eq("C");
    expect(typeof result.is === "function").to.be.true;
  });

  it("creates relationship class from core class", async () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.RelationshipClass,
    } as unknown as CoreClass;
    const result = createECClass(coreClass, schema);
    expect(result.isEntityClass()).to.be.false;
    expect(result.isRelationshipClass()).to.be.true;
    expect(result.isStructClass()).to.be.false;
    expect(result.isMixin()).to.be.false;
    expect(result.schema.name).to.eq("s");
    expect(result.fullName).to.eq("s.c");
    expect(result.name).to.eq("c");
    expect(result.label).to.eq("C");
    expect(typeof result.is === "function").to.be.true;
  });

  it("creates struct class from core class", async () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.StructClass,
    } as unknown as CoreClass;
    const result = createECClass(coreClass, schema);
    expect(result.isEntityClass()).to.be.false;
    expect(result.isRelationshipClass()).to.be.false;
    expect(result.isStructClass()).to.be.true;
    expect(result.isMixin()).to.be.false;
    expect(result.schema.name).to.eq("s");
    expect(result.fullName).to.eq("s.c");
    expect(result.name).to.eq("c");
    expect(result.label).to.eq("C");
    expect(typeof result.is === "function").to.be.true;
  });

  it("creates mixin from core class", async () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      schemaItemType: SchemaItemType.Mixin,
    } as unknown as CoreClass;
    const result = createECClass(coreClass, schema);
    expect(result.isEntityClass()).to.be.false;
    expect(result.isRelationshipClass()).to.be.false;
    expect(result.isStructClass()).to.be.false;
    expect(result.isMixin()).to.be.true;
    expect(result.schema.name).to.eq("s");
    expect(result.fullName).to.eq("s.c");
    expect(result.name).to.eq("c");
    expect(result.label).to.eq("C");
    expect(typeof result.is === "function").to.be.true;
  });

  it("throws when creating class from non-class core schema item", async () => {
    const coreClass = {
      schemaItemType: SchemaItemType.Constant,
      fullName: "s.c",
      name: "c",
      label: "C",
    } as unknown as CoreClass;
    expect(() => createECClass(coreClass, schema)).to.throw();
  });

  describe("is", () => {
    const coreClass = {
      schemaItemType: SchemaItemType.EntityClass,
      fullName: "s.c",
      name: "c",
      label: "C",
      is: sinon.stub().resolves(true),
    };

    beforeEach(() => {
      coreClass.is.resetHistory();
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

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreClass.is).to.be.calledOnceWithExactly("c2", "s");
      expect(result).to.be.true;
    });

    it("handles class and schema names override", async () => {
      const class1 = createECClass(coreClass as unknown as CoreClass, schema);
      const result = await class1.is("a", "b");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreClass.is).to.be.calledOnceWithExactly("a", "b");
      expect(result).to.be.true;
    });
  });

  describe("getAllBaseClasses", () => {
    it("returns all base classes from core class", async () => {
      const baseClasses: CoreClass[] = [];
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        label: "C",
        async *getAllBaseClasses() {
          for (const base of baseClasses) {
            yield base;
          }
        },
      } as unknown as CoreClass;

      baseClasses.push(
        ...[...Array(3).keys()].map(
          (i): CoreClass =>
            ({
              ...coreClass,
              fullName: `s.c${i}`,
              name: `c${i}`,
            }) as unknown as CoreClass,
        ),
      );

      const ecClass = createECClass(coreClass, schema);
      let index = 0;
      for await (const item of ecClass.getAllBaseClasses()) {
        expect(item).to.deep.eq(createECClass(baseClasses[index++], schema));
      }
    });
  });

  describe("getProperties", () => {
    it("returns properties from core class", async () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        label: "C",
        getProperties: sinon.stub().resolves([
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
      expect(coreClass.getProperties).to.be.calledOnce;
      expect(properties).to.not.be.empty;
    });
  });

  describe("getProperty", () => {
    it("returns property from core class", async () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        label: "C",
        getProperty: sinon.stub().resolves({
          isArray: () => false,
          isStruct: () => false,
          isEnumeration: () => false,
          isNavigation: () => false,
          isPrimitive: () => true,
        }),
      } as unknown as CoreClass;
      const ecClass = createECClass(coreClass, schema);
      const prop = await ecClass.getProperty("p");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreClass.getProperty).to.be.calledOnceWith("p", true);
      expect(prop).to.not.be.undefined;
    });

    it("returns undefined from core class", async () => {
      const coreClass = {
        schemaItemType: SchemaItemType.EntityClass,
        fullName: "s.c",
        name: "c",
        label: "C",
        getProperty: sinon.stub().resolves(undefined),
      } as unknown as CoreClass;
      const ecClass = createECClass(coreClass, schema);
      const prop = await ecClass.getProperty("p");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreClass.getProperty).to.be.calledOnceWith("p", true);
      expect(prop).to.be.undefined;
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
        ) as ECRelationshipClass;
        expect(rel.direction).to.eq("Forward");
      });

      it("returns backward direction from core relationship", async () => {
        const rel = createECClass(
          { ...coreRelationshipClass, strengthDirection: StrengthDirection.Backward } as unknown as CoreClass,
          schema,
        ) as ECRelationshipClass;
        expect(rel.direction).to.eq("Backward");
      });
    });

    describe("source & target", () => {
      it("returns source constraint", () => {
        const rel = createECClass({ ...coreRelationshipClass, source: {} } as unknown as CoreClass, schema) as ECRelationshipClass;
        expect(rel.source).to.not.be.undefined;
      });

      it("returns target constraint", () => {
        const rel = createECClass({ ...coreRelationshipClass, target: {} } as unknown as CoreClass, schema) as ECRelationshipClass;
        expect(rel.target).to.not.be.undefined;
      });

      describe("ECRelationshipConstraint implementation", () => {
        it("returns undefined multiplicity from core constraint", () => {
          const rel = createECClass({ ...coreRelationshipClass, source: { multiplicity: undefined } } as unknown as CoreClass, schema) as ECRelationshipClass;
          expect(rel.source.multiplicity).to.be.undefined;
        });

        it("returns multiplicity from core constraint", () => {
          const rel = createECClass(
            { ...coreRelationshipClass, source: { multiplicity: new RelationshipMultiplicity(123, 456) } } as unknown as CoreClass,
            schema,
          ) as ECRelationshipClass;
          expect(rel.source.multiplicity).to.deep.eq({ lowerLimit: 123, upperLimit: 456 });
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
            ) as ECRelationshipClass;
            expect(rel.source.polymorphic).to.eq(testEntry.expectation);
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
          ) as ECRelationshipClass;
          const constraint = (await rel.source.abstractConstraint)!;
          expect(constraint.isEntityClass()).to.be.true;
          expect(constraint.fullName).to.eq(coreAbstractConstraint.fullName);
        });
      });
    });
  });
});

describe("createECProperty", () => {
  const propertyClass: ECClass = {} as unknown as ECClass;
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
      const property = createECProperty(coreProperty, propertyClass) as ECPrimitiveProperty;
      expect(property.class).to.eq(propertyClass);
      expect(property.isArray()).to.be.false;
      expect(property.isEnumeration()).to.be.false;
      expect(property.isNavigation()).to.be.false;
      expect(property.isPrimitive()).to.be.true;
      expect(property.isStruct()).to.be.false;
      expect(property.name).to.eq(coreProperty.name);
      expect(property.label).to.eq(coreProperty.label);
      expect(property.extendedTypeName).to.eq(coreProperty.extendedTypeName);
    });

    it("maps primitive types", async () => {
      const types: [PrimitiveType, ECPrimitiveType][] = [
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
        const property = createECProperty(coreProperty, propertyClass) as ECPrimitiveProperty;
        expect(property.primitiveType).to.eq(expectation);
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
        ) as ECPrimitiveProperty;
        expect(() => uninitializedProperty.primitiveType).to.throw();
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
      const property = createECProperty(coreProperty, propertyClass) as ECPrimitiveProperty;
      const koq = (await property.kindOfQuantity)!;
      expect(koq.fullName).to.eq("SchemaName.TestKoq");

      expect(await createECProperty({ ...coreProperty, kindOfQuantity: undefined } as CorePrimitiveProperty, propertyClass).kindOfQuantity).to.be.undefined;
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
      const property = createECProperty(coreProperty, propertyClass) as ECNavigationProperty;
      expect(property.class).to.eq(propertyClass);
      expect(property.isArray()).to.be.false;
      expect(property.isEnumeration()).to.be.false;
      expect(property.isNavigation()).to.be.true;
      expect(property.isPrimitive()).to.be.false;
      expect(property.isStruct()).to.be.false;
      expect(property.name).to.eq(coreProperty.name);
      expect(property.label).to.eq(coreProperty.label);
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
        const property = createECProperty(coreProperty, propertyClass) as ECNavigationProperty;
        expect(property.direction).to.eq(expectation);
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
      const property = createECProperty(coreProperty, propertyClass) as ECNavigationProperty;
      const relationshipClass = await property.relationshipClass;
      expect(relationshipClass.fullName).to.eq("SchemaName.RelationshipClass");
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
      const property = createECProperty(coreProperty, propertyClass) as ECEnumerationProperty;
      expect(property.class).to.eq(propertyClass);
      expect(property.isArray()).to.be.false;
      expect(property.isEnumeration()).to.be.true;
      expect(property.isNavigation()).to.be.false;
      expect(property.isPrimitive()).to.be.false;
      expect(property.isStruct()).to.be.false;
      expect(property.name).to.eq(coreProperty.name);
      expect(property.label).to.eq(coreProperty.label);
      expect(property.extendedTypeName).to.eq(coreProperty.extendedTypeName);
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
      const property = createECProperty(coreProperty, propertyClass) as ECEnumerationProperty;
      expect(await property.enumeration).to.not.be.undefined;
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
      let property: ECEnumerationProperty;

      beforeEach(async () => {
        property = createECProperty(coreEnumerationProperty, propertyClass) as ECEnumerationProperty;
      });

      it("returns `isStrict` flag", async () => {
        coreEnumeration.isStrict = true;
        const enumeration = (await property.enumeration)!;
        expect(enumeration.isStrict).to.be.true;
      });

      it("maps enumeration type", async () => {
        const typesMap = [
          [PrimitiveType.String, "String"],
          [PrimitiveType.Integer, "Number"],
          [undefined, "Number"],
        ];
        const typeStub = sinon.stub(coreEnumeration, "type");
        for (const [coreType, expectation] of typesMap) {
          typeStub.reset();
          typeStub.get(() => coreType);
          const enumeration = (await property.enumeration)!;
          expect(enumeration.type).to.eq(expectation);
        }
      });

      it("returns enumerators", async () => {
        coreEnumeration.enumerators = [
          { name: "1", value: 1, label: "One", description: "Test one" },
          { name: "2", value: 2 },
        ];
        const enumeration = (await property.enumeration)!;
        expect(enumeration.enumerators).to.deep.eq(coreEnumeration.enumerators);
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
      const property = createECProperty(coreProperty, propertyClass) as ECStructProperty;
      expect(property.class).to.eq(propertyClass);
      expect(property.isArray()).to.be.false;
      expect(property.isEnumeration()).to.be.false;
      expect(property.isNavigation()).to.be.false;
      expect(property.isPrimitive()).to.be.false;
      expect(property.isStruct()).to.be.true;
      expect(property.name).to.eq(coreProperty.name);
      expect(property.label).to.eq(coreProperty.label);
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
      const property = createECProperty(coreProperty, propertyClass) as ECStructProperty;
      expect(property.structClass.fullName).to.eq("SchemaName.StructClass");
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
      const property = createECProperty(coreProperty, propertyClass) as ECPrimitiveArrayProperty;
      expect(property.class).to.eq(propertyClass);
      expect(property.isArray()).to.be.true;
      expect(property.isEnumeration()).to.be.false;
      expect(property.isNavigation()).to.be.false;
      expect(property.isPrimitive()).to.be.true;
      expect(property.isStruct()).to.be.false;
      expect(property.name).to.eq(coreProperty.name);
      expect(property.label).to.eq(coreProperty.label);
      expect(property.minOccurs).to.eq(123);
      expect(property.maxOccurs).to.eq(456);
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
      const property = createECProperty(coreProperty, propertyClass) as ECEnumerationArrayProperty;
      expect(property.class).to.eq(propertyClass);
      expect(property.isArray()).to.be.true;
      expect(property.isEnumeration()).to.be.true;
      expect(property.isNavigation()).to.be.false;
      expect(property.isPrimitive()).to.be.false;
      expect(property.isStruct()).to.be.false;
      expect(property.name).to.eq(coreProperty.name);
      expect(property.label).to.eq(coreProperty.label);
      expect(property.minOccurs).to.eq(123);
      expect(property.maxOccurs).to.eq(456);
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
      const property = createECProperty(coreProperty, propertyClass) as ECStructArrayProperty;
      expect(property.class).to.eq(propertyClass);
      expect(property.isArray()).to.be.true;
      expect(property.isEnumeration()).to.be.false;
      expect(property.isNavigation()).to.be.false;
      expect(property.isPrimitive()).to.be.false;
      expect(property.isStruct()).to.be.true;
      expect(property.name).to.eq(coreProperty.name);
      expect(property.label).to.eq(coreProperty.label);
      expect(property.minOccurs).to.eq(123);
      expect(property.maxOccurs).to.eq(456);
    });
  });
});
