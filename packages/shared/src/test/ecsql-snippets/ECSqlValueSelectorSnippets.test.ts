/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  createConcatenatedValueJsonSelector,
  createConcatenatedValueStringSelector,
  createInstanceKeySelector,
  createNullableSelector,
  createPrimitivePropertyValueSelectorProps,
  createRawPrimitiveValueSelector,
  createRawPropertyValueSelector,
  TypedValueSelectClauseProps,
} from "../../shared/ecsql-snippets/ECSqlValueSelectorSnippets";
import { EC } from "../../shared/Metadata";
import { trimWhitespace } from "../../shared/Utils";
import { createECSchemaProviderStub } from "../MetadataProviderStub";

describe("TypedValueSelectClauseProps", () => {
  describe("isPrimitiveValueSelector", () => {
    it("returns correct result for different types of props", () => {
      expect(TypedValueSelectClauseProps.isPrimitiveValueSelector({ selector: "x" })).to.be.true;
      expect(TypedValueSelectClauseProps.isPrimitiveValueSelector({ value: 123, type: "Integer" })).to.be.false;
    });
  });
  describe("isPrimitiveValue", () => {
    it("returns correct result for different types of props", () => {
      expect(TypedValueSelectClauseProps.isPrimitiveValue({ selector: "x" })).to.be.false;
      expect(TypedValueSelectClauseProps.isPrimitiveValue({ value: 123, type: "Integer" })).to.be.true;
    });
  });
});

describe("createRawPropertyValueSelector", () => {
  it("returns selector for a property", () => {
    expect(createRawPropertyValueSelector("alias", "property-name")).to.eq("[alias].[property-name]");
  });

  it("returns selector for a property with component", () => {
    expect(createRawPropertyValueSelector("alias", "property-name", "component")).to.eq("[alias].[property-name].[component]");
  });
});

describe("createRawPrimitiveValueSelector", () => {
  it("returns NULL when value is `undefined`", () => {
    expect(createRawPrimitiveValueSelector(undefined)).to.eq("NULL");
  });

  it("returns julian day selector", () => {
    const now = new Date();
    expect(createRawPrimitiveValueSelector(now)).to.eq(`julianday('${now.toISOString()}')`);
  });

  it("returns point2d object", () => {
    expect(createRawPrimitiveValueSelector({ x: 1.23, y: 4.56 })).to.eq(`json_object('x', 1.23, 'y', 4.56)`);
  });

  it("returns point3d object", () => {
    expect(createRawPrimitiveValueSelector({ x: 1.23, y: 4.56, z: 7.89 })).to.eq(`json_object('x', 1.23, 'y', 4.56, 'z', 7.89)`);
  });

  it("returns string selector", () => {
    expect(createRawPrimitiveValueSelector("test")).to.eq(`'test'`);
  });

  it("returns Id selector", () => {
    expect(createRawPrimitiveValueSelector("0x123")).to.eq(`0x123`);
  });

  it("returns numeric selector", () => {
    expect(createRawPrimitiveValueSelector(1.23)).to.eq(`1.23`);
  });

  it("returns `true` selector", () => {
    expect(createRawPrimitiveValueSelector(true)).to.eq(`TRUE`);
  });

  it("returns `false` selector", () => {
    expect(createRawPrimitiveValueSelector(false)).to.eq(`FALSE`);
  });
});

describe("createPrimitivePropertyValueSelectorProps", () => {
  it("creates selector props for simple primitive property", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          isNavigation: () => false,
          primitiveType: "String",
          extendedTypeName: "Json",
        } as EC.PrimitiveProperty,
      ],
    });
    expect(
      await createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" }),
    ).to.deep.eq({
      selector: "[a].[p]",
      type: "String",
      extendedType: "Json",
    } satisfies TypedValueSelectClauseProps);
  });

  it("creates selector props for Double property", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          isNavigation: () => false,
          primitiveType: "Double",
          kindOfQuantity: Promise.resolve({ fullName: "TestSchema.TestKindOfQuantity" }),
          extendedTypeName: "TestExtendedType",
        } as EC.PrimitiveProperty,
      ],
    });
    expect(
      await createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" }),
    ).to.deep.eq({
      selector: "[a].[p]",
      type: "Double",
      extendedType: "TestExtendedType",
      koqName: "TestSchema.TestKindOfQuantity",
    } satisfies TypedValueSelectClauseProps);
  });

  it("creates selector props for Navigation property", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => false,
          isNavigation: () => true,
        } as EC.NavigationProperty,
      ],
    });
    expect(
      await createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" }),
    ).to.deep.eq({
      selector: "[a].[p].[Id]",
      type: "Id",
    } satisfies TypedValueSelectClauseProps);
  });

  it("creates selector props for Guid property", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          isNavigation: () => false,
          primitiveType: "Binary",
          extendedTypeName: "BeGuid",
        } as EC.PrimitiveProperty,
      ],
    });
    expect(
      await createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" }),
    ).to.deep.eq({
      selector: "GuidToStr([a].[p])",
      type: "String",
    } satisfies TypedValueSelectClauseProps);
  });

  it("creates selector props for Point2d property", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          isNavigation: () => false,
          primitiveType: "Point2d",
          extendedTypeName: "TestExtendedType",
        } as EC.PrimitiveProperty,
      ],
    });
    expect(
      await createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" }),
    ).to.deep.eq({
      selector: "json_object('x', [a].[p].[x], 'y', [a].[p].[y])",
      type: "Point2d",
      extendedType: "TestExtendedType",
    } satisfies TypedValueSelectClauseProps);
  });

  it("creates selector props for Point3d property", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          isNavigation: () => false,
          primitiveType: "Point3d",
          extendedTypeName: "TestExtendedType",
        } as EC.PrimitiveProperty,
      ],
    });
    expect(
      await createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" }),
    ).to.deep.eq({
      selector: "json_object('x', [a].[p].[x], 'y', [a].[p].[y], 'z', [a].[p].[z])",
      type: "Point3d",
      extendedType: "TestExtendedType",
    } satisfies TypedValueSelectClauseProps);
  });

  it("throws when requested class is not found", async () => {
    const schemaProvider = createECSchemaProviderStub();
    await expect(createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" })).to
      .eventually.be.rejected;
  });

  it("throws when requested property is not found", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [],
    });
    await expect(createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" })).to
      .eventually.be.rejected;
  });

  it("throws when requested property is not primitive", async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => false,
          isNavigation: () => false,
        } as EC.Property,
      ],
    });
    await expect(createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" })).to
      .eventually.be.rejected;
  });

  it('throws when requested property is "Binary"', async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          isNavigation: () => false,
          primitiveType: "Binary",
        } as EC.PrimitiveProperty,
      ],
    });
    await expect(createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" })).to
      .eventually.be.rejected;
  });

  it('throws when requested property is "IGeometry"', async () => {
    const schemaProvider = createECSchemaProviderStub();
    schemaProvider.stubEntityClass({
      schemaName: "x",
      className: "y",
      properties: [
        {
          name: "p",
          isPrimitive: () => true,
          isNavigation: () => false,
          primitiveType: "IGeometry",
        } as EC.PrimitiveProperty,
      ],
    });
    await expect(createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassAlias: "a", propertyClassName: "x.y", propertyName: "p" })).to
      .eventually.be.rejected;
  });
});

describe("createNullableSelector", () => {
  it("creates valid selector", () => {
    expect(
      createNullableSelector({
        checkSelector: "CHECK",
        valueSelector: "VALUE",
      }),
    ).to.deep.eq("IIF(CHECK, VALUE, NULL)");
  });
});

describe("createInstanceKeySelector", () => {
  it("creates valid selector", () => {
    expect(
      createInstanceKeySelector({
        alias: "test",
      }),
    ).to.eq("json_object('className', ec_classname([test].[ECClassId], 's.c'), 'id', IdToHex([test].[ECInstanceId]))");
  });
});

const testDate = new Date();
const CONCATENATED_VALUE_TEST_CASES = [
  {
    name: "adds check selector",
    input: {
      selectors: [],
      checkSelector: "CHECK",
    },
    expectations: {
      json: `IIF(CHECK, json_array(), NULL)`,
      str: `IIF(CHECK, '', NULL)`,
    },
  },
  {
    name: "concatenates selectors",
    input: {
      selectors: [{ selector: "a" }, { selector: "b" }],
    },
    expectations: {
      json: `json_array(a, b)`,
      str: `a || b`,
    },
  },
  {
    name: "serializes primitive value selector without type",
    input: {
      selectors: [
        {
          selector: "xxx",
        },
      ],
    },
    expectations: {
      json: `json_array(xxx)`,
      str: `xxx`,
    },
  },
  {
    name: "serializes primitive value selector with type",
    input: {
      selectors: [
        {
          selector: "xxx",
          type: "Integer" as const,
        },
      ],
    },
    expectations: {
      json: `json_array(json_object('value', xxx, 'type', 'Integer'))`,
      str: `xxx`,
    },
  },
  {
    name: "serializes primitive value selector with type and extended type",
    input: {
      selectors: [
        {
          selector: "xxx",
          type: "Integer" as const,
          extendedType: "TestExtendedType",
        },
      ],
    },
    expectations: {
      json: `json_array(json_object('value', xxx, 'type', 'Integer', 'extendedType', 'TestExtendedType'))`,
      str: `xxx`,
    },
  },
  {
    name: "serializes primitive Date value",
    input: {
      selectors: [{ type: "DateTime" as const, value: testDate }],
    },
    expectations: {
      json: `json_array(json_object('value', '${testDate.toISOString()}', 'type', 'DateTime'))`,
      str: `'${testDate.toLocaleString()}'`,
    },
  },
  {
    name: "serializes primitive Point2d value",
    input: {
      selectors: [{ type: "Point2d" as const, value: { x: 1, y: 2 } }],
    },
    expectations: {
      json: `json_array(json_object('value', json_object('x', 1, 'y', 2), 'type', 'Point2d'))`,
      str: `'(1, 2)'`,
    },
  },
  {
    name: "serializes primitive Point3d value",
    input: {
      selectors: [{ type: "Point3d" as const, value: { x: 1, y: 2, z: 3 } }],
    },
    expectations: {
      json: `json_array(json_object('value', json_object('x', 1, 'y', 2, 'z', 3), 'type', 'Point3d'))`,
      str: `'(1, 2, 3)'`,
    },
  },
  {
    name: "serializes primitive Id64 value",
    input: {
      selectors: [{ type: "Id" as const, value: "0x123" }],
    },
    expectations: {
      json: `json_array(json_object('value', 0x123, 'type', 'Id'))`,
      str: `'0x123'`,
    },
  },
  {
    name: "serializes primitive String value",
    input: {
      selectors: [{ type: "String" as const, value: "test" }],
    },
    expectations: {
      json: `json_array(json_object('value', 'test', 'type', 'String'))`,
      str: `'test'`,
    },
  },
  {
    name: "serializes primitive Double value",
    input: {
      selectors: [{ type: "Double" as const, koqName: "TestKindOfQuantity", value: 456.789 }],
    },
    expectations: {
      json: `json_array(json_object('value', 456.789, 'type', 'Double', 'koqName', 'TestKindOfQuantity'))`,
      str: `'456.789'`,
    },
  },
  {
    name: "serializes primitive Boolean value: false",
    input: {
      selectors: [{ type: "Boolean" as const, value: false }],
    },
    expectations: {
      json: `json_array(json_object('value', FALSE, 'type', 'Boolean'))`,
      str: `'false'`,
    },
  },
  {
    name: "serializes primitive Boolean value: true",
    input: {
      selectors: [{ type: "Boolean" as const, value: true }],
    },
    expectations: {
      json: `json_array(json_object('value', TRUE, 'type', 'Boolean'))`,
      str: `'true'`,
    },
  },
];

describe("createConcatenatedValueJsonSelector", () => {
  CONCATENATED_VALUE_TEST_CASES.forEach(({ name, input, expectations }) => {
    it(name, () => {
      expect(trimWhitespace(createConcatenatedValueJsonSelector(input.selectors, input.checkSelector))).to.eq(trimWhitespace(expectations.json));
    });
  });
});

describe("createConcatenatedValueStringSelector", () => {
  CONCATENATED_VALUE_TEST_CASES.forEach(({ name, input, expectations }) => {
    it(name, () => {
      expect(trimWhitespace(createConcatenatedValueStringSelector(input.selectors, input.checkSelector))).to.eq(trimWhitespace(expectations.str));
    });
  });
});
