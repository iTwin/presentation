/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  createConcatenatedValueSelector,
  createNullableSelector,
  createPropertyValueSelector,
  createValueSelector,
  ValueSelectClauseProps,
} from "../../hierarchy-builder/queries/ECSqlUtils";
import { trimWhitespace } from "./Utils";

describe("createPropertyValueSelector", () => {
  it("returns selector for simple properties", () => {
    expect(createPropertyValueSelector("alias", "property-name")).to.eq("[alias].[property-name]");
  });

  it("returns selector for navigation properties", () => {
    expect(createPropertyValueSelector("alias", "property-name", "Navigation")).to.deep.eq(["[alias].[property-name].[Id]", "Id"]);
  });

  it("returns selector for guid properties", () => {
    expect(createPropertyValueSelector("alias", "property-name", "Guid")).to.deep.eq(["GuidToStr([alias].[property-name])", "String"]);
  });

  it("returns selector for point2d properties", () => {
    const propertySelector = "[alias].[property-name]";
    expect(createPropertyValueSelector("alias", "property-name", "Point2d")).to.deep.eq([
      `json_object('x', ${propertySelector}.[x], 'y', ${propertySelector}.[y])`,
      "Point2d",
    ]);
  });

  it("returns selector for navigation properties", () => {
    const propertySelector = "[alias].[property-name]";
    expect(createPropertyValueSelector("alias", "property-name", "Point3d")).to.deep.eq([
      `json_object('x', ${propertySelector}.[x], 'y', ${propertySelector}.[y], 'z', ${propertySelector}.[z])`,
      "Point3d",
    ]);
  });
});

describe("createNullableSelector", () => {
  it("creates valid selector", () => {
    expect(
      createNullableSelector({
        checkSelector: "CHECK",
        valueSelector: "VALUE",
      }),
    ).to.deep.eq("IIF(CHECK IS NOT NULL, VALUE, NULL)");
  });
});

describe("ValueSelectClauseProps", () => {
  describe("isPropertySelector", () => {
    it("returns correct result for different types of props", () => {
      expect(ValueSelectClauseProps.isPropertySelector({ propertyClassName: "s.c", propertyClassAlias: "a", propertyName: "p" })).to.be.true;
      expect(ValueSelectClauseProps.isPropertySelector({ selector: "x" })).to.be.false;
      expect(ValueSelectClauseProps.isPropertySelector({ value: 123, type: "Integer" })).to.be.false;
    });
  });
  describe("isPrimitiveValueSelector", () => {
    it("returns correct result for different types of props", () => {
      expect(ValueSelectClauseProps.isPrimitiveValueSelector({ propertyClassName: "s.c", propertyClassAlias: "a", propertyName: "p" })).to.be.false;
      expect(ValueSelectClauseProps.isPrimitiveValueSelector({ selector: "x" })).to.be.true;
      expect(ValueSelectClauseProps.isPrimitiveValueSelector({ value: 123, type: "Integer" })).to.be.false;
    });
  });
  describe("isPrimitiveValue", () => {
    it("returns correct result for different types of props", () => {
      expect(ValueSelectClauseProps.isPrimitiveValue({ propertyClassName: "s.c", propertyClassAlias: "a", propertyName: "p" })).to.be.false;
      expect(ValueSelectClauseProps.isPrimitiveValue({ selector: "x" })).to.be.false;
      expect(ValueSelectClauseProps.isPrimitiveValue({ value: 123, type: "Integer" })).to.be.true;
    });
  });
});

describe("createValueSelector", () => {
  it("creates selector for special property type", () => {
    expect(
      trimWhitespace(
        createValueSelector({
          propertyClassName: "s.c",
          propertyClassAlias: "a",
          propertyName: "p",
          specialType: "Navigation",
        }),
      ),
    ).to.eq(trimWhitespace("json_object('value', [a].[p].[Id], 'type', 'Id')"));
  });

  it("creates selector for property", () => {
    expect(
      trimWhitespace(
        createValueSelector({
          propertyClassName: "s.c",
          propertyClassAlias: "a",
          propertyName: "p",
        }),
      ),
    ).to.eq(trimWhitespace("json_object('className', 's.c', 'propertyName', 'p', 'value', [a].[p])"));
  });

  it("creates selector using primitive value selector", () => {
    expect(
      trimWhitespace(
        createValueSelector({
          selector: "xxx",
          type: "Integer",
        }),
      ),
    ).to.eq(trimWhitespace("json_object('value', xxx, 'type', 'Integer')"));
  });

  it("creates selector using primitive value selector with null check", () => {
    expect(
      trimWhitespace(
        createValueSelector({
          selector: "xxx",
          type: "Integer",
          nullValueResult: "null",
        }),
      ),
    ).to.eq(trimWhitespace("IIF(xxx IS NOT NULL, json_object('value', xxx, 'type', 'Integer'), NULL)"));
  });

  it("creates selector using primitive value selector without type", () => {
    expect(trimWhitespace(createValueSelector({ selector: "xxx" }))).to.eq(trimWhitespace("json_object('value', xxx, 'type', 'String')"));
  });

  it("creates selector for primitive Date value", () => {
    const date = new Date();
    expect(trimWhitespace(createValueSelector({ type: "DateTime", value: date }))).to.eq(
      trimWhitespace(`json_object('value', '${date.toISOString()}', 'type', 'DateTime')`),
    );
  });

  it("creates selector for primitive Point2d value", () => {
    expect(trimWhitespace(createValueSelector({ type: "Point2d", value: { x: 1, y: 2 } }))).to.eq(
      trimWhitespace(`json_object('value', json_object('x', 1, 'y', 2), 'type', 'Point2d')`),
    );
  });

  it("creates selector for primitive Point3d value", () => {
    expect(trimWhitespace(createValueSelector({ type: "Point3d", value: { x: 1, y: 2, z: 3 } }))).to.eq(
      trimWhitespace(`json_object('value', json_object('x', 1, 'y', 2, 'z', 3), 'type', 'Point3d')`),
    );
  });

  it("creates selector for primitive string value", () => {
    expect(trimWhitespace(createValueSelector({ type: "String", value: "test" }))).to.eq(trimWhitespace(`json_object('value', 'test', 'type', 'String')`));
  });

  it("creates selector for primitive number value", () => {
    expect(trimWhitespace(createValueSelector({ type: "Double", value: 456.789 }))).to.eq(trimWhitespace(`json_object('value', 456.789, 'type', 'Double')`));
  });

  it("creates selector for primitive boolean value", () => {
    expect(trimWhitespace(createValueSelector({ type: "Boolean", value: true }))).to.eq(
      trimWhitespace(`json_object('value', CAST(1 AS BOOLEAN), 'type', 'Boolean')`),
    );
    expect(trimWhitespace(createValueSelector({ type: "Boolean", value: false }))).to.eq(
      trimWhitespace(`json_object('value', CAST(0 AS BOOLEAN), 'type', 'Boolean')`),
    );
  });
});

describe("createConcatenatedValueSelector", () => {
  it("creates empty string selector when given an empty selectors list", () => {
    expect(createConcatenatedValueSelector([])).to.eq("''");
  });

  it("creates selectors array", () => {
    const sel1 = { selector: "x" };
    const sel2 = { selector: "y" };
    expect(createConcatenatedValueSelector([sel1, sel2])).to.eq(`json_array(${createValueSelector(sel1)}, ${createValueSelector(sel2)})`);
  });

  it("creates selectors array with check selector", () => {
    const sel1 = { selector: "x" };
    const sel2 = { selector: "y" };
    expect(createConcatenatedValueSelector([sel1, sel2], "CHECK")).to.eq(
      createNullableSelector({
        valueSelector: `json_array(${createValueSelector(sel1)}, ${createValueSelector(sel2)})`,
        checkSelector: "CHECK",
      }),
    );
  });
});
