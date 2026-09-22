/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type EC, type ECSchemaProvider, type RelationshipPath, trimWhitespace } from "@itwin/presentation-shared";
import { ECSQL_PREFIX } from "../../content/InternalUtils.js";
import { serializeRelationshipPath } from "../../content/model/Utils.js";
import { buildSelectProjection } from "../../content/query/SelectBuilder.js";
import { createPrimitiveProperty } from "../MetadataStubs.js";

import type { ValueSelector } from "../../content/definition-building/ValueSelector.js";
import type { CalculatedField, PropertyField } from "../../content/model/Field.js";
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
// "" is the direct-property / calculated-selector ownership key (an empty `pathFromTarget` serializes to it).
const ownsDirectAndRelated = new Set(["", relatedPathKey]);
const ownsDirect = new Set([""]);
const ownsRelated = new Set([relatedPathKey]);

const schemaProvider = {
  getSchema: async (schemaName: string) => ({
    getClass: (className: string) => ({
      fullName: `${schemaName}.${className}`,
      isRelationshipClass: () => className === "Rel",
      getProperty: (name: string) => createPrimitiveProperty({ name }),
    }),
  }),
} as unknown as ECSchemaProvider;

function createBaseQueryGroup(includeRelatedPath: boolean = true): BaseQueryGroup {
  return {
    paths: [],
    cardinality: "one",
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

function createSelectors(selectors: ValueSelector[]): Record<ValueSelector["id"], ValueSelector> {
  return Object.fromEntries(selectors.map((selector) => [selector.id, selector]));
}

describe("buildSelectProjection", () => {
  it.each([false, true])(
    "omits non-applicable calculated values and preserves NULL sort columns (key-only: %s)",
    async (keyOnly) => {
      const missingField: CalculatedField = {
        kind: "calculated",
        id: "calc:missing",
        label: "Missing",
        expression: "this.Missing * :factor",
        bindings: { factor: { type: "int", value: 2 } },
        type: { kind: "primitive", type: "Integer" },
        primaryClassNames: [primaryClass],
      };
      const sharedField: CalculatedField = {
        kind: "calculated",
        id: "calc:shared",
        label: "Shared",
        expression: ":shared",
        bindings: { shared: { type: "int", value: 7 } },
        type: { kind: "primitive", type: "Integer" },
        primaryClassNames: [primaryClass],
      };
      const projection = await buildSelectProjection({
        schemaProvider,
        selectors: keyOnly ? {} : createSelectors([missingField, sharedField]),
        applicableCalculatedFieldIds: new Set([sharedField.id]),
        sorting: [
          { field: missingField, direction: "asc" },
          { field: sharedField, direction: "desc" },
        ],
        group: createBaseQueryGroup(false),
        ownedPathKeys: ownsDirect,
      });
      expect(trimWhitespace(projection.clauses.select)).to.equal(
        trimWhitespace(`
          SELECT
            ec_classname([this].[ECClassId], 's.c') AS [${primaryClassColumn}],
            [this].[ECInstanceId] AS [${primaryIdColumn}],
            ${keyOnly ? "" : "(:shared) AS [pres_calc_0],"}
            NULL AS [pres_sort_0],
            (:shared) AS [pres_sort_1]
        `),
      );
      expect(projection.bindings).to.deep.equal({ shared: { type: "int", value: 7 } });
      expect(projection.columnNames.calculatedValues).to.deep.equal(keyOnly ? {} : { "calc:shared": "pres_calc_0" });
      expect(projection.sort).to.deep.equal([
        { fieldId: missingField.id, column: "pres_sort_0", direction: "asc" },
        { fieldId: sharedField.id, column: "pres_sort_1", direction: "desc" },
      ]);
      expect(projection.clauses.orderBy).to.contain("[pres_sort_0] ASC, [pres_sort_1] DESC");
    },
  );

  it("selects each property alias once and calculated fields as scalar columns", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([
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
      ownedPathKeys: ownsDirectAndRelated,
    });

    expect(trimWhitespace(projection.clauses.select)).to.equal(
      trimWhitespace(`
        SELECT
          ec_classname([this].[ECClassId], 's.c') AS [${primaryClassColumn}],
          [this].[ECInstanceId] AS [${primaryIdColumn}],
          [this].$ AS [this],
          [${targetAlias}].$ AS [${targetAlias}],
          ec_classname([${targetAlias}].[ECClassId], 's.c') AS [${targetAlias}_cls],
          [${relationshipAlias}].$ AS [${relationshipAlias}],
          ec_classname([${relationshipAlias}].[ECClassId], 's.c') AS [${relationshipAlias}_cls],
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
      relatedBlobs: {
        [targetAlias]: { className: `${targetAlias}_cls`, pathKey: relatedPathKey, role: "target" },
        [relationshipAlias]: { className: `${relationshipAlias}_cls`, pathKey: relatedPathKey, role: "relationship" },
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
      selectors: createSelectors([selector]),
      group: createBaseQueryGroup(false),
      ownedPathKeys: ownsRelated,
    });

    expect(projection.clauses.select).not.to.contain(".$");
  });

  it("does not project a related property selector whose path is resolvable but not owned by this group", async () => {
    const selector: ValueSelector = {
      kind: "property",
      id: "TestSchema.Target.Name",
      propertyClassName: "TestSchema.Target",
      propertyName: "Name",
      pathFromTarget: relatedPath,
    };
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([selector]),
      group: createBaseQueryGroup(),
      ownedPathKeys: new Set(),
    });

    expect(projection.clauses.select).not.to.contain(".$");
    expect(projection.columnNames.propertyBlobs).to.deep.equal({});
    expect(projection.columnNames.relatedBlobs).to.deep.equal({});
  });

  it("projects a related property whose path carries a step instance filter", async () => {
    const filteredPath: RelationshipPath = [{ ...relatedPath[0], instanceFilter: { expression: "this.Prop > 0" } }];
    const group: BaseQueryGroup = {
      paths: [],
      cardinality: "one",
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
      selectors: createSelectors([
        {
          kind: "property",
          id: "TestSchema.Target.Name",
          propertyClassName: "TestSchema.Target",
          propertyName: "Name",
          pathFromTarget: filteredPath,
        },
      ]),
      group,
      ownedPathKeys: new Set([serializeRelationshipPath({ path: filteredPath, includeInstanceFilters: true })]),
    });
    const filteredPathKey = serializeRelationshipPath({ path: filteredPath, includeInstanceFilters: true });
    expect(projection.clauses.select).to.contain(`[${targetAlias}].$ AS [${targetAlias}]`);
    expect(projection.columnNames.propertyBlobs).to.deep.equal({ "TestSchema.Target.Name": targetAlias });
    expect(projection.columnNames.relatedBlobs).to.deep.equal({
      [targetAlias]: { className: `${targetAlias}_cls`, pathKey: filteredPathKey, role: "target" },
    });
  });

  it("emits one class-name column for a related alias shared by two property selectors", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([
        {
          kind: "property",
          id: "TestSchema.Target.Name",
          propertyClassName: "TestSchema.Target",
          propertyName: "Name",
          pathFromTarget: relatedPath,
        },
        {
          kind: "property",
          id: "TestSchema.Target.Code",
          propertyClassName: "TestSchema.Target",
          propertyName: "Code",
          pathFromTarget: relatedPath,
        },
      ]),
      group: createBaseQueryGroup(),
      ownedPathKeys: ownsRelated,
    });

    const classNameColumn = `${targetAlias}_cls`;
    expect(projection.clauses.select.match(new RegExp(`AS \\[${classNameColumn}\\]`, "g"))).to.have.lengthOf(1);
    expect(projection.columnNames.relatedBlobs).to.deep.equal({
      [targetAlias]: { className: classNameColumn, pathKey: relatedPathKey, role: "target" },
    });
  });

  it("projects the target alias's identity even when only a relationship-class property is selected", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([
        {
          kind: "property",
          id: "TestSchema.Rel.Weight",
          propertyClassName: "TestSchema.Rel",
          propertyName: "Weight",
          pathFromTarget: relatedPath,
        },
      ]),
      group: createBaseQueryGroup(),
      ownedPathKeys: ownsRelated,
    });

    expect(projection.clauses.select).to.contain(`[${targetAlias}].$ AS [${targetAlias}]`);
    expect(projection.columnNames.propertyBlobs).to.deep.equal({ "TestSchema.Rel.Weight": relationshipAlias });
    expect(projection.columnNames.relatedBlobs).to.deep.equal({
      [targetAlias]: { className: `${targetAlias}_cls`, pathKey: relatedPathKey, role: "target" },
      [relationshipAlias]: { className: `${relationshipAlias}_cls`, pathKey: relatedPathKey, role: "relationship" },
    });
  });

  it("selects a shared property alias only once", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([
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
      ownedPathKeys: ownsDirect,
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
      pathCardinality: "one",
    };
    const scoreField: CalculatedField = {
      kind: "calculated",
      id: "calculations_v1:score",
      label: "Score",
      type: { kind: "primitive", type: "Integer" },
      expression: "this.Code * :factor",
      bindings: { factor: { type: "int", value: 2 } },
      primaryClassNames: [primaryClass],
    };
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([]),
      group: createBaseQueryGroup(),
      ownedPathKeys: new Set(),
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
      pathCardinality: "one",
    };

    await expect(
      buildSelectProjection({
        schemaProvider,
        selectors: createSelectors([]),
        group: createBaseQueryGroup(false),
        ownedPathKeys: new Set(),
        sorting: [{ field, direction: "asc" }],
      }),
    ).rejects.toThrow(`Cannot sort by field "${field.id}"`);
  });

  it("aliases calculated selectors with generated column names", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([{ kind: "calculated", id: "provider:score", expression: "1" }]),
      group: createBaseQueryGroup(),
      ownedPathKeys: ownsDirect,
    });

    expect(projection.clauses.select).to.contain(`(1) AS [${ECSQL_PREFIX}calc_0]`);
    expect(projection.columnNames.calculatedValues).to.deep.equal({ "provider:score": `${ECSQL_PREFIX}calc_0` });
  });

  it("skips calculated selectors when the direct-property key is not owned by this group", async () => {
    const projection = await buildSelectProjection({
      schemaProvider,
      selectors: createSelectors([{ kind: "calculated", id: "provider:score", expression: "1" }]),
      group: createBaseQueryGroup(),
      ownedPathKeys: ownsRelated,
    });

    expect(projection.clauses.select).not.to.contain("calc_0");
    expect(projection.columnNames.calculatedValues).to.deep.equal({});
  });
});
