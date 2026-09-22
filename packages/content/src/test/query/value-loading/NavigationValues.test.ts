/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { ECSQL_PREFIX } from "../../../content/InternalUtils.js";
import { createNavigationValuePopulator } from "../../../content/query/value-loading/NavigationValues.js";

import type {
  ECSchemaProvider,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  IInstanceLabelSelectClauseFactory,
  Value,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { ContentDefinition } from "../../../content/definition-building/BuildContentDefinition.js";
import type { GroupValues } from "../../../content/query/value-loading/RowDecoder.js";

const navigationType = { kind: "navigation", targetClassName: "Schema.B" } satisfies ValueDescriptor;

/** Selects the target's `Label` property, so a lookup query's rows stay easy to assert against. */
const labelsFactory: IInstanceLabelSelectClauseFactory = {
  createSelectClause: async ({ classAlias }) => `[${classAlias}].[Label]`,
};

function createIModelAccess(handler: (query: ECSqlQueryDef) => ECSqlQueryRow[]) {
  const queries: ECSqlQueryDef[] = [];
  let closedReaders = 0;
  const createQueryReader = vi.fn((query: ECSqlQueryDef) => {
    queries.push(query);
    const rows = handler(query);
    const iterator = (async function* () {
      for (const row of rows) {
        yield row;
      }
    })();
    const originalReturn = iterator.return.bind(iterator);
    iterator.return = async (value?: void) => {
      ++closedReaders;
      return originalReturn(value);
    };
    return iterator;
  });
  const imodelAccess = { createQueryReader } as unknown as ECSqlQueryExecutor & ECSchemaProvider;
  return { imodelAccess, queries, createQueryReader, getClosedReaders: () => closedReaders };
}

function createRow(selectorValues: Record<string, Value[]>): GroupValues["selectorValues"] {
  return new Map(Object.entries(selectorValues));
}

/** `[id, className, label]` — the column order a lookup query selects in, read as `"Indexes"`. */
function targetRow(id: string, className: string, label: string | undefined): ECSqlQueryRow {
  return [id, className, label];
}

/** The ids a lookup query binds to its id set parameter. */
function boundIds(query: ECSqlQueryDef): string[] {
  const bindings = query.bindings;
  const binding = Array.isArray(bindings) ? undefined : bindings?.[`${ECSQL_PREFIX}nav_ids`];
  return binding?.type === "idset" ? (binding.value ?? []) : [];
}

/** Builds the selector definitions a set of selector types implies; these tests only vary the types. */
function selectorsOf(selectorTypes: Record<string, ValueDescriptor>): ContentDefinition["selectors"] {
  return Object.fromEntries(
    Object.entries(selectorTypes).map(([id, type]) => [
      id,
      {
        kind: "property" as const,
        id,
        propertyClassName: "Schema.A" as const,
        propertyName: id,
        pathFromTarget: [],
        type,
        read: (_className: string, value: Value | null) => value ?? undefined,
      },
    ]),
  );
}

async function populate(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  selectorTypes: Record<string, ValueDescriptor>;
  rows: Array<GroupValues["selectorValues"]>;
  labelsFactory?: IInstanceLabelSelectClauseFactory;
}) {
  const populator = createNavigationValuePopulator({
    imodelAccess: props.imodelAccess,
    selectors: selectorsOf(props.selectorTypes),
    labelsFactory: props.labelsFactory ?? labelsFactory,
  });
  expect(populator).toBeDefined();
  await firstValueFrom(populator!(props.rows));
  return props.rows;
}

describe("createNavigationValuePopulator", () => {
  it("returns undefined when no selector carries navigation values", () => {
    const { imodelAccess } = createIModelAccess(() => []);
    const populator = createNavigationValuePopulator({
      imodelAccess,
      selectors: selectorsOf({
        code: { kind: "primitive", type: "String" },
        points: { kind: "array", elementType: { kind: "primitive", type: "Point2d" } },
        address: {
          kind: "struct",
          members: [{ name: "Street", label: "Street", type: { kind: "primitive", type: "String" } }],
        },
      }),
      labelsFactory,
    });
    expect(populator).toBeUndefined();
  });

  it("leaves calculated values unchanged while loading navigation values", async () => {
    const { imodelAccess } = createIModelAccess(() => [targetRow("0x2", "Schema.B", "target")]);
    const populator = createNavigationValuePopulator({
      imodelAccess,
      selectors: {
        ...selectorsOf({ nav: navigationType }),
        score: { kind: "calculated", id: "score", expression: "42" },
      },
      labelsFactory,
    })!;
    const row = createRow({ nav: ["0x2"], score: [42] });

    await firstValueFrom(populator([row]));

    expect(row).to.deep.equal(
      createRow({ nav: [{ key: { className: "Schema.B", id: "0x2" }, label: "target" }], score: [42] }),
    );
  });

  it("keeps absent selectors absent while loading navigation values in other rows", async () => {
    const { imodelAccess, queries } = createIModelAccess(() => [targetRow("0x2", "Schema.B", "target")]);
    const rows = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ code: ["without nav"] }), createRow({ nav: ["0x2"] })],
    });

    expect(rows).to.deep.equal([
      createRow({ code: ["without nav"] }),
      createRow({ nav: [{ key: { className: "Schema.B", id: "0x2" }, label: "target" }] }),
    ]);
    expect(queries).to.have.lengthOf(1);
    expect(boundIds(queries[0])).to.deep.equal(["0x2"]);
  });

  it.each(["array", "struct"] as const)(
    "preserves undefined %s values while loading other navigation values",
    async (kind) => {
      const { imodelAccess } = createIModelAccess(() => [targetRow("0x2", "Schema.B", "target")]);
      const [row] = await populate({
        imodelAccess,
        selectorTypes: {
          nav: navigationType,
          optional:
            kind === "array"
              ? { kind, elementType: navigationType }
              : { kind, members: [{ name: "Nav", label: "Nav", type: navigationType }] },
        },
        rows: [createRow({ nav: ["0x2"], optional: [undefined] })],
      });

      expect(row).to.deep.equal(
        createRow({ nav: [{ key: { className: "Schema.B", id: "0x2" }, label: "target" }], optional: [undefined] }),
      );
    },
  );

  it("replaces a target id with its actual class and label", async () => {
    const { imodelAccess, queries } = createIModelAccess(() => [targetRow("0x2", "Schema.BSub", "Target label")]);
    const [row] = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ nav: ["0x2"] })],
    });

    expect(row.get("nav")).to.deep.equal([{ key: { className: "Schema.BSub", id: "0x2" }, label: "Target label" }]);
    // The declared target class is selected polymorphically, so a subclass instance resolves and
    // reports its own class rather than the declared constraint.
    expect(queries).to.have.lengthOf(1);
    expect(queries[0].ecsql).to.contain("FROM [Schema].[B]");
    expect(queries[0].ecsql).not.to.contain("ONLY");
    expect(queries[0].ecsql).to.contain("ec_classname");
    expect(queries[0].bindings).to.deep.equal({ [`${ECSQL_PREFIX}nav_ids`]: { type: "idset", value: ["0x2"] } });
  });

  it("parses a concatenated JSON label", async () => {
    const parts = [{ type: "String", value: "a" }, "-", { type: "Integer", value: 1 }];
    const { imodelAccess } = createIModelAccess(() => [targetRow("0x2", "Schema.B", JSON.stringify(parts))]);
    const [row] = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ nav: ["0x2"] })],
    });

    expect(row.get("nav")).to.deep.equal([{ key: { className: "Schema.B", id: "0x2" }, label: parts }]);
  });

  it("yields an empty label for a target without one", async () => {
    const { imodelAccess } = createIModelAccess(() => [targetRow("0x2", "Schema.B", undefined)]);
    const [row] = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ nav: ["0x2"] })],
    });

    expect(row.get("nav")).to.deep.equal([{ key: { className: "Schema.B", id: "0x2" }, label: "" }]);
  });

  it("looks a repeated target up once and shares the loaded value", async () => {
    const { imodelAccess, queries } = createIModelAccess(() => [targetRow("0x2", "Schema.B", "shared")]);
    const rows = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ nav: ["0x2"] }), createRow({ nav: ["0x2"] })],
    });

    const expected = { key: { className: "Schema.B", id: "0x2" }, label: "shared" };
    expect(rows.map((row) => row.get("nav"))).to.deep.equal([[expected], [expected]]);
    expect(queries).to.have.lengthOf(1);
    expect(queries[0].bindings).to.deep.equal({ [`${ECSQL_PREFIX}nav_ids`]: { type: "idset", value: ["0x2"] } });
  });

  it("keeps equal ids in unrelated target classes apart", async () => {
    const { imodelAccess, queries } = createIModelAccess((query) =>
      query.ecsql.includes("[Schema].[B]")
        ? [targetRow("0x2", "Schema.B", "in B")]
        : [targetRow("0x2", "Schema.C", "in C")],
    );
    const [row] = await populate({
      imodelAccess,
      selectorTypes: { navB: navigationType, navC: { kind: "navigation", targetClassName: "Schema.C" } },
      rows: [createRow({ navB: ["0x2"], navC: ["0x2"] })],
    });

    expect(row.get("navB")).to.deep.equal([{ key: { className: "Schema.B", id: "0x2" }, label: "in B" }]);
    expect(row.get("navC")).to.deep.equal([{ key: { className: "Schema.C", id: "0x2" }, label: "in C" }]);
    expect(queries).to.have.lengthOf(2);
  });

  it("yields undefined for a target id with no matching instance", async () => {
    const { imodelAccess } = createIModelAccess(() => [targetRow("0x2", "Schema.B", "found")]);
    const [row] = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ nav: ["0x2", "0x3"] })],
    });

    // A dangling reference resolves the same way a NULL navigation value does, and the array keeps its
    // length so values stay aligned with their path's related instances.
    expect(row.get("nav")).to.deep.equal([{ key: { className: "Schema.B", id: "0x2" }, label: "found" }, undefined]);
  });

  it("queries nothing when a page carries only NULL navigation values", async () => {
    const { imodelAccess, createQueryReader } = createIModelAccess(() => []);
    const [row] = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ nav: [undefined, undefined] })],
    });

    expect(row.get("nav")).to.deep.equal([undefined, undefined]);
    expect(createQueryReader).not.toHaveBeenCalled();
  });

  it("loads navigation values nested in structs and arrays", async () => {
    const { imodelAccess } = createIModelAccess(() => [
      targetRow("0x2", "Schema.B", "first"),
      targetRow("0x3", "Schema.B", "second"),
    ]);
    const selectorTypes: Record<string, ValueDescriptor> = {
      payloads: {
        kind: "array",
        elementType: {
          kind: "struct",
          members: [
            { name: "Nav", label: "Nav", type: navigationType },
            { name: "Code", label: "Code", type: { kind: "primitive", type: "String" } },
            {
              name: "Nested",
              label: "Nested",
              type: {
                kind: "struct",
                members: [
                  {
                    name: "NavigationValues",
                    label: "NavigationValues",
                    type: { kind: "array", elementType: navigationType },
                  },
                ],
              },
            },
          ],
        },
      },
    };
    const [row] = await populate({
      imodelAccess,
      selectorTypes,
      rows: [
        createRow({
          payloads: [
            [
              { ["Nav"]: "0x2", ["Code"]: "c1", ["Nested"]: { ["NavigationValues"]: ["0x3", undefined] } },
              { ["Code"]: "c2" },
            ],
          ],
        }),
      ],
    });

    expect(row.get("payloads")).to.deep.equal([
      [
        {
          ["Nav"]: { key: { className: "Schema.B", id: "0x2" }, label: "first" },
          ["Code"]: "c1",
          ["Nested"]: {
            ["NavigationValues"]: [{ key: { className: "Schema.B", id: "0x3" }, label: "second" }, undefined],
          },
        },
        // Members the instance didn't supply stay absent rather than becoming `undefined` entries.
        { ["Code"]: "c2" },
      ],
    ]);
  });

  it("looks a class's ids up in one query", async () => {
    const ids = Array.from({ length: 1002 }, (_, index) => `0x${index + 1}`);
    const { imodelAccess, queries } = createIModelAccess((query) =>
      boundIds(query).map((id) => targetRow(id, "Schema.B", `label ${id}`)),
    );
    const [row] = await populate({
      imodelAccess,
      selectorTypes: { nav: navigationType },
      rows: [createRow({ nav: ids })],
    });

    // `IdSet` takes the whole set, so the id count doesn't split the lookup.
    expect(queries).to.have.lengthOf(1);
    expect(boundIds(queries[0])).to.have.lengthOf(ids.length);
    const values = row.get("nav")!;
    expect(values).to.have.lengthOf(ids.length);
    expect(values[0]).to.deep.equal({ key: { className: "Schema.B", id: "0x1" }, label: "label 0x1" });
    expect(values[values.length - 1]).to.deep.equal({
      key: { className: "Schema.B", id: ids[ids.length - 1] },
      label: `label ${ids[ids.length - 1]}`,
    });
  });

  it("creates each target class's label clause once", async () => {
    const { imodelAccess } = createIModelAccess(() => []);
    const createSelectClause = vi.fn(async ({ classAlias }: { classAlias: string }) => `[${classAlias}].[Label]`);
    const populator = createNavigationValuePopulator({
      imodelAccess,
      selectors: selectorsOf({ nav: navigationType }),
      labelsFactory: { createSelectClause },
    })!;
    await firstValueFrom(populator([createRow({ nav: ["0x2"] })]));
    await firstValueFrom(populator([createRow({ nav: ["0x3"] })]));

    expect(createSelectClause).toHaveBeenCalledExactlyOnceWith({
      classAlias: `${ECSQL_PREFIX}nav_target`,
      className: "Schema.B",
    });
  });

  it("releases the lookup query reader", async () => {
    const { imodelAccess, getClosedReaders } = createIModelAccess(() => [targetRow("0x2", "Schema.B", "l")]);
    await populate({ imodelAccess, selectorTypes: { nav: navigationType }, rows: [createRow({ nav: ["0x2"] })] });
    expect(getClosedReaders()).to.equal(1);
  });

  it("propagates a lookup query failure rather than leaving bare target ids", async () => {
    const { imodelAccess } = createIModelAccess(() => {
      throw new Error("query failed");
    });
    const populator = createNavigationValuePopulator({
      imodelAccess,
      selectors: selectorsOf({ nav: navigationType }),
      labelsFactory,
    })!;
    await expect(firstValueFrom(populator([createRow({ nav: ["0x2"] })]))).rejects.toThrow("query failed");
  });

  it("propagates a label factory failure", async () => {
    const { imodelAccess } = createIModelAccess(() => []);
    const populator = createNavigationValuePopulator({
      imodelAccess,
      selectors: selectorsOf({ nav: navigationType }),
      labelsFactory: {
        createSelectClause: async () => {
          throw new Error("no label clause");
        },
      },
    })!;
    await expect(firstValueFrom(populator([createRow({ nav: ["0x2"] })]))).rejects.toThrow("no label clause");
  });

  it("rejects a decoded value whose shape contradicts its declared type", async () => {
    const { imodelAccess } = createIModelAccess(() => []);
    const populator = createNavigationValuePopulator({
      imodelAccess,
      selectors: selectorsOf({ nav: navigationType }),
      labelsFactory,
    })!;
    await expect(firstValueFrom(populator([createRow({ nav: [42] })]))).rejects.toThrow(/navigation value/);
  });
});
