/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { trimWhitespace } from "@itwin/presentation-shared";
import {
  buildDistinctValuesQuery,
  getDistinctFieldValues,
  validateFilterApplicability,
} from "../content/DistinctValues.js";
import { ECSQL_PREFIX } from "../content/InternalUtils.js";
import { createEntityClass, createMixinClass, createRelationshipClass, createSchemaAccess } from "./MetadataStubs.js";

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
  classDerivesFrom: async (derivedClassFullName: string, candidateBaseClassFullName: string) =>
    derivedClassFullName === candidateBaseClassFullName || candidateBaseClassFullName === "TestSchema.Primary",
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

/**
 * Creates an `ECSqlQueryExecutor & ECSchemaProvider` backed by a *real* class hierarchy (so
 * `classDerivesFrom` and base-class walking behave like production), with a `createQueryReader` that
 * records every executed query and replays one canned row set.
 */
function createHierarchyIModelAccess(props: {
  classes: EC.Class[];
  rows?: ECSqlQueryRow[];
}): ECSqlQueryExecutor & ECSchemaProvider {
  return {
    ...createSchemaAccess(props.classes),
    createQueryReader: vi.fn((_query: ECSqlQueryDef): AsyncIterableIterator<ECSqlQueryRow> => {
      async function* generate(): AsyncGenerator<ECSqlQueryRow> {
        for (const row of props.rows ?? []) {
          yield row;
        }
      }
      return generate();
    }),
  };
}

describe("getDistinctFieldValues", () => {
  it("yields the raw values from a single resolved class's query", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: "a" }, { 0: "b" }]]]) });
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });

    const results = await collect(getDistinctFieldValues({ imodelAccess, field }));

    expect(results).to.deep.equal(["a", "b"]);
  });

  it("yields a raw SQL-NULL (`undefined`) row value as a valid distinct value", async () => {
    const imodelAccess = createMockIModelAccess({
      rowsByMarker: new Map([["ClassA", [{ 0: undefined }, { 0: "a" }]]]),
    });
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });

    const results = await collect(getDistinctFieldValues({ imodelAccess, field }));

    expect(results).to.deep.equal([undefined, "a"]);
  });

  it("converts point row values from the reader's uppercase-coordinate shape to `Point2dValue`/`Point3dValue`", async () => {
    const point2dAccess = createMockIModelAccess({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the reader's row shape
      rowsByMarker: new Map([["ClassA", [{ 0: { X: 1, Y: 2 } }, { 0: undefined }]]]),
    });
    const point2dField = makePropertyField({
      propertyName: "Location",
      type: { kind: "primitive", type: "Point2d" },
      primaryClassNames: ["TestSchema.ClassA"],
    });
    expect(await collect(getDistinctFieldValues({ imodelAccess: point2dAccess, field: point2dField }))).to.deep.equal([
      { x: 1, y: 2 },
      undefined,
    ]);

    const point3dAccess = createMockIModelAccess({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the reader's row shape
      rowsByMarker: new Map([["ClassA", [{ 0: { X: 1, Y: 2, Z: 3 } }]]]),
    });
    const point3dField = makePropertyField({
      propertyName: "Origin",
      type: { kind: "primitive", type: "Point3d" },
      primaryClassNames: ["TestSchema.ClassA"],
    });
    expect(await collect(getDistinctFieldValues({ imodelAccess: point3dAccess, field: point3dField }))).to.deep.equal([
      { x: 1, y: 2, z: 3 },
    ]);
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
      primaryClassNames: ["TestSchema.ClassA"],
    };

    expect(await collect(getDistinctFieldValues({ imodelAccess, field }))).to.deep.equal([42]);
  });

  it("executes one query per resolved class and merges their results", async () => {
    const imodelAccess = createMockIModelAccess({
      rowsByMarker: new Map([
        ["ClassA", [{ 0: "a" }]],
        ["ClassB", [{ 0: "b" }]],
      ]),
    });
    const field = makePropertyField({
      propertyName: "Name",
      primaryClassNames: ["TestSchema.ClassA", "TestSchema.ClassB"],
    });

    const results = await collect(getDistinctFieldValues({ imodelAccess, field }));

    expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    expect(results.slice().sort()).to.deep.equal(["a", "b"]);
  });

  it("de-duplicates values across resolved classes using a stable structural key", async () => {
    const imodelAccess = createMockIModelAccess({
      rowsByMarker: new Map([
        ["ClassA", [{ 0: { x: 1, y: 2 } }, { 0: "shared" }]],
        ["ClassB", [{ 0: { x: 1, y: 2 } }, { 0: "shared" }, { 0: "onlyB" }]],
      ]),
    });
    // The field's declared type only drives query *construction* (its selector/binding); the mocked
    // reader below controls the raw row values actually observed, independent of that declared type,
    // so a plain scalar field is used here to avoid `resolveSelector`'s point/struct member restriction.
    const field = makePropertyField({
      propertyName: "Location",
      primaryClassNames: ["TestSchema.ClassA", "TestSchema.ClassB"],
    });

    const results = await collect(getDistinctFieldValues({ imodelAccess, field }));

    // Separately allocated but structurally equal point/string values collapse to one entry each, even
    // though they came from two different classes' queries.
    expect(results).to.have.length(3);
    expect(results).to.deep.include({ x: 1, y: 2 });
    expect(results).to.deep.include("shared");
    expect(results).to.deep.include("onlyB");
  });

  it("builds and applies value filters, forwarding them into the generated query", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: "a" }]]]) });
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });
    // Same class as `field` — the minimal `schemaProvider` stub's `classDerivesFrom` only recognizes
    // self-derivation, so the filter's class must match exactly to pass `validateFilterApplicability`.
    const filterField = makePropertyField({ propertyName: "Category", propertyClassName: "TestSchema.ClassA" });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await collect(getDistinctFieldValues({ imodelAccess, field, filters }));

    const [query] = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
    expect(query.ecsql).to.include("SELECT DISTINCT [this].[Name]");
    expect(query.ecsql).to.include("[this].[Category] IS NOT NULL");
  });

  it("rejects a filter that is not accessible from the selected field's resolved class, before running any query", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: "a" }]]]) });
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });
    const filterField = makePropertyField({ propertyName: "Category", propertyClassName: "TestSchema.ClassB" });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(collect(getDistinctFieldValues({ imodelAccess, field, filters }))).rejects.toThrow(
      /Cannot apply filter on property "TestSchema.ClassB.Category"/,
    );
    expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();
  });

  it("scopes every resolved class's query to the given instance IDs and instance filter", async () => {
    const imodelAccess = createMockIModelAccess({ rowsByMarker: new Map([["ClassA", [{ 0: "a" }]]]) });
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });

    await collect(
      getDistinctFieldValues({
        imodelAccess,
        field,
        instanceFiltering: { ids: ["0x1"], filter: { expression: "this.Area > 5" } },
      }),
    );

    const [query] = vi.mocked(imodelAccess.createQueryReader).mock.calls[0];
    expect(query.ecsql).to.include("JOIN IdSet(");
    expect(query.ecsql).to.include("WHERE [this].Area > 5");
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
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });

    await expect(collect(getDistinctFieldValues({ imodelAccess, field }))).rejects.toThrow("query failed");
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
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });

    const results: Value[] = [];
    for await (const value of getDistinctFieldValues({ imodelAccess, field })) {
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
    const field = makePropertyField({ propertyName: "Name", primaryClassNames: ["TestSchema.ClassA"] });

    const iterable = getDistinctFieldValues({ imodelAccess, field });

    expect(await collect(iterable)).to.deep.equal(["a"]);
    expect(await collect(iterable)).to.deep.equal(["a"]);
    expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
  });

  describe("collapsing resolved classes into a single query", () => {
    // Base <- Derived <- A1
    //                 <- A2
    // plus `Sibling` directly under `Base`, and mixin `IMix` implemented only by the leaves.
    const base = createEntityClass({ fullName: "TestSchema.Base" });
    const derived = createEntityClass({ fullName: "TestSchema.Derived", baseClass: base });
    const mixin = createMixinClass({ fullName: "TestSchema.IMix" });
    const a1 = createEntityClass({ fullName: "TestSchema.A1", baseClass: derived, mixins: [mixin] });
    const a2 = createEntityClass({ fullName: "TestSchema.A2", baseClass: derived, mixins: [mixin] });
    const sibling = createEntityClass({ fullName: "TestSchema.Sibling", baseClass: base });
    const classes = [base, derived, mixin, a1, a2, sibling];

    function executedQuery(imodelAccess: ECSqlQueryExecutor & ECSchemaProvider, callIndex = 0): string {
      return vi.mocked(imodelAccess.createQueryReader).mock.calls[callIndex][0].ecsql;
    }

    it("runs one query against the nearest common base class, restricted to the resolved classes", async () => {
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      const field = makePropertyField({
        propertyName: "PropBase",
        propertyClassName: base.fullName,
        primaryClassNames: [a1.fullName, a2.fullName],
      });

      const results = await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(results).to.deep.equal(["a"]);
      // `Derived` (not `Base`) is the *nearest* common ancestor, keeping the scanned subtree minimal.
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(1);
      expect(executedQuery(imodelAccess)).to.include(`FROM [TestSchema].[Derived] [this]`);
      expect(executedQuery(imodelAccess)).to.include(
        `[this].[ECClassId] IS (ONLY [TestSchema].[A1], ONLY [TestSchema].[A2])`,
      );
    });

    it("stops at the nearest common ancestor even with several branches below it", async () => {
      // Base <- Derived <- Branch{i} <- Branch{i}Child, for i in 0..2. Every branch only shares
      // `Derived` with the others (not with each other directly), so `Derived` is the nearest
      // ancestor covering all of them — climbing further to `Base` would be unnecessary.
      const wideBase = createEntityClass({ fullName: "TestSchema.WideBase" });
      const wideDerived = createEntityClass({ fullName: "TestSchema.WideDerived", baseClass: wideBase });
      const branches = Array.from({ length: 3 }, (_, i) =>
        createEntityClass({ fullName: `TestSchema.Branch${i}`, baseClass: wideDerived }),
      );
      const branchChildren = branches.map((branch, i) =>
        createEntityClass({ fullName: `TestSchema.Branch${i}Child`, baseClass: branch }),
      );
      const wideImodelAccess = createHierarchyIModelAccess({
        classes: [wideBase, wideDerived, ...branches, ...branchChildren],
        rows: [{ 0: "a" }],
      });
      const field = makePropertyField({
        propertyName: "SharedProp",
        propertyClassName: wideBase.fullName,
        primaryClassNames: [...branches.map((b) => b.fullName), ...branchChildren.map((c) => c.fullName)],
      });

      await collect(getDistinctFieldValues({ imodelAccess: wideImodelAccess, field }));

      expect(wideImodelAccess.createQueryReader).toHaveBeenCalledTimes(1);
      expect(executedQuery(wideImodelAccess)).to.include(`FROM [TestSchema].[WideDerived] [this]`);
      expect(executedQuery(wideImodelAccess)).to.not.include(`FROM [TestSchema].[WideBase]`);
    });

    it("bounds the search to a related field's path source class, not its far-side property class", async () => {
      // `PropRelated` is reached via a relationship declared from `Derived`; the actual property
      // lives on the unrelated `Target` class. The anchor search must stop at `Derived` — the class
      // the path is declared from — rather than climbing to `Base` (unnecessary) or ever considering
      // `Target` (which isn't even in `A1`/`A2`'s inheritance chain, so climbing to it would be wrong).
      const target = createEntityClass({ fullName: "TestSchema.Target" });
      const rel = createRelationshipClass({ fullName: "TestSchema.Rel" });
      const imodelAccess = createHierarchyIModelAccess({ classes: [...classes, target, rel], rows: [{ 0: "a" }] });
      const field = makePropertyField({
        propertyName: "PropRelated",
        propertyClassName: "TestSchema.Target",
        pathFromTarget: [
          {
            sourceClassName: derived.fullName,
            targetClassName: "TestSchema.Target",
            relationshipName: "TestSchema.Rel",
          },
        ],
        primaryClassNames: [a1.fullName, a2.fullName],
      });

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(1);
      expect(executedQuery(imodelAccess)).to.include(`FROM [TestSchema].[Derived] [this]`);
      expect(executedQuery(imodelAccess)).to.not.include(`FROM [TestSchema].[Base]`);
    });

    it("keeps `FROM ONLY` and omits the restriction for a single resolved class", async () => {
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      const field = makePropertyField({
        propertyName: "PropBase",
        propertyClassName: base.fullName,
        primaryClassNames: [a1.fullName],
      });

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(1);
      expect(executedQuery(imodelAccess)).to.include(`FROM ONLY [TestSchema].[A1] [this]`);
      expect(executedQuery(imodelAccess)).to.not.include("[ECClassId] IS");
    });

    it("does not collapse above a class the selected property is inaccessible from", async () => {
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      // The property is declared on `Derived`, so collapsing must stop there rather than reaching `Base`.
      const field = makePropertyField({
        propertyName: "PropDer",
        propertyClassName: derived.fullName,
        primaryClassNames: [a1.fullName, a2.fullName],
      });

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(executedQuery(imodelAccess)).to.include(`FROM [TestSchema].[Derived] [this]`);
    });

    it("rejects a filter the collapsed class cannot resolve", async () => {
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      // `A1` and `Sibling` collapse onto `Base`, their nearest common ancestor.
      const field = makePropertyField({
        propertyName: "PropBase",
        propertyClassName: base.fullName,
        primaryClassNames: [a1.fullName, sibling.fullName],
      });
      // `PropDer` is declared on `Derived`, which `Sibling` does not derive from — so the filter does
      // not apply to every resolved class, and `Base` cannot resolve it either.
      const filterField = makePropertyField({ propertyName: "PropDer", propertyClassName: derived.fullName });

      await expect(
        collect(
          getDistinctFieldValues({ imodelAccess, field, filters: [{ field: filterField, operator: "is-not-null" }] }),
        ),
      ).rejects.toThrow(/Cannot apply filter on property "TestSchema.Derived.PropDer"/);
      expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();
    });

    it("keeps a filter that the collapsed class can resolve", async () => {
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      const field = makePropertyField({
        propertyName: "PropBase",
        propertyClassName: base.fullName,
        primaryClassNames: [a1.fullName, a2.fullName],
      });
      // `A1`/`A2` collapse onto `Derived`, which declares `PropDer`, so the filter applies to both.
      const filterField = makePropertyField({ propertyName: "PropDer", propertyClassName: derived.fullName });

      await collect(
        getDistinctFieldValues({ imodelAccess, field, filters: [{ field: filterField, operator: "is-not-null" }] }),
      );

      expect(executedQuery(imodelAccess)).to.include(`FROM [TestSchema].[Derived] [this]`);
      expect(executedQuery(imodelAccess)).to.include(`[this].[PropDer]`);
    });

    it("falls back to per-class queries when no entity ancestor implements the declaring mixin", async () => {
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      // `IMix` is implemented by `A1`/`A2` but not by their entity ancestors, so neither `Derived` nor
      // `Base` can resolve the property — there is no collapsed `FROM` class to use.
      const field = makePropertyField({
        propertyName: "MixProp",
        propertyClassName: mixin.fullName,
        primaryClassNames: [a1.fullName, a2.fullName],
      });

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
      expect(executedQuery(imodelAccess, 0)).to.include(`FROM ONLY [TestSchema].[A1] [this]`);
      expect(executedQuery(imodelAccess, 1)).to.include(`FROM ONLY [TestSchema].[A2] [this]`);
    });

    it("groups resolved classes into the fewest queries rather than all-or-nothing", async () => {
      // A hierarchy of its own, kept clear of the enclosing `describe`'s identically-shaped one:
      //   MixBase <- MixDerived(:IShared) <- MixA1, MixA2
      //           <- MixSibling(:IShared)
      // `IShared` is implemented by `MixDerived` and by `MixSibling`, but not by their common base
      // `MixBase`. So `MixA1`/`MixA2` can collapse onto `MixDerived` while `MixSibling` cannot join
      // them — three resolved classes, but two queries rather than one or three.
      const sharedMixin = createMixinClass({ fullName: "TestSchema.IShared" });
      const mixBase = createEntityClass({ fullName: "TestSchema.MixBase" });
      const mixDerived = createEntityClass({
        fullName: "TestSchema.MixDerived",
        baseClass: mixBase,
        mixins: [sharedMixin],
      });
      const mixA1 = createEntityClass({ fullName: "TestSchema.MixA1", baseClass: mixDerived });
      const mixA2 = createEntityClass({ fullName: "TestSchema.MixA2", baseClass: mixDerived });
      const mixSibling = createEntityClass({
        fullName: "TestSchema.MixSibling",
        baseClass: mixBase,
        mixins: [sharedMixin],
      });
      const imodelAccess = createHierarchyIModelAccess({
        classes: [mixBase, mixDerived, sharedMixin, mixA1, mixA2, mixSibling],
        rows: [{ 0: "a" }],
      });
      const field = makePropertyField({
        propertyName: "SharedProp",
        propertyClassName: sharedMixin.fullName,
        primaryClassNames: [mixA1.fullName, mixA2.fullName, mixSibling.fullName],
      });

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
      expect(executedQuery(imodelAccess, 0)).to.include(`FROM [TestSchema].[MixDerived] [this]`);
      expect(executedQuery(imodelAccess, 0)).to.include(
        `[this].[ECClassId] IS (ONLY [TestSchema].[MixA1], ONLY [TestSchema].[MixA2])`,
      );
      // A group of one stays exactly scoped instead of being lifted onto `MixSibling`'s own subtree.
      expect(executedQuery(imodelAccess, 1)).to.include(`FROM ONLY [TestSchema].[MixSibling] [this]`);
      expect(executedQuery(imodelAccess, 1)).to.not.include("[ECClassId] IS");
    });

    it("restricts rows so a leaf class absent from the resolved classes cannot contribute", async () => {
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      // `A1` and `Sibling` collapse onto their nearest common ancestor `Base`. `A2` is `A1`'s sibling
      // under `Derived` and has data too, but is absent from `primaryClassNames` (e.g. carved away by
      // `forkField`) — the restriction must exclude it even though `FROM Base` polymorphically reaches
      // it (through `Derived`).
      const field = makePropertyField({
        propertyName: "PropBase",
        propertyClassName: base.fullName,
        primaryClassNames: [a1.fullName, sibling.fullName],
      });

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(executedQuery(imodelAccess)).to.include(`FROM [TestSchema].[Base] [this]`);
      expect(executedQuery(imodelAccess)).to.include(
        `[this].[ECClassId] IS (ONLY [TestSchema].[A1], ONLY [TestSchema].[Sibling])`,
      );
      // Neither `A2` (the excluded leaf) nor the intermediate `Derived` appears in the restriction.
      expect(executedQuery(imodelAccess)).to.not.include("[TestSchema].[A2]");
      expect(executedQuery(imodelAccess)).to.not.include("ONLY [TestSchema].[Derived]");
    });

    it("gives a calculated field one query per resolved class, without any schema lookups", async () => {
      // A calculated field has no declaring class: it is resolved for `primaryClassNames` as a set,
      // and those *are* its anchors (`getFieldAnchors`). So there is nothing to look up and nothing
      // to collapse — anchor resolution short-circuits without touching the schema provider, and each
      // resolved class gets its own exactly-scoped query.
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      const classDerivesFrom = vi.spyOn(imodelAccess, "classDerivesFrom");
      const getSchema = vi.spyOn(imodelAccess, "getSchema");
      const field: CalculatedField = {
        kind: "calculated",
        id: "calc",
        label: "Calc",
        type: { kind: "primitive", type: "String" },
        expression: "1",
        primaryClassNames: [a1.fullName, a2.fullName],
      };

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
      expect(executedQuery(imodelAccess, 0)).to.include(`FROM ONLY [TestSchema].[A1] [this]`);
      expect(executedQuery(imodelAccess, 1)).to.include(`FROM ONLY [TestSchema].[A2] [this]`);
      expect(classDerivesFrom).not.toHaveBeenCalled();
      expect(getSchema).not.toHaveBeenCalled();
    });

    it("never collapses a calculated field, even when one resolved class derives from another", async () => {
      // `A1` derives from `Derived`, so a *property* field would collapse the two onto `Derived`. A
      // calculated field does not: its expression is only known to be valid against the exact classes
      // it was resolved for, so each keeps its own exactly-scoped query.
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      const field: CalculatedField = {
        kind: "calculated",
        id: "calc",
        label: "Calc",
        type: { kind: "primitive", type: "String" },
        expression: "1",
        primaryClassNames: [derived.fullName, a1.fullName],
      };

      await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
      expect(executedQuery(imodelAccess, 0)).to.include(`FROM ONLY [TestSchema].[Derived] [this]`);
      expect(executedQuery(imodelAccess, 1)).to.include(`FROM ONLY [TestSchema].[A1] [this]`);
      expect(executedQuery(imodelAccess, 0)).to.not.include("[ECClassId] IS");
    });

    it("throws when the field is not resolvable from one of its resolved classes", async () => {
      // `Sibling` does not derive from `Derived`, so no ancestor of it could ever resolve `PropDer`.
      // Reported here rather than left to fail as an opaque backend "no such property" error.
      const imodelAccess = createHierarchyIModelAccess({ classes, rows: [{ 0: "a" }] });
      const field = makePropertyField({
        propertyName: "PropDer",
        propertyClassName: derived.fullName,
        primaryClassNames: [a1.fullName, sibling.fullName],
      });

      await expect(collect(getDistinctFieldValues({ imodelAccess, field }))).rejects.toThrow(
        /Cannot get distinct values for property "TestSchema.Derived.PropDer": it is not accessible from "TestSchema.Sibling"/,
      );
      expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();
    });
  });

  describe("navigation fields", () => {
    const navigationField = makePropertyField({
      propertyName: "Parent",
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
      primaryClassNames: ["TestSchema.ClassA"],
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

      const results = await collect(getDistinctFieldValues({ imodelAccess, field: navigationField, labelsFactory }));

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

      const results = await collect(getDistinctFieldValues({ imodelAccess, field: navigationField, labelsFactory }));

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
      const twoClassNavigationField: PropertyField = {
        ...navigationField,
        primaryClassNames: ["TestSchema.ClassA", "TestSchema.ClassB"],
      };

      const results = await collect(
        getDistinctFieldValues({ imodelAccess, field: twoClassNavigationField, labelsFactory }),
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

      const results = await collect(getDistinctFieldValues({ imodelAccess, field: navigationField, labelsFactory }));

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
        getDistinctFieldValues({ imodelAccess, field: navigationField, labelsFactory: customLabelsFactory }),
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

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      `SELECT DISTINCT [this].[Name] FROM ONLY [TestSchema].[Primary] [this]`,
    );
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

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      filters: [],
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [${ECSQL_PREFIX}t0].[Name]
        FROM ONLY [TestSchema].[Primary] [this]
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
      primaryClassNames: ["TestSchema.Primary"],
    };

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      `SELECT DISTINCT ([this].CodeValue || :scale) FROM ONLY [TestSchema].[Primary] [this]`,
    );
    expect(query.bindings).to.deep.equal({ scale: { type: "double", value: 2 } });
  });

  it("wraps the distinct-ids query and joins them to the navigation target class polymorphically, selecting its key and label", async () => {
    const field = makePropertyField({
      propertyName: "Parent",
      type: { kind: "navigation", targetClassName: "TestSchema.Target" },
    });

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [navIds].[id], ec_classname([navTarget].[ECClassId], 's.c'), [navTarget].[Label]
        FROM (
          SELECT DISTINCT [this].[Parent].[Id] AS [id] FROM ONLY [TestSchema].[Primary] [this]
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

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      filters,
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(query.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "abc" } });
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [navIds].[id], ec_classname([navTarget].[ECClassId], 's.c'), [navTarget].[Label]
        FROM (
          SELECT DISTINCT [this].[Parent].[Id] AS [id]
          FROM ONLY [TestSchema].[Primary] [this]
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

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT [navIds].[id], ec_classname([navTarget].[ECClassId], 's.c'), [navTarget].[Label]
        FROM (
          SELECT DISTINCT [${ECSQL_PREFIX}t0].[Parent].[Id] AS [id]
          FROM ONLY [TestSchema].[Primary] [this]
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

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      labelsFactory: customLabelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(customLabelsFactory.createSelectClause).toHaveBeenCalledWith({
      classAlias: "navTarget",
      className: "TestSchema.Target",
    });
    expect(query.ecsql).to.include(`'TestSchema.Target' || [navTarget].[Code]`);
  });

  it("selects a whole point column", async () => {
    const field = makePropertyField({ propertyName: "Location", type: { kind: "primitive", type: "Point3d" } });

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      `SELECT DISTINCT [this].[Location] FROM ONLY [TestSchema].[Primary] [this]`,
    );
  });

  it.each<{ type: ValueDescriptor; expectedKind: string }>([
    { type: { kind: "array", elementType: { kind: "primitive", type: "String" } }, expectedKind: "array" },
    { type: { kind: "struct", members: [] }, expectedKind: "struct" },
  ])("rejects $expectedKind fields with a distinct-values-specific error", async ({ type, expectedKind }) => {
    const field = makePropertyField({ propertyName: "Composite", type });

    await expect(
      buildDistinctValuesQuery({ schemaProvider, target, field, labelsFactory, primaryClassScope: { kind: "exact" } }),
    ).rejects.toThrow(`Getting distinct values for ${expectedKind} fields is not supported.`);
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
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [this].[Name]
        FROM ONLY [TestSchema].[Primary] [this]
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
      primaryClassScope: { kind: "exact" },
    });

    // Unlike `buildBaseQuery` — which spills 1:many filter paths into correlated subqueries to avoid
    // duplicating primary rows — a 1:many path is joined and compared directly here, because
    // `SELECT DISTINCT` collapses the duplicate rows the join produces.
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [this].[Name]
        FROM ONLY [TestSchema].[Primary] [this]
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

    const query = await buildDistinctValuesQuery({
      schemaProvider,
      target,
      field,
      filters,
      labelsFactory,
      primaryClassScope: { kind: "exact" },
    });

    // The path is joined exactly once even though both the selector and the filter reference it.
    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [${ECSQL_PREFIX}t0].[Name]
        FROM ONLY [TestSchema].[Primary] [this]
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
      primaryClassScope: { kind: "exact" },
    });

    expect(trimWhitespace(query.ecsql)).to.equal(
      trimWhitespace(`
        SELECT DISTINCT [this].[Name]
        FROM ONLY [TestSchema].[Primary] [this]
        JOIN IdSet(:${ECSQL_PREFIX}TargetInstanceIds) [${ECSQL_PREFIX}TargetInstanceIds] ON [${ECSQL_PREFIX}TargetInstanceIds].[id] = [this].[ECInstanceId]
        WHERE [this].Area > 5
      `),
    );
    expect(query.bindings).to.deep.equal({ [`${ECSQL_PREFIX}TargetInstanceIds`]: { type: "idset", value: ["0x1"] } });
  });
});

describe("validateFilterApplicability", () => {
  // Base <- Derived <- A1
  //                  <- A2
  // mirrors the canonical case filter validation must get right: with `A1`/`A2` collapsing onto
  // `Derived`, `PropDer` is a valid filter, but a property declared below or beside `Derived` is not.
  const base = createEntityClass({ fullName: "TestSchema.Base" });
  const derived = createEntityClass({ fullName: "TestSchema.Derived", baseClass: base });
  const a1 = createEntityClass({ fullName: "TestSchema.A1", baseClass: derived });
  const a2 = createEntityClass({ fullName: "TestSchema.A2", baseClass: derived });
  const sibling = createEntityClass({ fullName: "TestSchema.Sibling", baseClass: base });
  const hierarchySchemaProvider = createSchemaAccess([base, derived, a1, a2, sibling]);

  function makeCalculatedField(props: { primaryClassNames: EC.FullClassNameDotNotation[] }): CalculatedField {
    return {
      kind: "calculated",
      id: "calc",
      label: "Calc",
      type: { kind: "primitive", type: "String" },
      expression: "1",
      primaryClassNames: props.primaryClassNames,
    };
  }

  it("allows a filter declared on the class being queried from", async () => {
    const filterField = makePropertyField({ propertyName: "PropDer", propertyClassName: derived.fullName });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).resolves.toBeUndefined();
  });

  it("allows a filter declared on a base of the class being queried from", async () => {
    const filterField = makePropertyField({ propertyName: "PropBase", propertyClassName: base.fullName });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when the filter's property is declared beside the class being queried from", async () => {
    // `PropSibling` is declared on `Sibling`, a class `Derived` does not derive from.
    const filterField = makePropertyField({ propertyName: "PropSibling", propertyClassName: sibling.fullName });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).rejects.toThrow(/Cannot apply filter on property "TestSchema.Sibling.PropSibling"/);
  });

  it("throws when the filter's property is declared below the class being queried from", async () => {
    // `PropA1` is declared on `A1`, so it applies to only part of what a `Derived` query returns.
    const filterField = makePropertyField({ propertyName: "PropA1", propertyClassName: a1.fullName });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).rejects.toThrow(/it is not accessible from "TestSchema.Derived"/);
  });

  it("throws when a filter fits one queried class but not another", async () => {
    // `A1`/`A2` collapsed onto `Derived` while `Sibling` got its own query; a `Derived`-declared
    // filter covers the former but not the latter, so it does not apply to every resolved class.
    const filterField = makePropertyField({ propertyName: "PropDer", propertyClassName: derived.fullName });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName, sibling.fullName],
        filters,
      }),
    ).rejects.toThrow(/it is not accessible from "TestSchema.Sibling"/);
  });

  it("validates a related filter field using its path's first-step source class, not its primaryClassNames", async () => {
    // The filter field's own resolved `primaryClassNames` is narrower (just `A1`), but its
    // relationship path is declared from the base `Derived` class — that declared anchor, not the
    // data-resolved `primaryClassNames`, is what governs applicability.
    const filterField = makePropertyField({
      propertyName: "PropRelated",
      propertyClassName: "TestSchema.Target",
      pathFromTarget: [
        { sourceClassName: derived.fullName, targetClassName: "TestSchema.Target", relationshipName: "TestSchema.Rel" },
      ],
      primaryClassNames: [a1.fullName],
    });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).resolves.toBeUndefined();
  });

  it("validates a calculated filter field against its whole primaryClassNames list", async () => {
    const filterField = makeCalculatedField({ primaryClassNames: [derived.fullName, sibling.fullName] });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when a calculated filter field's primaryClassNames cannot cover the queried class", async () => {
    const filterField = makeCalculatedField({ primaryClassNames: [a1.fullName] });
    const filters: ContentValueFilter[] = [{ field: filterField, operator: "is-not-null" }];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).rejects.toThrow(/Cannot apply filter on calculated field "calc"/);
  });

  it("validates every filter, not just the first", async () => {
    const validFilterField = makePropertyField({ propertyName: "PropDer", propertyClassName: derived.fullName });
    const invalidFilterField = makePropertyField({ propertyName: "PropSibling", propertyClassName: sibling.fullName });
    const filters: ContentValueFilter[] = [
      { field: validFilterField, operator: "is-not-null" },
      { field: invalidFilterField, operator: "is-not-null" },
    ];

    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters,
      }),
    ).rejects.toThrow(/Cannot apply filter on property "TestSchema.Sibling.PropSibling"/);
  });

  it("passes with no filters", async () => {
    await expect(
      validateFilterApplicability({
        schemaProvider: hierarchySchemaProvider,
        anchorClassNames: [derived.fullName],
        filters: [],
      }),
    ).resolves.toBeUndefined();
  });
});
