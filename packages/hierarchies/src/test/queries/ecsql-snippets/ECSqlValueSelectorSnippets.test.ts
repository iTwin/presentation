/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  createConcatenatedValueJsonSelector,
  createConcatenatedValueStringSelector,
  createNullableSelector,
  createRawPrimitiveValueSelector,
  createRawPropertyValueSelector,
  TypedValueSelectClauseProps,
} from "../../../hierarchies/queries/ecsql-snippets/ECSqlValueSelectorSnippets";
import { trimWhitespace } from "../../../hierarchies/Utils";

describe("TypedValueSelectClauseProps", () => {
  describe("isPropertySelector", () => {
    it("returns correct result for different types of props", () => {
      expect(TypedValueSelectClauseProps.isPropertySelector({ propertyClassName: "s.c", propertyClassAlias: "a", propertyName: "p" })).to.be.true;
      expect(TypedValueSelectClauseProps.isPropertySelector({ selector: "x" })).to.be.false;
      expect(TypedValueSelectClauseProps.isPropertySelector({ value: 123, type: "Integer" })).to.be.false;
    });
  });
  describe("isPrimitiveValueSelector", () => {
    it("returns correct result for different types of props", () => {
      expect(TypedValueSelectClauseProps.isPrimitiveValueSelector({ propertyClassName: "s.c", propertyClassAlias: "a", propertyName: "p" })).to.be.false;
      expect(TypedValueSelectClauseProps.isPrimitiveValueSelector({ selector: "x" })).to.be.true;
      expect(TypedValueSelectClauseProps.isPrimitiveValueSelector({ value: 123, type: "Integer" })).to.be.false;
    });
  });
  describe("isPrimitiveValue", () => {
    it("returns correct result for different types of props", () => {
      expect(TypedValueSelectClauseProps.isPrimitiveValue({ propertyClassName: "s.c", propertyClassAlias: "a", propertyName: "p" })).to.be.false;
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

  it("returns boolean selector", () => {
    expect(createRawPrimitiveValueSelector(true)).to.eq(`TRUE`);
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
    name: "serializes simple property selector",
    input: {
      selectors: [
        {
          propertyClassName: "s.c",
          propertyClassAlias: "alias",
          propertyName: "prop",
        },
      ],
    },
    expectations: {
      json: `json_array(json_object('className', 's.c', 'propertyName', 'prop', 'value', [alias].[prop]))`,
      str: `[alias].[prop]`,
    },
  },
  {
    name: "serializes Navigation property selector",
    input: {
      selectors: [
        {
          propertyClassName: "s.c",
          propertyClassAlias: "alias",
          propertyName: "prop",
          specialType: "Navigation" as const,
        },
      ],
    },
    expectations: {
      json: `json_array(json_object('value', [alias].[prop].[Id], 'type', 'Id'))`,
      str: `CAST([alias].[prop].[Id] AS TEXT)`,
    },
  },
  {
    name: "serializes Guid property selector",
    input: {
      selectors: [
        {
          propertyClassName: "s.c",
          propertyClassAlias: "alias",
          propertyName: "prop",
          specialType: "Guid" as const,
        },
      ],
    },
    expectations: {
      json: `json_array(json_object('value', GuidToStr([alias].[prop]), 'type', 'String'))`,
      str: `GuidToStr([alias].[prop])`,
    },
  },
  {
    name: "serializes Point2d property selector",
    input: {
      selectors: [
        {
          propertyClassName: "s.c",
          propertyClassAlias: "alias",
          propertyName: "prop",
          specialType: "Point2d" as const,
        },
      ],
    },
    expectations: {
      json: `json_array(json_object('value', json_object('x', [alias].[prop].[x], 'y', [alias].[prop].[y]), 'type', 'Point2d'))`,
      str: `'(' || [alias].[prop].[x] || ', ' || [alias].[prop].[y] || ')'`,
    },
  },
  {
    name: "serializes Point3d property selector",
    input: {
      selectors: [
        {
          propertyClassName: "s.c",
          propertyClassAlias: "alias",
          propertyName: "prop",
          specialType: "Point3d" as const,
        },
      ],
    },
    expectations: {
      json: `json_array(json_object('value', json_object('x', [alias].[prop].[x], 'y', [alias].[prop].[y], 'z', [alias].[prop].[z]), 'type', 'Point3d'))`,
      str: `'(' || [alias].[prop].[x] || ', ' || [alias].[prop].[y] || ', ' || [alias].[prop].[z] || ')'`,
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
      selectors: [{ type: "Double" as const, value: 456.789 }],
    },
    expectations: {
      json: `json_array(json_object('value', 456.789, 'type', 'Double'))`,
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
