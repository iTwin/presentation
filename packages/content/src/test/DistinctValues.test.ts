/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { trimWhitespace } from "@itwin/presentation-shared";
import { buildDistinctValuesQuery, getDistinctFieldValues } from "../content/DistinctValues.js";
import { ECSQL_PREFIX } from "../content/InternalUtils.js";

import type {
  ConcatenatedValue,
  EC,
  ECSchemaProvider,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  IInstanceLabelSelectClauseFactory,
  RelationshipPath,
  Value,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../content/Content.js";
import type { ContentTarget } from "../content/ContentTarget.js";
import type { CalculatedField, PropertyField } from "../content/model/Field.js";

function makePropertyField(props: Partial<PropertyField> & Pick<PropertyField, "propertyName">): PropertyField {
  return {
    kind: "property",
    id: props.id ?? `field-${props.propertyName}`,
    label: props.propertyName,
    type: props.type ?? { kind: "primitive", type: "String" },
    propertyClassName: props.propertyClassName ?? "TestSchema.Primary",
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: props.valueClassNames ?? ["TestSchema.Primary"],
    primaryClassNames: props.primaryClassNames ?? ["TestSchema.Primary"],
    pathCardinality: "one",
    selectorId: props.selectorId ?? `selector-${props.propertyName}`,
  };
}

/**
 * A schema provider stub with no navigation properties, so relationship steps render as link-table
 * joins (mirrors `BaseQuery.test.ts`'s stub).
 */
const schemaProvider = {
  getSchema: async (schemaName: string) => ({
    getClass: (className: string) => ({
      fullName: `${schemaName}.${className}`,
      getProperties: () => [],
      isRelationshipClass: () => className.startsWith("Rel"),
      source: { multiplicity: { lowerLimit: 0, upperLimit: 1 } },
      target: { multiplicity: { lowerLimit: 0, upperLimit: className.includes("Many") ? 2 : 1 } },
    }),
  }),
} as unknown as ECSchemaProvider;

/**
 * Creates an `ECSqlQueryExecutor & ECSchemaProvider` whose `createQueryReader` dispatches rows by
 * looking up which `marker` (a distinguishing class name in `FROM [...]`) the generated query's
 * `ecsql` contains, so each `ContentTarget`'s distinct query can be given its own canned rows.
 */
function createMockIModelAccess(props: {
  rowsByMarker: Map<string, ECSqlQueryRow[]>;
  onReaderReturn?: (marker: string) => void;
}): ECSqlQueryExecutor & ECSchemaProvider {
  return {
    ...schemaProvider,
    createQueryReader: vi.fn((query: ECSqlQueryDef): AsyncIterableIterator<ECSqlQueryRow> => {
      const marker = [...props.rowsByMarker.keys()].find((candidate) => query.ecsql.includes(`[${candidate}]`));
      const rows = marker ? (props.rowsByMarker.get(marker) ?? []) : [];
      async function* generate(): AsyncGenerator<ECSqlQueryRow> {
        try {
          for (const row of rows) {
            yield row;
          }
        } finally {
          if (marker) {
            props.onReaderReturn?.(marker);
          }
        }
      }
      return generate();
    }),
  };
}

/**
 * A labels factory stub that selects a single column, so a test's expected ECSQL doesn't depend on the
 * real label clause factories' output.
 */
const labelsFactory: IInstanceLabelSelectClauseFactory = {
  createSelectClause: async ({ classAlias }) => `[${classAlias}].[Label]`,
};

describe("getDistinctFieldValues", () => {
  const targetA: ContentTarget = { primaryClass: "TestSchema.ClassA" };
  const targetB: ContentTarget = { primaryClass: "TestSchema.ClassB" };

  it("yields the raw values from a single target's query", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: "a" }, { 0: "b" }]]]) });
    const field = makePropertyField({ propertyName: "Name" });

    const results = await collect(getDistinctFieldValues({ imodelAccess, targets: [targetA], field }));

    expect(results).to.deep.equal(["a", "b"]);
  });

  it("yields a raw SQL-NULL (`undefined`) row value as a valid distinct value", async () => {
    const imodelAccess = createMockIModelAccess({
      rowsByMarker: new Map([["ClassA", [{ 0: undefined }, { 0: "a" }]]]),
    });
    const field = makePropertyField({ propertyName: "Name" });

    const results = await collect(getDistinctFieldValues({ imodelAccess, targets: [targetA], field }));

    expect(results).to.deep.equal([undefined, "a"]);
  });

  it("converts point row values from the reader's uppercase-coordinate shape to `Point2dValue`/`Point3dValue`", async () => {
    const point2dAccess = createMockIModelAccess({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the reader's row shape
      rowsByMarker: new Map([["ClassA", [{ 0: { X: 1, Y: 2 } }, { 0: undefined }]]]),
    });
    const point2dField = makePropertyField({ propertyName: "Location", type: { kind: "primitive", type: "Point2d" } });
    expect(
      await collect(getDistinctFieldValues({ imodelAccess: point2dAccess, targets: [targetA], field: point2dField })),
    ).to.deep.equal([{ x: 1, y: 2 }, undefined]);

    const point3dAccess = createMockIModelAccess({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the reader's row shape
      rowsByMarker: new Map([["ClassA", [{ 0: { X: 1, Y: 2, Z: 3 } }]]]),
    });
    const point3dField = makePropertyField({ propertyName: "Origin", type: { kind: "primitive", type: "Point3d" } });
    expect(
      await collect(getDistinctFieldValues({ imodelAccess: point3dAccess, targets: [targetA], field: point3dField })),
    ).to.deep.equal([{ x: 1, y: 2, z: 3 }]);
  });

  it("yields a calculated field's scalar row value as-is, even when it declares a point type", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: 42 }]]]) });
    // A calculated field's selector is an arbitrary scalar expression, so its declared type doesn't
    // constrain the row shape — the raw scalar must not be reinterpreted as a point.
    const field: CalculatedField = {
      kind: "calculated",
      id: "calc",
      label: "Calc",
      type: { kind: "primitive", type: "Point2d" },
      expression: "this.X + this.Y",
      selectorId: "calc",
    };

    expect(await collect(getDistinctFieldValues({ imodelAccess, targets: [targetA], field }))).to.deep.equal([42]);
  });

  it("executes one query per target and merges their results", async () => {
    const imodelAccess = createMockIModelAccess({
      rowsByMarker: new Map([
        ["ClassA", [{ 0: "a" }]],
        ["ClassB", [{ 0: "b" }]],
      ]),
    });
    const field = makePropertyField({ propertyName: "Name" });

    const results = await collect(getDistinctFieldValues({ imodelAccess, targets: [targetA, targetB], field }));

    expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    expect(results.slice().sort()).to.deep.equal(["a", "b"]);
  });

  it("de-duplicates values across targets using a stable structural key", async () => {
    const imodelAccess = createMockIModelAccess({
      rowsByMarker: new Map([
        ["ClassA", [{ 0: { x: 1, y: 2 } }, { 0: "shared" }]],
        ["ClassB", [{ 0: { x: 1, y: 2 } }, { 0: "shared" }, { 0: "onlyB" }]],
      ]),
    });
    // The field's declared type only drives query *construction* (its selector/binding); the mocked
    // reader below controls the raw row values actually observed, independent of that declared type,
    // so a plain scalar field is used here to avoid `resolveSelector`'s point/struct member restriction.
    const field = makePropertyField({ propertyName: "Location" });

    const results = await collect(getDistinctFieldValues({ imodelAccess, targets: [targetA, targetB], field }));

    // Separately allocated but structurally equal point/string values collapse to one entry each, even
    // though they came from two different targets' queries.
    expect(results).to.have.length(3);
    expect(results).to.deep.include({ x: 1, y: 2 });
    expect(results).to.deep.include("shared");
    expect(results).to.deep.include("onlyB");
  });

  it("builds and applies value filters, forwarding them into the generated query", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: "a" }]]]) });
    const field = makePropertyField({ propertyName: "Name" });
    const filterField = makePropertyField({ propertyName: "Category" });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await collect(getDistinctFieldValues({ imodelAccess, targets: [targetA], field, filters }));

    const [query] = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
    expect(query.ecsql).to.include("SELECT DISTINCT [this].[Name]");
    expect(query.ecsql).to.include("[this].[Category] IS NOT NULL");
  });

  it("propagates an error thrown by a query reader", async () => {
    const queryError = new Error("query failed");
    const imodelAccess = {
      ...schemaProvider,
      createQueryReader: vi.fn((): AsyncIterableIterator<ECSqlQueryRow> =>
        (async function* (): AsyncGenerator<ECSqlQueryRow> {
          throw queryError;
        })(),
      ),
    } as unknown as ECSqlQueryExecutor & ECSchemaProvider;
    const field = makePropertyField({ propertyName: "Name" });

    await expect(collect(getDistinctFieldValues({ imodelAccess, targets: [targetA], field }))).rejects.toThrow(
      "query failed",
    );
  });

  it("releases the query reader when the consumer stops iterating early", async () => {
    let returned = false;
    const imodelAccess = {
      ...schemaProvider,
      createQueryReader: vi.fn((): AsyncIterableIterator<ECSqlQueryRow> => {
        async function* generate(): AsyncGenerator<ECSqlQueryRow> {
          try {
            yield { 0: "a" };
            yield { 0: "b" };
            yield { 0: "c" };
          } finally {
            returned = true;
          }
        }
        return generate();
      }),
    } as unknown as ECSqlQueryExecutor & ECSchemaProvider;
    const field = makePropertyField({ propertyName: "Name" });

    const results: Value[] = [];
    for await (const value of getDistinctFieldValues({ imodelAccess, targets: [targetA], field })) {
      results.push(value);
      break;
    }

    // Stopping iteration early must reliably trigger reader cleanup (the `finally` block, and thus
    // `reader.return()`, runs), regardless of how many rows the reader had already produced.
    expect(results).to.deep.equal(["a"]);
    expect(returned).to.equal(true);
  });

  it("re-iterating the returned AsyncIterable re-runs the query and de-duplicates independently", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: "a" }, { 0: "a" }]]]) });
    const field = makePropertyField({ propertyName: "Name" });

    const iterable = getDistinctFieldValues({ imodelAccess, targets: [targetA], field });

    expect(await collect(iterable)).to.deep.equal(["a"]);
    expect(await collect(iterable)).to.deep.equal(["a"]);
    expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
  });

  describe("navigation fields", () => {
    const navigationField = makePropertyField({
      propertyName: "Parent",
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
    });

    it("yields the target instances' keys and labels", async () => {
      const concatenatedLabel: ConcatenatedValue = [{ type: "String", value: "Target" }, " 2"];
      const imodelAccess = createMockIModelAccess({
        rowsByMarker: new Map([
          [
            "ClassA",
            [
              { 0: "0x1", 1: "TestSchema.Target", 2: "Target 1" },
              // A JSON label selector's result is parsed back into a `ConcatenatedValue`.
              { 0: "0x2", 1: "TestSchema.SubTarget", 2: JSON.stringify(concatenatedLabel) },
            ],
          ],
        ]),
      });

      const results = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [targetA], field: navigationField, labelsFactory }),
      );

      expect(results).to.deep.equal([
        { key: { className: "TestSchema.Target", id: "0x1" }, label: "Target 1" },
        { key: { className: "TestSchema.SubTarget", id: "0x2" }, label: concatenatedLabel },
      ]);
    });

    it("yields two target instances sharing a label as separate entries", async () => {
      const imodelAccess = createMockIModelAccess({
        rowsByMarker: new Map([
          [
            "ClassA",
            [
              { 0: "0x1", 1: "TestSchema.Target", 2: "shared label" },
              { 0: "0x2", 1: "TestSchema.Target", 2: "shared label" },
            ],
          ],
        ]),
      });

      const results = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [targetA], field: navigationField, labelsFactory }),
      );

      // Instances are de-duplicated by id, not by label — grouping same-labeled instances is the
      // consumer's job.
      expect(results).to.deep.equal([
        { key: { className: "TestSchema.Target", id: "0x1" }, label: "shared label" },
        { key: { className: "TestSchema.Target", id: "0x2" }, label: "shared label" },
      ]);
    });

    it("de-duplicates by target instance id, even when the label differs between rows", async () => {
      const imodelAccess = createMockIModelAccess({
        rowsByMarker: new Map([
          ["ClassA", [{ 0: "0x1", 1: "TestSchema.Target", 2: "label" }]],
          ["ClassB", [{ 0: "0x1", 1: "TestSchema.Target", 2: "a different label" }]],
        ]),
      });

      const results = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [targetA, targetB], field: navigationField, labelsFactory }),
      );

      expect(results).to.deep.equal([{ key: { className: "TestSchema.Target", id: "0x1" }, label: "label" }]);
    });

    it("yields a NULL navigation value as `undefined`", async () => {
      const imodelAccess = createMockIModelAccess({
        rowsByMarker: new Map([
          [
            "ClassA",
            [
              { 0: undefined, 1: undefined, 2: undefined },
              { 0: "0x1", 1: "TestSchema.Target", 2: "Target 1" },
            ],
          ],
        ]),
      });

      const results = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [targetA], field: navigationField, labelsFactory }),
      );

      expect(results).to.deep.equal([
        undefined,
        { key: { className: "TestSchema.Target", id: "0x1" }, label: "Target 1" },
      ]);
    });

    it("uses the supplied labels factory to select the target instances' labels", async () => {
      const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", []]]) });
      const customLabelsFactory: IInstanceLabelSelectClauseFactory = {
        createSelectClause: vi.fn(async ({ classAlias }) => `[${classAlias}].[MyLabel]`),
      };

      await collect(
        getDistinctFieldValues({
          imodelAccess,
          targets: [targetA],
          field: navigationField,
          labelsFactory: customLabelsFactory,
        }),
      );

      expect(customLabelsFactory.createSelectClause).toHaveBeenCalledWith({
        classAlias: "navTarget",
        className: "TestSchema.Target",
      });
      const [query] = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
      expect(query.ecsql).to.include("[navTarget].[MyLabel]");
    });
  });
});

describe("buildDistinctValuesQuery", () => {
  const primaryClass: EC.FullClassNameDotNotation = "TestSchema.Primary";
  const target: ContentTarget = { primaryClass };

  function makeStep(
    sourceClassName: EC.FullClassNameDotNotation,
    relationshipName: EC.FullClassNameDotNotation,
    targetClassName: EC.FullClassNameDotNotation,
  ): RelationshipPath[number] {
    return { sourceClassName, relationshipName, targetClassName };
  }

  it("builds a SELECT DISTINCT for a direct property with no filters (omitted)", async () => {
    const field = makePropertyField({ propertyName: "Name" });

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory });

    expect(trimWhitespace(query.ecsql)).to.equal(`SELECT DISTINCT [this].[Name] FROM [TestSchema].[Primary] [this]`);
    expect(query.bindings).to.be.undefined;
  });

  it("resolves a related property column against the target alias", async () => {
    const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
    const field = makePropertyField({
      propertyName: "Name",
      propertyClassName: "TestSchema.Target",
      pathFromTarget: path,
      valueClassNames: ["TestSchema.Target"],
    });

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, filters: [], labelsFactory });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [${ECSQL_PREFIX}t0].[Name]
        FROM [TestSchema].[Primary] [this]
        LEFT OUTER JOIN (
          SELECT [${ECSQL_PREFIX}r0].*
          FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
          INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
        LEFT OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
      `),
    );
  });

  it("builds a SELECT DISTINCT for a calculated field, substituting the target alias and merging bindings", async () => {
    const field: CalculatedField = {
      kind: "calculated",
      id: "calc",
      label: "Calc",
      type: { kind: "primitive", type: "String" },
      expression: "this.CodeValue || :scale",
      bindings: { scale: { type: "double", value: 2 } },
      selectorId: "calc",
    };

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory });

    expect(trimWhitespace(query.ecsql)).to.equal(
      `SELECT DISTINCT ([this].CodeValue || :scale) FROM [TestSchema].[Primary] [this]`,
    );
    expect(query.bindings).to.deep.equal({ scale: { type: "double", value: 2 } });
  });

  it("wraps the distinct-ids query and joins them to the navigation target class polymorphically, selecting its key and label", async () => {
    const field = makePropertyField({
      propertyName: "Parent",
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
    });

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [navIds].[id], ec_classname([navTarget].[ECClassId], 's.c'), [navTarget].[Label]
        FROM (
          SELECT DISTINCT [this].[Parent].[Id] AS [id] FROM [TestSchema].[Primary] [this]
        ) [navIds]
        LEFT JOIN [TestSchema].[Target] [navTarget] ON [navTarget].[ECInstanceId] = [navIds].[id]
      `),
    );
  });

  it("carries a value filter's bindings through to the wrapped navigation query", async () => {
    const field = makePropertyField({
      propertyName: "Parent",
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
    });
    const filterField = makePropertyField({ propertyName: "Category" });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-equal", value: "abc" }];

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, filters, labelsFactory });

    expect(query.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "abc" } });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [navIds].[id], ec_classname([navTarget].[ECClassId], 's.c'), [navTarget].[Label]
        FROM (
          SELECT DISTINCT [this].[Parent].[Id] AS [id]
          FROM [TestSchema].[Primary] [this]
          WHERE [this].[Category] = :${ECSQL_PREFIX}vf0
        ) [navIds]
        LEFT JOIN [TestSchema].[Target] [navTarget] ON [navTarget].[ECInstanceId] = [navIds].[id]
      `),
    );
  });

  it("wraps the inner query's own related path joins when the navigation property itself is related", async () => {
    const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Other")];
    const field = makePropertyField({
      propertyName: "Parent",
      propertyClassName: "TestSchema.Other",
      pathFromTarget: path,
      valueClassNames: ["TestSchema.Other"],
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
    });

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [navIds].[id], ec_classname([navTarget].[ECClassId], 's.c'), [navTarget].[Label]
        FROM (
          SELECT DISTINCT [${ECSQL_PREFIX}t0].[Parent].[Id] AS [id]
          FROM [TestSchema].[Primary] [this]
          LEFT OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r0].*
            FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Other] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          LEFT OUTER JOIN [TestSchema].[Other] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        ) [navIds]
        LEFT JOIN [TestSchema].[Target] [navTarget] ON [navTarget].[ECInstanceId] = [navIds].[id]
      `),
    );
  });

  it("uses the supplied labels factory for the navigation target's label", async () => {
    const field = makePropertyField({
      propertyName: "Parent",
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
    });
    const customLabelsFactory: IInstanceLabelSelectClauseFactory = {
      createSelectClause: vi.fn(async ({ classAlias, className }) => `'${className}' || [${classAlias}].[Code]`),
    };

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory: customLabelsFactory });

    expect(customLabelsFactory.createSelectClause).toHaveBeenCalledWith({
      classAlias: "navTarget",
      className: "TestSchema.Target",
    });
    expect(query.ecsql).to.include(`'TestSchema.Target' || [navTarget].[Code]`);
  });

  it("selects a whole point column", async () => {
    const field = makePropertyField({ propertyName: "Location", type: { kind: "primitive", type: "Point3d" } });

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory });

    expect(trimWhitespace(query.ecsql)).to.equal(
      `SELECT DISTINCT [this].[Location] FROM [TestSchema].[Primary] [this]`,
    );
  });

  it.each<{ type: ValueDescriptor; expectedKind: string }>([
    { type: { kind: "array", elementType: { kind: "primitive", type: "String" } }, expectedKind: "array" },
    { type: { kind: "struct", members: [] }, expectedKind: "struct" },
  ])("rejects $expectedKind fields with a distinct-values-specific error", async ({ type, expectedKind }) => {
    const field = makePropertyField({ propertyName: "Composite", type });

    await expect(buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory })).rejects.toThrow(
      `Getting distinct values for ${expectedKind} fields is not supported.`,
    );
  });

  it("joins and filters on a related path referenced only by a value filter (not the selected field)", async () => {
    const directField = makePropertyField({ propertyName: "Name" });
    const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
    const filterField = makePropertyField({
      propertyName: "Flag",
      propertyClassName: "TestSchema.Target",
      pathFromTarget: path,
      valueClassNames: ["TestSchema.Target"],
    });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-equal", value: "abc" }];

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field: directField,
      filters,
      labelsFactory,
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [this].[Name]
        FROM [TestSchema].[Primary] [this]
        LEFT OUTER JOIN (
          SELECT [${ECSQL_PREFIX}r0].*
          FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
          INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
        LEFT OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        WHERE [${ECSQL_PREFIX}t0].[Flag] = :${ECSQL_PREFIX}vf0
      `),
    );
    expect(query.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "abc" } });
  });

  it("joins and filters on a 1:many related path referenced only by a value filter", async () => {
    const directField = makePropertyField({ propertyName: "Name" });
    const path = [makeStep(primaryClass, "TestSchema.RelMany", "TestSchema.Many")];
    const filterField = makePropertyField({
      propertyName: "Flag",
      propertyClassName: "TestSchema.Many",
      pathFromTarget: path,
      valueClassNames: ["TestSchema.Many"],
    });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-equal", value: "abc" }];

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field: directField,
      filters,
      labelsFactory,
    });

    // Unlike `buildBaseQuery` — which spills 1:many filter paths into correlated subqueries to avoid
    // duplicating primary rows — a 1:many path is joined and compared directly here, because
    // `SELECT DISTINCT` collapses the duplicate rows the join produces.
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [this].[Name]
        FROM [TestSchema].[Primary] [this]
        LEFT OUTER JOIN (
          SELECT [${ECSQL_PREFIX}r0].*
          FROM [TestSchema].[RelMany] [${ECSQL_PREFIX}r0]
          INNER JOIN [TestSchema].[Many] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
        LEFT OUTER JOIN [TestSchema].[Many] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        WHERE [${ECSQL_PREFIX}t0].[Flag] = :${ECSQL_PREFIX}vf0
      `),
    );
    expect(query.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "abc" } });
  });

  it("de-duplicates the selected field's own path with an identical filter path", async () => {
    const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
    const field = makePropertyField({
      propertyName: "Name",
      propertyClassName: "TestSchema.Target",
      pathFromTarget: path,
      valueClassNames: ["TestSchema.Target"],
    });
    const filters: ContentValueFilter[] = [{ field, operator: "is-not-null" }];

    const query = await buildDistinctValuesQuery({ schemaProvider, target, field, filters, labelsFactory });

    // The path is joined exactly once even though both the selector and the filter reference it.
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [${ECSQL_PREFIX}t0].[Name]
        FROM [TestSchema].[Primary] [this]
        LEFT OUTER JOIN (
          SELECT [${ECSQL_PREFIX}r0].*
          FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
          INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
        LEFT OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        WHERE [${ECSQL_PREFIX}t0].[Name] IS NOT NULL
      `),
    );
  });

  it("scopes the query to the target's instance IDs and instance filter", async () => {
    const field = makePropertyField({ propertyName: "Name" });

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target: { primaryClass, instanceIds: ["0x1"], instanceFilter: { expression: "this.Area > 5" } },
      field,
      labelsFactory,
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [this].[Name]
        FROM [TestSchema].[Primary] [this]
        JOIN IdSet(:${ECSQL_PREFIX}TargetInstanceIds) [${ECSQL_PREFIX}TargetInstanceIds] ON [${ECSQL_PREFIX}TargetInstanceIds].[id] = [this].[ECInstanceId]
        WHERE [this].Area > 5
      `),
    );
    expect(query.bindings).to.deep.equal({ [`${ECSQL_PREFIX}TargetInstanceIds`]: { type: "idset", value: ["0x1"] } });
  });
});
