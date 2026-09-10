/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { trimWhitespace } from "@itwin/presentation-shared";
import { PAGE_SIZE, SQLITE_MAX_COMPOUND_SELECT_TERMS } from "../../../content/query/QueryLimits.js";
import {
  buildAnchorPageQuery,
  buildKeyStreamQuery,
  buildValueQuery,
} from "../../../content/query/value-loading/PageQueries.js";

import type { PropertyField } from "../../../content/model/Field.js";
import type { BaseQueryGroup } from "../../../content/query/BaseQuery.js";
import type { ContentQuerySort, SelectProjection } from "../../../content/query/SelectBuilder.js";
import type { Cursor, SourcePlan } from "../../../content/query/value-loading/PageQueries.js";

const codeField: PropertyField = {
  kind: "property",
  id: "Schema.A.Code",
  label: "Code",
  type: { kind: "primitive", type: "String" },
  propertyClassName: "Schema.A",
  propertyName: "Code",
  pathFromTarget: [],
  pathCardinality: "one",
  valueClassNames: ["Schema.A"],
  primaryClassNames: ["Schema.A"],
  selectorId: "Schema.A.Code",
};

function createBaseQueryGroup(overrides?: Partial<BaseQueryGroup["parts"]>): BaseQueryGroup {
  return {
    paths: [],
    cardinality: "one",
    parts: {
      from: "FROM [Schema].[A] [this]",
      joins: "",
      primaryClassAlias: "this",
      relatedClassAliases: new Map(),
      ...overrides,
    },
  };
}

function createProjection(overrides?: {
  primaryKey?: SelectProjection["columnNames"]["primaryKey"];
  propertyBlobs?: Record<string, string>;
  calculatedValues?: SelectProjection["columnNames"]["calculatedValues"];
  sort?: SelectProjection["sort"];
  bindings?: SelectProjection["bindings"];
}): SelectProjection {
  const primaryKey = overrides?.primaryKey ?? { className: "pres_primary_class", id: "pres_primary_id" };
  const propertyBlobs = overrides?.propertyBlobs ?? { "Schema.A.Code": "this" };
  const calculatedValues = overrides?.calculatedValues ?? {};
  const sort = overrides?.sort ?? [];
  const select = [
    `ec_classname([this].[ECClassId], 's.c') AS [${primaryKey.className}]`,
    `[this].[ECInstanceId] AS [${primaryKey.id}]`,
    ...[...new Set(Object.values(propertyBlobs))].map((alias) => `[${alias}].$ AS [${alias}]`),
    ...sort.map((entry) => `[this].$->[${entry.fieldId.split(".").pop() ?? entry.fieldId}] AS [${entry.column}]`),
  ];
  return {
    clauses: { select: `SELECT ${select.join(", ")}` },
    columnNames: { primaryKey, propertyBlobs, calculatedValues },
    sort,
    ...(overrides?.bindings ? { bindings: overrides.bindings } : undefined),
  };
}

const sortColumn = { fieldId: "Schema.A.Code", column: "pres_sort_0", direction: "asc" } as const;
const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];

// Number of terms in the largest compound SELECT of the given query, counting each nesting level separately.
function maxCompoundTerms(ecsql: string): number {
  const termsPerDepth = [1];
  let max = 1;
  for (let i = 0; i < ecsql.length; ++i) {
    if (ecsql[i] === "(") {
      termsPerDepth.push(1);
    } else if (ecsql[i] === ")") {
      termsPerDepth.pop();
    } else if (ecsql.startsWith("UNION ALL", i)) {
      const terms = ++termsPerDepth[termsPerDepth.length - 1];
      max = Math.max(max, terms);
    }
  }
  return max;
}

function createPlan(overrides?: {
  anchor?: { baseQuery?: BaseQueryGroup; projection?: SelectProjection; keyProjection?: SelectProjection };
  additional?: SourcePlan["additional"];
}): SourcePlan {
  return {
    anchor: {
      baseQuery: overrides?.anchor?.baseQuery ?? createBaseQueryGroup(),
      projection: overrides?.anchor?.projection ?? createProjection(),
      keyProjection: overrides?.anchor?.keyProjection ?? createProjection({ propertyBlobs: {} }),
    },
    additional: overrides?.additional ?? [],
  };
}

describe("buildAnchorPageQuery", () => {
  it("wraps the projection in a derived table with tie-breaker ordering and a page limit", () => {
    const query = buildAnchorPageQuery({ plan: createPlan(), sorting: [] });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [q].*
        FROM (
          SELECT
            ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
            [this].[ECInstanceId] AS [pres_primary_id],
            [this].$ AS [this]
          FROM [Schema].[A] [this]
        ) [q]
        ORDER BY [q].[pres_primary_class] ASC, [q].[pres_primary_id] ASC
        LIMIT ${PAGE_SIZE}
      `),
    );
  });

  it("merges group and projection bindings", () => {
    const baseQuery = createBaseQueryGroup({ bindings: { a: { type: "int", value: 1 } } });
    const projection = createProjection({ bindings: { b: { type: "int", value: 2 } } });
    const query = buildAnchorPageQuery({ plan: createPlan({ anchor: { baseQuery, projection } }), sorting: [] });
    expect(query.bindings).to.deep.equal({ a: { type: "int", value: 1 }, b: { type: "int", value: 2 } });
  });

  it("prepends sort keys before the primary-key tie-breakers", () => {
    const projection = createProjection({ sort: [sortColumn] });
    const query = buildAnchorPageQuery({ plan: createPlan({ anchor: { projection } }), sorting });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [q].*
        FROM (
          SELECT
            ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
            [this].[ECInstanceId] AS [pres_primary_id],
            [this].$ AS [this],
            [this].$->[Code] AS [pres_sort_0]
          FROM [Schema].[A] [this]
        ) [q]
        ORDER BY [q].[pres_sort_0] ASC, [q].[pres_primary_class] ASC, [q].[pres_primary_id] ASC
        LIMIT ${PAGE_SIZE}
      `),
    );
  });

  it("adds a keyset WHERE with cursor bindings when a cursor is supplied", () => {
    const projection = createProjection({ sort: [sortColumn] });
    const cursor: Cursor = { sortValues: ["A"], primaryKey: { className: "Schema.A", id: "0x1" } };
    const query = buildAnchorPageQuery({ plan: createPlan({ anchor: { projection } }), sorting, cursor });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [q].*
        FROM (
          SELECT
            ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
            [this].[ECInstanceId] AS [pres_primary_id],
            [this].$ AS [this],
            [this].$->[Code] AS [pres_sort_0]
          FROM [Schema].[A] [this]
        ) [q]
        WHERE
          [q].[pres_sort_0] > :pres_keyset_0
          OR ([q].[pres_sort_0] = :pres_keyset_0 AND [q].[pres_primary_class] > :pres_keyset_1)
          OR ([q].[pres_sort_0] = :pres_keyset_0 AND [q].[pres_primary_class] = :pres_keyset_1 AND [q].[pres_primary_id] > :pres_keyset_2)
        ORDER BY [q].[pres_sort_0] ASC, [q].[pres_primary_class] ASC, [q].[pres_primary_id] ASC
        LIMIT ${PAGE_SIZE}
      `),
    );
    // One binding per ordered column: sort key, then the two primary-key tie-breakers.
    expect(query.bindings).to.deep.include({
      ["pres_keyset_0"]: { type: "string", value: "A" },
      ["pres_keyset_1"]: { type: "string", value: "Schema.A" },
      ["pres_keyset_2"]: { type: "id", value: "0x1" },
    });
  });
});

describe("buildKeyStreamQuery", () => {
  it("unions the sources' key streams under a single ordering and page limit", () => {
    const query = buildKeyStreamQuery({ plans: [createPlan(), createPlan()], sorting });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [q].*
        FROM (
          SELECT * FROM (
            SELECT
              ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
              [this].[ECInstanceId] AS [pres_primary_id]
            FROM [Schema].[A] [this]
          )
          UNION ALL
          SELECT * FROM (
            SELECT
              ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
              [this].[ECInstanceId] AS [pres_primary_id]
            FROM [Schema].[A] [this]
          )
        ) [q]
        ORDER BY [q].[pres_primary_class] ASC, [q].[pres_primary_id] ASC
        LIMIT ${PAGE_SIZE}
      `),
    );
  });

  it("namespaces each source's bindings by source index so shared names cannot collide", () => {
    const makeFilteredPlan = () =>
      createPlan({
        anchor: {
          baseQuery: createBaseQueryGroup({
            where: "WHERE [this].Code > :minCode",
            bindings: { minCode: { type: "string", value: "A" } },
          }),
        },
      });
    const query = buildKeyStreamQuery({ plans: [makeFilteredPlan(), makeFilteredPlan()], sorting });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [q].*
        FROM (
          SELECT * FROM (
            SELECT
              ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
              [this].[ECInstanceId] AS [pres_primary_id]
            FROM [Schema].[A] [this]
            WHERE [this].Code > :s0_minCode
          )
          UNION ALL
          SELECT * FROM (
            SELECT
              ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
              [this].[ECInstanceId] AS [pres_primary_id]
            FROM [Schema].[A] [this]
            WHERE [this].Code > :s1_minCode
          )
        ) [q]
        ORDER BY [q].[pres_primary_class] ASC, [q].[pres_primary_id] ASC
        LIMIT ${PAGE_SIZE}
      `),
    );
    expect(Object.keys(query.bindings ?? {})).to.have.members(["s0_minCode", "s1_minCode"]);
  });

  it("adds a keyset WHERE seeded from the cursor", () => {
    const makePlan = () =>
      createPlan({ anchor: { keyProjection: createProjection({ propertyBlobs: {}, sort: [sortColumn] }) } });
    const cursor: Cursor = { sortValues: ["A"], primaryKey: { className: "Schema.A", id: "0x1" } };
    const query = buildKeyStreamQuery({ plans: [makePlan(), makePlan()], sorting, cursor });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [q].*
        FROM (
          SELECT * FROM (
            SELECT
              ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
              [this].[ECInstanceId] AS [pres_primary_id],
              [this].$->[Code] AS [pres_sort_0]
            FROM [Schema].[A] [this]
          )
          UNION ALL
          SELECT * FROM (
            SELECT
              ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
              [this].[ECInstanceId] AS [pres_primary_id],
              [this].$->[Code] AS [pres_sort_0]
            FROM [Schema].[A] [this]
          )
        ) [q]
        WHERE
          [q].[pres_sort_0] > :pres_keyset_0
          OR ([q].[pres_sort_0] = :pres_keyset_0 AND [q].[pres_primary_class] > :pres_keyset_1)
          OR ([q].[pres_sort_0] = :pres_keyset_0 AND [q].[pres_primary_class] = :pres_keyset_1 AND [q].[pres_primary_id] > :pres_keyset_2)
        ORDER BY [q].[pres_sort_0] ASC, [q].[pres_primary_class] ASC, [q].[pres_primary_id] ASC
        LIMIT ${PAGE_SIZE}
      `),
    );
    expect(query.bindings).to.deep.include({
      ["pres_keyset_0"]: { type: "string", value: "A" },
      ["pres_keyset_1"]: { type: "string", value: "Schema.A" },
      ["pres_keyset_2"]: { type: "id", value: "0x1" },
    });
  });

  it("nests the union into groups when there are more sources than a compound SELECT allows", () => {
    const plans = Array.from({ length: SQLITE_MAX_COMPOUND_SELECT_TERMS * 2 + 1 }, () => createPlan());
    const query = buildKeyStreamQuery({ plans, sorting });

    // Every source is still a branch of the union...
    expect(query.ecsql.match(/FROM \[Schema\]\.\[A\] \[this\]/g)).to.have.lengthOf(plans.length);
    // ...but no single compound SELECT has more terms than the limit.
    expect(maxCompoundTerms(query.ecsql)).to.be.at.most(SQLITE_MAX_COMPOUND_SELECT_TERMS);
  });

  it("throws when a cursor references a non-primitive sort field", () => {
    const cursor: Cursor = { sortValues: ["A"], primaryKey: { className: "Schema.A", id: "0x1" } };
    const structSorting: ContentQuerySort[] = [
      { field: { ...codeField, type: { kind: "struct", members: [] } }, direction: "asc" },
    ];
    expect(() =>
      buildKeyStreamQuery({
        plans: [createPlan({ anchor: { keyProjection: createProjection({ propertyBlobs: {}, sort: [sortColumn] }) } })],
        sorting: structSorting,
        cursor,
      }),
    ).toThrow(/not a primitive/);
  });
});

describe("buildValueQuery", () => {
  it("restricts the group to a page of ids via an IdSet join", () => {
    const baseQuery = createBaseQueryGroup({
      where: "WHERE [this].Code > :minCode",
      bindings: { minCode: { type: "string", value: "A" } },
    });
    const projection = createProjection({ bindings: { extra: { type: "int", value: 1 } } });
    const query = buildValueQuery({ baseQuery, projection, ids: ["0x1", "0x2"] });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT
          ec_classname([this].[ECClassId], 's.c') AS [pres_primary_class],
          [this].[ECInstanceId] AS [pres_primary_id],
          [this].$ AS [this]
        FROM [Schema].[A] [this]
        JOIN IdSet(:pres_page_ids) [pres_page] ON [pres_page].[id] = [this].[ECInstanceId]
        WHERE [this].Code > :minCode
      `),
    );
    expect(query.bindings).to.deep.equal({
      minCode: { type: "string", value: "A" },
      extra: { type: "int", value: 1 },
      ["pres_page_ids"]: { type: "idset", value: ["0x1", "0x2"] },
    });
  });
});
