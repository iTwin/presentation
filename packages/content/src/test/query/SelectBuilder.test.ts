/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type EC, type ECSchemaProvider, type RelationshipPath, trimWhitespace } from "@itwin/presentation-shared";
import { ECSQL_PREFIX } from "../../content/InternalUtils.js";
import { serializeRelationshipPath } from "../../content/model/Utils.js";
import { buildSelectProjection } from "../../content/query/SelectBuilder.js";

import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { CalculatedField, PropertyField } from "../../content/model/Field.js";
import type { ValueSelector } from "../../content/model/ValueSelector.js";
import type { BaseQueryGroup } from "../../content/query/BaseQuery.js";

const primaryClass: EC.FullClassNameDotNotation = "TestSchema.Primary";
const relatedPath: RelationshipPath = [
  { sourceClassName: primaryClass, relationshipName: "TestSchema.Rel", targetClassName: "TestSchema.Target" },
];
const relatedPathKey = serializeRelationshipPath({ path: relatedPath });
const primaryClassColumn = `${ECSQL_PREFIX}primary_class`;
const primaryIdColumn = `${ECSQL_PREFIX}primary_id`;
const targetAlias = `${ECSQL_PREFIX}t0`;
const relationshipAlias = `${ECSQL_PREFIX}r0`;

const schemaProvider = {
  getSchema: async (schemaName: string) => ({
    getClass: (className: string) => ({
      fullName: `${schemaName}.${className}`,
      isRelationshipClass: () => className === "Rel",
    }),
  }),
} as unknown as ECSchemaProvider;

function createBaseQueryGroup(includeRelatedPath: boolean = true): BaseQueryGroup {
  return {
    paths: [],
    parts: {
      from: "",
      joins: "",
      primaryClassAlias: "this",
      relatedClassAliases: includeRelatedPath
        ? new Map([[relatedPathKey, { target: targetAlias, relationship: relationshipAlias }]])
        : new Map(),
    },
  };
}

function createDescriptor(selectors: ValueSelector[]): ContentDescriptor {
  return {
    sources: [],
    fields: {},
    categories: {},
    selectors: Object.fromEntries(selectors.map((selector) => [selector.id, selector])),
  };
}

describe("buildSelectProjection", () => {
  it("selects each property alias once and calculated fields as scalar columns", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      descriptor: createDescriptor([
        {
          kind: "property",
          id: "TestSchema.Primary.Code",
          propertyClassName: primaryClass,
          propertyName: "Code",
          pathFromTarget: [],
        },
        {
          kind: "property",
          id: "TestSchema.Target.Name",
          propertyClassName: "TestSchema.Target",
          propertyName: "Name",
          pathFromTarget: relatedPath,
        },
        {
          kind: "property",
          id: "TestSchema.Rel.Weight",
          propertyClassName: "TestSchema.Rel",
          propertyName: "Weight",
          pathFromTarget: relatedPath,
        },
        {
          kind: "calculated",
          id: "calculations_v1:score",
          expression: "this.Code * :factor",
          bindings: { factor: { type: "int", value: 2 } },
        },
        { kind: "calculated", id: "calculations_v1:label", expression: "[this].[Code] || '-x'" },
      ]),
      group: createBaseQueryGroup(),
    });

    expect(trimWhitespace(projection.clauses.select)).to.equal(
      trimWhitespace(`
        SELECT
          ec_classname([this].[ECClassId], 's.c') AS [${primaryClassColumn}],
          [this].[ECInstanceId] AS [${primaryIdColumn}],
          [this].$ AS [this],
          [${targetAlias}].$ AS [${targetAlias}],
          [${relationshipAlias}].$ AS [${relationshipAlias}],
          ([this].Code * :factor) AS [${ECSQL_PREFIX}calc_0],
          ([this].[Code] || '-x') AS [${ECSQL_PREFIX}calc_1]
      `),
    );
    expect(projection.clauses.orderBy).to.equal(undefined);
    expect(projection.bindings).to.deep.equal({ factor: { type: "int", value: 2 } });
    expect(projection.columnNames).to.deep.equal({
      primaryKey: { className: primaryClassColumn, id: primaryIdColumn },
      propertyBlobs: {
        "TestSchema.Primary.Code": "this",
        "TestSchema.Target.Name": targetAlias,
        "TestSchema.Rel.Weight": relationshipAlias,
      },
      calculatedValues: {
        "calculations_v1:score": `${ECSQL_PREFIX}calc_0`,
        "calculations_v1:label": `${ECSQL_PREFIX}calc_1`,
      },
    });
    expect(projection.sort).to.deep.equal([]);
  });

  it("does not project a related property from a group that does not join its path", async () => {
    const selector: ValueSelector = {
      kind: "property",
      id: "TestSchema.Target.Name",
      propertyClassName: "TestSchema.Target",
      propertyName: "Name",
      pathFromTarget: relatedPath,
    };
    const projection = await buildSelectProjection({
      schemaProvider,
      descriptor: createDescriptor([selector]),
      group: createBaseQueryGroup(false),
    });

    expect(projection.clauses.select).not.to.contain(".$");
  });

  it("projects a related property whose path carries a step instance filter", async () => {
    const filteredPath: RelationshipPath = [{ ...relatedPath[0], instanceFilter: { expression: "this.Prop > 0" } }];
    const group: BaseQueryGroup = {
      paths: [],
      parts: {
        from: "",
        joins: "",
        primaryClassAlias: "this",
        relatedClassAliases: new Map([
          [
            serializeRelationshipPath({ path: filteredPath, includeInstanceFilters: true }),
            { target: targetAlias, relationship: relationshipAlias },
          ],
        ]),
      },
    };
    const projection = await buildSelectProjection({
      schemaProvider,
      descriptor: createDescriptor([
        {
          kind: "property",
          id: "TestSchema.Target.Name",
          propertyClassName: "TestSchema.Target",
          propertyName: "Name",
          pathFromTarget: filteredPath,
        },
      ]),
      group,
    });
    expect(projection.clauses.select).to.contain(`[${targetAlias}].$ AS [${targetAlias}]`);
    expect(projection.columnNames.propertyBlobs).to.deep.equal({ "TestSchema.Target.Name": targetAlias });
  });

  it("selects a shared property alias only once", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      descriptor: createDescriptor([
        {
          kind: "property",
          id: "TestSchema.Primary.Code",
          propertyClassName: primaryClass,
          propertyName: "Code",
          pathFromTarget: [],
        },
        {
          kind: "property",
          id: "TestSchema.Primary.Label",
          propertyClassName: primaryClass,
          propertyName: "Label",
          pathFromTarget: [],
        },
      ]),
      group: createBaseQueryGroup(),
    });

    expect(projection.clauses.select.match(/\[this\]\.\$ AS \[this\]/g)).to.have.lengthOf(1);
  });

  it("projects property and calculated sort keys with stable tie-breakers", async () => {
    const codeField: PropertyField = {
      kind: "property",
      id: "TestSchema.Primary.Code",
      label: "Code",
      type: { kind: "primitive", type: "String" },
      propertyClassName: primaryClass,
      propertyName: "Code",
      pathFromTarget: [],
      valueClassNames: [primaryClass],
      primaryClassNames: [primaryClass],
      selectorId: "TestSchema.Primary.Code",
    };
    const scoreField: CalculatedField = {
      kind: "calculated",
      id: "calculations_v1:score",
      label: "Score",
      type: { kind: "primitive", type: "Integer" },
      expression: "this.Code * :factor",
      bindings: { factor: { type: "int", value: 2 } },
      selectorId: "calculations_v1:score",
    };
    const projection = await buildSelectProjection({
      schemaProvider,
      descriptor: createDescriptor([]),
      group: createBaseQueryGroup(),
      sorting: [
        { field: codeField, direction: "asc" },
        { field: scoreField, direction: "desc" },
      ],
    });

    expect(trimWhitespace(projection.clauses.select)).to.equal(
      trimWhitespace(`
        SELECT
          ec_classname([this].[ECClassId], 's.c') AS [${primaryClassColumn}],
          [this].[ECInstanceId] AS [${primaryIdColumn}],
          [this].$->[Code] AS [${ECSQL_PREFIX}sort_0],
          ([this].Code * :factor) AS [${ECSQL_PREFIX}sort_1]
      `),
    );
    expect(projection.bindings).to.deep.equal({ factor: { type: "int", value: 2 } });
    expect(projection.sort).to.deep.equal([
      { fieldId: codeField.id, column: `${ECSQL_PREFIX}sort_0`, direction: "asc" },
      { fieldId: scoreField.id, column: `${ECSQL_PREFIX}sort_1`, direction: "desc" },
    ]);
    expect(projection.clauses.orderBy).to.equal(
      `ORDER BY [${ECSQL_PREFIX}sort_0] ASC, [${ECSQL_PREFIX}sort_1] DESC, [${primaryClassColumn}] ASC, [${primaryIdColumn}] ASC`,
    );
  });

  it("rejects sorting by a related field outside the query group", async () => {
    const field: PropertyField = {
      kind: "property",
      id: "TestSchema.Target.Name",
      label: "Name",
      type: { kind: "primitive", type: "String" },
      propertyClassName: "TestSchema.Target",
      propertyName: "Name",
      pathFromTarget: relatedPath,
      valueClassNames: ["TestSchema.Target"],
      primaryClassNames: [primaryClass],
      selectorId: "TestSchema.Target.Name",
    };

    await expect(
      buildSelectProjection({
        schemaProvider,
        descriptor: createDescriptor([]),
        group: createBaseQueryGroup(false),
        sorting: [{ field, direction: "asc" }],
      }),
    ).rejects.toThrow(`Cannot sort by field "${field.id}"`);
  });

  it("aliases calculated selectors with generated column names", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      descriptor: createDescriptor([{ kind: "calculated", id: "provider:score", expression: "1" }]),
      group: createBaseQueryGroup(),
    });

    expect(projection.clauses.select).to.contain(`(1) AS [${ECSQL_PREFIX}calc_0]`);
    expect(projection.columnNames.calculatedValues).to.deep.equal({ "provider:score": `${ECSQL_PREFIX}calc_0` });
  });
});
