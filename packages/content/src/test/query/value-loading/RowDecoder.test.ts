/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { serializeRelationshipPath } from "../../../content/model/Utils.js";
import {
  createPropertyValueDecoder,
  createRowDecoder,
  decodeGroupRows as decodePreparedGroupRows,
  decodePrimaryKey,
  mergeGroupValues,
  toContentValues,
} from "../../../content/query/value-loading/RowDecoder.js";

import type { ECSqlQueryRow, InstanceKey, Value, ValueDescriptor } from "@itwin/presentation-shared";
import type { CardinalityHint } from "../../../content/ContentTarget.js";
import type { ValueSelector } from "../../../content/descriptor-building/ValueSelector.js";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { RelatedInstanceEntry } from "../../../content/model/ContentItem.js";
import type { SelectProjection } from "../../../content/query/SelectBuilder.js";
import type { GroupValues } from "../../../content/query/value-loading/RowDecoder.js";

const stringType = { kind: "primitive", type: "String" } as const;
const columnNames: SelectProjection["columnNames"] = {
  primaryKey: { className: "pres_primary_class", id: "pres_primary_id" },
  propertyBlobs: { "Schema.A.Code": "this", "Schema.A.Label": "this" },
  calculatedValues: { "calc:score": "pres_calc_0" },
  relatedBlobs: {},
};
const defaultDecoderTypes: Record<string, ValueDescriptor> = {
  "Schema.A.Code": stringType,
  "Schema.A.Label": stringType,
  "Schema.B.Name": stringType,
  "Schema.B.Code": stringType,
};

const selectors: Record<ValueSelector["id"], ValueSelector> = {
  "Schema.A.Code": {
    kind: "property",
    id: "Schema.A.Code",
    propertyClassName: "Schema.A",
    propertyName: "Code",
    pathFromTarget: [],
  },
  "Schema.A.Label": {
    kind: "property",
    id: "Schema.A.Label",
    propertyClassName: "Schema.A",
    propertyName: "Label",
    pathFromTarget: [],
  },
  "calc:score": { kind: "calculated", id: "calc:score", expression: "1" },
  "Schema.B.Name": {
    kind: "property",
    id: "Schema.B.Name",
    propertyClassName: "Schema.B",
    propertyName: "Name",
    pathFromTarget: [],
  },
  "Schema.B.Code": {
    kind: "property",
    id: "Schema.B.Code",
    propertyClassName: "Schema.B",
    propertyName: "Code",
    pathFromTarget: [],
  },
};

const descriptor = {
  sources: [],
  categories: {},
  fields: {
    "Schema.A.Code": { kind: "property", id: "Schema.A.Code" },
    "Schema.A.Label": { kind: "property", id: "Schema.A.Label" },
    "calc:score": { kind: "calculated", id: "calc:score" },
    "ext:note": { kind: "external", id: "ext:note", providerId: "ext" },
  },
} as unknown as ContentDescriptor;

function createTestRowDecoder(props: {
  descriptor: ContentDescriptor;
  selectors?: Parameters<typeof createRowDecoder>[0]["selectors"];
  columnNames: SelectProjection["columnNames"];
  decoderTypes?: Record<string, ValueDescriptor>;
}) {
  return createRowDecoder({
    columnNames: props.columnNames,
    selectors: props.selectors ?? selectors,
    propertyDecoders: Object.fromEntries(
      Object.entries(props.decoderTypes ?? defaultDecoderTypes).map(([selectorId, type]) => [
        selectorId,
        createPropertyValueDecoder(type),
      ]),
    ),
  });
}

function decodeRow(props: {
  row: ECSqlQueryRow;
  descriptor: ContentDescriptor;
  selectors?: Parameters<typeof createRowDecoder>[0]["selectors"];
  columnNames: SelectProjection["columnNames"];
  decoderTypes?: Record<string, ValueDescriptor>;
}) {
  return createTestRowDecoder(props)(props.row);
}

function decodeGroupRows(props: {
  rows: ECSqlQueryRow[];
  descriptor: ContentDescriptor;
  selectors?: Parameters<typeof createRowDecoder>[0]["selectors"];
  cardinality: CardinalityHint;
  columnNames: SelectProjection["columnNames"];
  keys?: readonly InstanceKey[];
}) {
  const { descriptor: contentDescriptor, columnNames: projectionColumns, ...rest } = props;
  return decodePreparedGroupRows({
    ...rest,
    columnNames: projectionColumns,
    rowDecoder: createTestRowDecoder({ descriptor: contentDescriptor, columnNames: projectionColumns }),
  });
}

describe("RowDecoder", () => {
  describe("decodePrimaryKey", () => {
    it("reads the class and instance columns", () => {
      expect(
        decodePrimaryKey({ row: { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0x1" }, columnNames }),
      ).to.deep.equal({ className: "Schema.A", id: "0x1" });
    });
  });

  describe("decodeRow — selector values", () => {
    it("rejects projected selectors without prepared property decoders", () => {
      expect(() => decodeRow({ row: {}, descriptor, columnNames, decoderTypes: {} })).toThrow(
        'Missing property decoder for selector "Schema.A.Code".',
      );
    });

    it.each([
      { type: { kind: "navigation", targetClassName: "Schema.B" }, raw: "0x1", message: /navigation property/ },
      { type: { kind: "navigation", targetClassName: "Schema.B" }, raw: {}, message: /navigation property/ },
      {
        type: { kind: "navigation", targetClassName: "Schema.B" },
        raw: { ["Id"]: 123 },
        message: /navigation property/,
      },
      { type: { kind: "primitive", type: "Point2d" }, raw: [1, 2], message: /point property/ },
      { type: { kind: "primitive", type: "Point2d" }, raw: {}, message: /point property/ },
      { type: { kind: "primitive", type: "Point2d" }, raw: { ["X"]: "1", ["Y"]: 2 }, message: /point property/ },
      { type: { kind: "primitive", type: "Point3d" }, raw: { ["X"]: 1, ["Y"]: 2 }, message: /numeric Z coordinate/ },
      { type: { kind: "struct", members: [] }, raw: "value", message: /struct property/ },
      { type: { kind: "struct", members: [] }, raw: [], message: /struct property/ },
      {
        type: { kind: "array", elementType: { kind: "primitive", type: "Point2d" } },
        raw: [{ ["X"]: 1 }],
        message: /point property/,
      },
      { type: { kind: "array", elementType: stringType }, raw: "value", message: /array property/ },
      {
        type: {
          kind: "struct",
          members: [{ name: "Nav", label: "Nav", type: { kind: "navigation", targetClassName: "Schema.B" } }],
        },
        raw: { ["Nav"]: { ["Id"]: false } },
        message: /navigation property/,
      },
    ] satisfies { type: ValueDescriptor; raw: unknown; message: RegExp }[])(
      "rejects malformed typed JSON: $type $raw",
      ({ type, raw, message }) => {
        expect(() =>
          decodeRow({
            row: { ["pres_primary_class"]: "Schema.A", ["this"]: JSON.stringify({ ["Code"]: raw }) },
            descriptor,
            columnNames,
            decoderTypes: { ...defaultDecoderTypes, "Schema.A.Code": type },
          }),
        ).toThrow(message);
      },
    );

    it.each([
      { type: { kind: "primitive", type: "Point2d" }, raw: { ["X"]: 1, ["Y"]: 2 }, expected: { x: 1, y: 2 } },
      {
        type: { kind: "primitive", type: "Point3d" },
        raw: { ["X"]: 1, ["Y"]: 2, ["Z"]: 3 },
        expected: { x: 1, y: 2, z: 3 },
      },
      {
        type: { kind: "navigation", targetClassName: "Schema.B" },
        raw: { ["Id"]: "0x2", ["RelECClassId"]: "0x3" },
        expected: "0x2",
      },
      {
        type: { kind: "array", elementType: { kind: "primitive", type: "Point2d" } },
        raw: [{ ["X"]: 1, ["Y"]: 2 }, null, { ["X"]: 3, ["Y"]: 4 }],
        expected: [{ x: 1, y: 2 }, undefined, { x: 3, y: 4 }],
      },
      {
        type: {
          kind: "array",
          elementType: {
            kind: "struct",
            members: [
              {
                name: "Nested",
                label: "Nested",
                type: {
                  kind: "struct",
                  members: [
                    { name: "Point", label: "Point", type: { kind: "primitive", type: "Point3d" } },
                    { name: "Nav", label: "Nav", type: { kind: "navigation", targetClassName: "Schema.B" } },
                    { name: "Missing", label: "Missing", type: { kind: "primitive", type: "String" } },
                  ],
                },
              },
            ],
          },
        },
        raw: [
          {
            ["Nested"]: {
              ["Point"]: { ["X"]: 1, ["Y"]: 2, ["Z"]: 3 },
              ["Nav"]: { ["Id"]: "0x2", ["RelECClassId"]: "0x3" },
            },
          },
        ],
        expected: [{ ["Nested"]: { ["Point"]: { x: 1, y: 2, z: 3 }, ["Nav"]: "0x2" } }],
      },
      {
        type: {
          kind: "struct",
          members: [
            { name: "X", label: "X", type: { kind: "primitive", type: "Double" } },
            { name: "Y", label: "Y", type: { kind: "primitive", type: "Double" } },
          ],
        },
        raw: { ["X"]: 1, ["Y"]: 2 },
        expected: { ["X"]: 1, ["Y"]: 2 },
      },
    ] satisfies { type: ValueDescriptor; raw: unknown; expected: Value }[])(
      "decodes schema-described values without requiring a field: $type",
      ({ type, raw, expected }) => {
        const { selectorValues } = decodeRow({
          row: { ["pres_primary_class"]: "Schema.A", ["this"]: JSON.stringify({ ["Code"]: raw }) },
          descriptor: { ...descriptor, fields: {} },
          columnNames,
          decoderTypes: { ...defaultDecoderTypes, "Schema.A.Code": type },
        });
        expect(selectorValues.get("Schema.A.Code")).to.deep.equal(expected);
      },
    );

    it("reads shared-blob property selectors and scalar calculated selectors", () => {
      const { selectorValues: values } = decodeRow({
        row: {
          ["pres_primary_class"]: "Schema.A",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "A1", ["Label"]: "Alpha" }),
          ["pres_calc_0"]: 42,
        },
        descriptor,
        columnNames,
      });
      expect(values.get("Schema.A.Code")).to.equal("A1");
      expect(values.get("Schema.A.Label")).to.equal("Alpha");
      expect(values.get("calc:score")).to.equal(42);
    });

    it("parses each shared blob column only once", () => {
      // Both property selectors read the `this` column; a single string is parsed once and both reads succeed.
      const { selectorValues: values } = decodeRow({
        row: {
          ["pres_primary_class"]: "Schema.A",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "A1", ["Label"]: "Alpha" }),
        },
        descriptor,
        columnNames,
      });
      expect([...values.keys()]).to.have.members(["Schema.A.Code", "Schema.A.Label"]);
    });

    it("throws when a blob column is not a string", () => {
      expect(() =>
        decodeRow({
          row: {
            ["pres_primary_class"]: "Schema.A",
            ["pres_primary_id"]: "0x1",
            ["this"]: { ["Code"]: "A1", ["Label"]: "Alpha" },
          },
          descriptor,
          columnNames,
        }),
      ).toThrow(/Expected JSON blob for column "this"/);
    });

    it("omits property selectors whose blob column is absent", () => {
      const { selectorValues: values } = decodeRow({
        row: { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0x1", ["this"]: null },
        descriptor,
        columnNames,
      });
      expect(values.has("Schema.A.Code")).to.equal(false);
      expect(values.has("Schema.A.Label")).to.equal(false);
    });

    it("rejects a projected selector missing from the prepared requirements", () => {
      expect(() =>
        decodeRow({
          row: {},
          descriptor,
          columnNames: {
            primaryKey: columnNames.primaryKey,
            propertyBlobs: { "Schema.A.Unknown": "this" },
            calculatedValues: {},
            relatedBlobs: {},
          },
        }),
      ).toThrow('Missing selector "Schema.A.Unknown".');
    });

    it("omits property values missing from the blob", () => {
      const { selectorValues: values } = decodeRow({
        row: {
          ["pres_primary_class"]: "Schema.A",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "A1" }),
        },
        descriptor,
        columnNames,
      });
      expect(values.has("Schema.A.Label")).to.equal(false);
    });

    it("throws with column context on malformed JSON", () => {
      expect(() =>
        decodeRow({
          row: { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0x1", ["this"]: "{not json" },
          descriptor,
          columnNames,
        }),
      ).toThrow(/column "this"/);
    });

    it.each(["null", "[]", "123", '"text"'])("rejects non-object instance JSON: %s", (raw) => {
      expect(() =>
        decodeRow({ row: { ["pres_primary_class"]: "Schema.A", ["this"]: raw }, descriptor, columnNames }),
      ).toThrow(/column "this"/);
    });
  });

  describe("decodeRow — related instances", () => {
    const targetBlobColumnName = "targetAlias";
    const targetClassColumnName = "targetClassCls";
    const relationshipBlobColumnName = "relAlias";
    const relationshipClassColumnName = "relAliasCls";
    const relatedColumnNames: SelectProjection["columnNames"] = {
      primaryKey: columnNames.primaryKey,
      propertyBlobs: {},
      calculatedValues: {},
      relatedBlobs: {
        [targetBlobColumnName]: { className: targetClassColumnName, pathKey: "A-[Rel]->B", role: "target" },
        [relationshipBlobColumnName]: {
          className: relationshipClassColumnName,
          pathKey: "A-[Rel]->B",
          role: "relationship",
        },
      },
    };

    it("decodes a target-only entry", () => {
      const { relatedInstances: entries } = decodeRow({
        descriptor,
        row: {
          [targetBlobColumnName]: JSON.stringify({ ["ECInstanceId"]: "0x2" }),
          [targetClassColumnName]: "Schema.B",
        },
        columnNames: relatedColumnNames,
      });
      expect(entries.get("A-[Rel]->B")).to.deep.equal({ key: { className: "Schema.B", id: "0x2" } });
    });

    it("merges target and relationship blobs projected for the same path key", () => {
      const { relatedInstances: entries } = decodeRow({
        descriptor,
        row: {
          [targetBlobColumnName]: JSON.stringify({ ["ECInstanceId"]: "0x2" }),
          [targetClassColumnName]: "Schema.B",
          [relationshipBlobColumnName]: JSON.stringify({ ["ECInstanceId"]: "0x3" }),
          [relationshipClassColumnName]: "Schema.Rel",
        },
        columnNames: relatedColumnNames,
      });
      expect(entries.get("A-[Rel]->B")).to.deep.equal({
        key: { className: "Schema.B", id: "0x2" },
        relationshipKey: { className: "Schema.Rel", id: "0x3" },
      });
    });

    it("yields no entry for a null target blob (outer-join miss)", () => {
      const { relatedInstances: entries } = decodeRow({
        descriptor,
        row: { [targetBlobColumnName]: null, [relationshipBlobColumnName]: null },
        columnNames: relatedColumnNames,
      });
      expect(entries.size).to.equal(0);
    });

    it("yields no entry when only the relationship blob is projected", () => {
      const { relatedInstances: entries } = decodeRow({
        descriptor,
        row: {
          [targetBlobColumnName]: null,
          [relationshipBlobColumnName]: JSON.stringify({ ["ECInstanceId"]: "0x3" }),
          [relationshipClassColumnName]: "Schema.Rel",
        },
        columnNames: relatedColumnNames,
      });
      expect(entries.size).to.equal(0);
    });
  });

  describe("mergeGroupValues", () => {
    const entry: RelatedInstanceEntry = { key: { className: "Schema.B", id: "0x2" } };
    const values = (
      selectorEntries: Array<[string, Value]>,
      related: Array<[string, RelatedInstanceEntry[]]> = [],
    ): GroupValues => ({ selectorValues: new Map(selectorEntries), relatedInstances: new Map(related) });

    it("adds new selector values and related-instance entries", () => {
      const target = values([["a", 1]]);
      mergeGroupValues(target, values([["b", 2]], [["A-[Rel]->B", [entry]]]));
      expect(target.selectorValues.get("b")).to.equal(2);
      expect(target.relatedInstances.get("A-[Rel]->B")).to.deep.equal([entry]);
    });

    it("throws when two groups own the same selector", () => {
      expect(() => mergeGroupValues(values([["a", 1]]), values([["a", 2]]))).toThrow(/more than one query group/);
    });

    it("throws when two groups own the same path key", () => {
      expect(() => mergeGroupValues(values([], [["A-[Rel]->B", []]]), values([], [["A-[Rel]->B", [entry]]]))).toThrow(
        /more than one query group/,
      );
    });

    it("keeps two independent 1:many groups' arrays and related-instance entries separate", () => {
      // Two unrelated 1:many paths merged onto the same target: their arrays keep independent
      // lengths and their related-instance entries stay under their own path keys.
      const cEntry: RelatedInstanceEntry = { key: { className: "Schema.C", id: "0x4" } };
      const target = values(
        [["b.Name", ["first", "second"]]],
        [
          [
            "A-[Rel1]->B",
            [{ key: { className: "Schema.B", id: "0x2" } }, { key: { className: "Schema.B", id: "0x3" } }],
          ],
        ],
      );
      mergeGroupValues(target, values([["c.Name", ["only"]]], [["A-[Rel2]->C", [cEntry]]]));
      expect(target.selectorValues.get("b.Name")).to.deep.equal(["first", "second"]);
      expect(target.selectorValues.get("c.Name")).to.deep.equal(["only"]);
      expect(target.relatedInstances.get("A-[Rel1]->B")).to.have.lengthOf(2);
      expect(target.relatedInstances.get("A-[Rel2]->C")).to.deep.equal([cEntry]);
    });
  });

  describe("toContentValues", () => {
    it("uses prepared fieldSelectorIds for field lookup, including shared reads across field forks", () => {
      const forkedDescriptor = {
        sources: [],
        categories: {},
        fields: {
          "Schema.A.Code": { kind: "property", id: "Schema.A.Code" },
          "Schema.A.Code#Door": { kind: "property", id: "Schema.A.Code#Door" },
          "calc:score": { kind: "calculated", id: "calc:score" },
        },
      } as unknown as ContentDescriptor;

      const contentValues = toContentValues({
        descriptor: forkedDescriptor,
        primaryKey: { className: "Schema.A", id: "0x1" },
        values: {
          selectorValues: new Map<string, Value>([
            ["Schema.A.Code", "A1"],
            ["calc:score", 42],
          ]),
          relatedInstances: new Map(),
        },
        fieldSelectorIds: {
          "Schema.A.Code": "Schema.A.Code",
          "Schema.A.Code#Door": "Schema.A.Code",
          "calc:score": "calc:score",
        },
      });

      expect(contentValues.values).to.deep.equal({
        "Schema.A.Code": "A1",
        "Schema.A.Code#Door": "A1",
        "calc:score": 42,
      });
    });

    it("maps selector values onto fields and leaves external fields undefined", () => {
      const contentValues = toContentValues({
        descriptor,
        fieldSelectorIds: {
          "Schema.A.Code": "Schema.A.Code",
          "Schema.A.Label": "Schema.A.Label",
          "calc:score": "calc:score",
        },
        primaryKey: { className: "Schema.A", id: "0x1" },
        values: {
          selectorValues: new Map<string, Value>([
            ["Schema.A.Code", "A1"],
            ["calc:score", 42],
          ]),
          relatedInstances: new Map(),
        },
      });
      expect(contentValues.primaryKey).to.deep.equal({ className: "Schema.A", id: "0x1" });
      expect(contentValues.values).to.deep.equal({ "Schema.A.Code": "A1", "calc:score": 42 });
      expect(contentValues.values["ext:note"]).to.equal(undefined);
      expect(contentValues.relatedInstances).to.deep.equal({});
    });

    it("passes related-instance entries through verbatim, keyed by the filter-aware join-path key", () => {
      const entries: RelatedInstanceEntry[] = [{ key: { className: "Schema.B", id: "0x2" } }];
      const pathKey = serializeRelationshipPath({
        path: [
          {
            sourceClassName: "Schema.A",
            relationshipName: "Schema.Rel",
            targetClassName: "Schema.B",
            instanceFilter: { expression: "this.Kind = 1" },
          },
        ],
        includeInstanceFilters: true,
      });
      const contentValues = toContentValues({
        descriptor,
        fieldSelectorIds: {},
        primaryKey: { className: "Schema.A", id: "0x1" },
        values: { selectorValues: new Map(), relatedInstances: new Map([[pathKey, entries]]) },
      });
      expect(contentValues.relatedInstances).to.deep.equal({ [pathKey]: entries });
    });
  });

  describe("decodeGroupRows", () => {
    const relatedColumnNames: SelectProjection["columnNames"] = {
      primaryKey: columnNames.primaryKey,
      propertyBlobs: { "Schema.B.Name": "t0", "Schema.B.Code": "t0" },
      calculatedValues: {},
      relatedBlobs: { t0: { className: "t0_cls", pathKey: "A-[Rel]->B", role: "target" } },
    };
    const relatedDescriptor = { sources: [], categories: {}, fields: {} } as ContentDescriptor;
    const row = (primaryId: string, related: { id: string; name?: string; code?: string } | null) => ({
      ["pres_primary_class"]: "Schema.A",
      ["pres_primary_id"]: primaryId,
      ["t0"]: related
        ? JSON.stringify({ ["ECInstanceId"]: related.id, ["Name"]: related.name, ["Code"]: related.code })
        : null,
      ["t0_cls"]: related ? "Schema.B" : null,
    });

    it("decodes a `one` group to scalar values and single-entry related-instance arrays", () => {
      const byKey = decodeGroupRows({
        rows: [row("0x1", { id: "0x10", name: "n", code: "c" }), row("0x2", null)],
        descriptor: relatedDescriptor,
        cardinality: "one",
        columnNames: relatedColumnNames,
      });
      expect(byKey.get("Schema.A:0x1")!.selectorValues.get("Schema.B.Name")).to.equal("n");
      expect(byKey.get("Schema.A:0x1")!.relatedInstances.get("A-[Rel]->B")).to.deep.equal([
        { key: { className: "Schema.B", id: "0x10" } },
      ]);
      // An outer-join miss: the primary is present, its related values and identity are absent.
      expect(byKey.get("Schema.A:0x2")!.selectorValues.size).to.equal(0);
      expect(byKey.get("Schema.A:0x2")!.relatedInstances.size).to.equal(0);
    });

    it("decodes a `many` group to index-aligned arrays with `undefined` holes, seeding `[]` for keys without rows", () => {
      const byKey = decodeGroupRows({
        rows: [
          row("0x1", { id: "0x10", name: "first", code: "c1" }),
          row("0x1", { id: "0x11", name: undefined, code: "c2" }),
          row("0x1", { id: "0x12", name: "third" }),
        ],
        descriptor: relatedDescriptor,
        cardinality: "many",
        columnNames: relatedColumnNames,
        keys: [
          { className: "Schema.A", id: "0x1" },
          { className: "Schema.A", id: "0x2" },
        ],
      });
      const first = byKey.get("Schema.A:0x1")!;
      expect(first.selectorValues.get("Schema.B.Name")).to.deep.equal(["first", undefined, "third"]);
      expect(first.selectorValues.get("Schema.B.Code")).to.deep.equal(["c1", "c2", undefined]);
      expect(first.relatedInstances.get("A-[Rel]->B")!.map((entry) => entry.key.id)).to.deep.equal([
        "0x10",
        "0x11",
        "0x12",
      ]);
      const second = byKey.get("Schema.A:0x2")!;
      expect(second.selectorValues.get("Schema.B.Name")).to.deep.equal([]);
      expect(second.selectorValues.get("Schema.B.Code")).to.deep.equal([]);
      expect(second.relatedInstances.get("A-[Rel]->B")).to.deep.equal([]);
    });

    it("ignores rows for keys outside `keys` in both cardinalities", () => {
      const rows = [row("0x9", { id: "0x10", name: "n" }), row("0x1", { id: "0x11", name: "m" })];
      for (const cardinality of ["one", "many"] as const) {
        const byKey = decodeGroupRows({
          rows,
          descriptor: relatedDescriptor,
          cardinality,
          columnNames: relatedColumnNames,
          keys: [{ className: "Schema.A", id: "0x1" }],
        });
        expect([...byKey.keys()]).to.deep.equal(["Schema.A:0x1"]);
      }
    });

    it("ignores a row belonging to another class that happens to share an id with an allowed key", () => {
      // A `bis.Model` and its modeled `bis.Element` share an `ECInstanceId`; a class-only allowed key must not
      // pick up a same-id row from an unrelated class.
      const byKey = decodeGroupRows({
        rows: [row("0x1", { id: "0x10", name: "n" })],
        descriptor: relatedDescriptor,
        cardinality: "many",
        columnNames: relatedColumnNames,
        keys: [{ className: "Schema.Other", id: "0x1" }],
      });
      expect(byKey.get("Schema.A:0x1")).to.equal(undefined);
      expect(byKey.get("Schema.Other:0x1")!.selectorValues.get("Schema.B.Name")).to.deep.equal([]);
    });

    it("accepts every row when `keys` is omitted", () => {
      const byKey = decodeGroupRows({
        rows: [row("0x9", { id: "0x10", name: "n" })],
        descriptor: relatedDescriptor,
        cardinality: "many",
        columnNames: relatedColumnNames,
      });
      expect(byKey.get("Schema.A:0x9")!.selectorValues.get("Schema.B.Name")).to.deep.equal(["n"]);
    });

    it("throws when a `many` row lacks its target identity", () => {
      expect(() =>
        decodeGroupRows({
          rows: [row("0x1", null)],
          descriptor: relatedDescriptor,
          cardinality: "many",
          columnNames: relatedColumnNames,
        }),
      ).toThrow(/missing its target identity/);
    });

    it("throws when a `one` group has more than one row for the same primary id", () => {
      expect(() =>
        decodeGroupRows({
          rows: [row("0x1", { id: "0x10", name: "n" }), row("0x1", { id: "0x11", name: "m" })],
          descriptor: relatedDescriptor,
          cardinality: "one",
          columnNames: relatedColumnNames,
        }),
      ).toThrow(/"Schema.A:0x1".*A-\[Rel\]->B/);
    });
  });
});
