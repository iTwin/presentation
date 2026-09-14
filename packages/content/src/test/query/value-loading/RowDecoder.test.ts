/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  buildRelatedInstanceKeyMap,
  decodeGroupRows,
  decodePrimaryKey,
  decodeRow,
  mergeGroupValues,
  toContentValues,
} from "../../../content/query/value-loading/RowDecoder.js";

import type { Value } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { RelatedInstanceEntry } from "../../../content/model/ContentItem.js";
import type { SelectProjection } from "../../../content/query/SelectBuilder.js";
import type { GroupValues } from "../../../content/query/value-loading/RowDecoder.js";

const columnNames: SelectProjection["columnNames"] = {
  primaryKey: { className: "pres_primary_class", id: "pres_primary_id" },
  propertyBlobs: { "Schema.A.Code": "this", "Schema.A.Label": "this" },
  calculatedValues: { "calc:score": "pres_calc_0" },
  relatedBlobs: {},
};

const descriptor = {
  selectors: {
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
  },
  fields: {
    "Schema.A.Code": { kind: "property", id: "Schema.A.Code", selectorId: "Schema.A.Code" },
    "Schema.A.Label": { kind: "property", id: "Schema.A.Label", selectorId: "Schema.A.Label" },
    "calc:score": { kind: "calculated", id: "calc:score", selectorId: "calc:score" },
    "ext:note": { kind: "external", id: "ext:note", providerId: "ext" },
  },
} as unknown as ContentDescriptor;

describe("RowDecoder", () => {
  describe("decodePrimaryKey", () => {
    it("reads the class and instance columns", () => {
      expect(
        decodePrimaryKey({ row: { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0x1" }, columnNames }),
      ).to.deep.equal({ className: "Schema.A", id: "0x1" });
    });
  });

  describe("decodeRow — selector values", () => {
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

    it("skips a blob selector missing from the descriptor", () => {
      const { selectorValues: values } = decodeRow({
        row: {
          ["pres_primary_class"]: "Schema.A",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "A1" }),
        },
        descriptor,
        columnNames: {
          primaryKey: columnNames.primaryKey,
          propertyBlobs: { "Schema.A.Unknown": "this" },
          calculatedValues: {},
          relatedBlobs: {},
        },
      });
      expect(values.size).to.equal(0);
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
      selectors: Array<[string, Value]>,
      related: Array<[string, RelatedInstanceEntry[]]> = [],
    ): GroupValues => ({ selectorValues: new Map(selectors), relatedInstances: new Map(related) });

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
    it("maps selector values onto fields and leaves external fields undefined", () => {
      const contentValues = toContentValues({
        descriptor,
        primaryKey: { className: "Schema.A", id: "0x1" },
        values: {
          selectorValues: new Map<string, Value>([
            ["Schema.A.Code", "A1"],
            ["calc:score", 42],
          ]),
          relatedInstances: new Map(),
        },
        relatedInstanceKeyMap: buildRelatedInstanceKeyMap(descriptor),
      });
      expect(contentValues.primaryKey).to.deep.equal({ className: "Schema.A", id: "0x1" });
      expect(contentValues.values).to.deep.equal({ "Schema.A.Code": "A1", "calc:score": 42 });
      expect(contentValues.values["ext:note"]).to.equal(undefined);
      expect(contentValues.relatedInstances).to.deep.equal({});
    });

    it("re-keys related instances from the internal join-path key to the public path key", () => {
      const relatedDescriptor = {
        selectors: {
          "Schema.B.Name": {
            kind: "property",
            id: "Schema.B.Name",
            propertyClassName: "Schema.B",
            propertyName: "Name",
            pathFromTarget: [
              {
                sourceClassName: "Schema.A",
                relationshipName: "Schema.Rel",
                targetClassName: "Schema.B",
                instanceFilter: { expression: "this.Kind = 1" },
              },
            ],
          },
        },
        fields: { "Schema.B.Name": { kind: "property", id: "Schema.B.Name", selectorId: "Schema.B.Name" } },
      } as unknown as ContentDescriptor;
      const relatedInstanceKeyMap = buildRelatedInstanceKeyMap(relatedDescriptor);
      const [internalKey, publicKey] = [...relatedInstanceKeyMap][0];
      expect(internalKey).not.to.equal(publicKey);
      expect(publicKey).to.equal("Schema.A-[Schema.Rel]->Schema.B");

      const entries: RelatedInstanceEntry[] = [{ key: { className: "Schema.B", id: "0x2" } }];
      const contentValues = toContentValues({
        descriptor: relatedDescriptor,
        primaryKey: { className: "Schema.A", id: "0x1" },
        values: { selectorValues: new Map(), relatedInstances: new Map([[internalKey, entries]]) },
        relatedInstanceKeyMap,
      });
      expect(contentValues.relatedInstances).to.deep.equal({ [publicKey]: entries });
    });

    it("drops related instances for a path key no selector reads", () => {
      const contentValues = toContentValues({
        descriptor,
        primaryKey: { className: "Schema.A", id: "0x1" },
        values: {
          selectorValues: new Map(),
          relatedInstances: new Map([
            ["Schema.A-[Schema.Rel]->Schema.B", [{ key: { className: "Schema.B", id: "0x2" } }]],
          ]),
        },
        relatedInstanceKeyMap: buildRelatedInstanceKeyMap(descriptor),
      });
      expect(contentValues.relatedInstances).to.deep.equal({});
    });
  });

  describe("buildRelatedInstanceKeyMap", () => {
    it("collapses two selectors sharing one path into a single map entry", () => {
      const relatedDescriptor = {
        selectors: {
          "Schema.B.Name": {
            kind: "property",
            id: "Schema.B.Name",
            propertyClassName: "Schema.B",
            propertyName: "Name",
            pathFromTarget: [
              { sourceClassName: "Schema.A", relationshipName: "Schema.Rel", targetClassName: "Schema.B" },
            ],
          },
          "Schema.B.Code": {
            kind: "property",
            id: "Schema.B.Code",
            propertyClassName: "Schema.B",
            propertyName: "Code",
            pathFromTarget: [
              { sourceClassName: "Schema.A", relationshipName: "Schema.Rel", targetClassName: "Schema.B" },
            ],
          },
        },
        fields: {},
      } as unknown as ContentDescriptor;

      const map = buildRelatedInstanceKeyMap(relatedDescriptor);
      expect(map.size).to.equal(1);
      expect(map.get("Schema.A-[Schema.Rel]->Schema.B")).to.equal("Schema.A-[Schema.Rel]->Schema.B");
    });

    it("ignores direct and calculated selectors", () => {
      expect(buildRelatedInstanceKeyMap(descriptor).size).to.equal(0);
    });

    it("lets the first of two filter-variant paths sharing a public key win, without throwing", () => {
      const step = { sourceClassName: "Schema.A", relationshipName: "Schema.Rel", targetClassName: "Schema.B" };
      const filteredDescriptor = {
        selectors: {
          "Schema.B.Name": {
            kind: "property",
            id: "Schema.B.Name",
            propertyClassName: "Schema.B",
            propertyName: "Name",
            pathFromTarget: [{ ...step, instanceFilter: { expression: "this.Kind = 1" } }],
          },
          "Schema.B.Code": {
            kind: "property",
            id: "Schema.B.Code",
            propertyClassName: "Schema.B",
            propertyName: "Code",
            pathFromTarget: [{ ...step, instanceFilter: { expression: "this.Kind = 2" } }],
          },
        },
        fields: {},
      } as unknown as ContentDescriptor;

      const map = buildRelatedInstanceKeyMap(filteredDescriptor);
      expect(map.size).to.equal(1);
      const [internalKey, publicKey] = [...map][0];
      expect(internalKey).to.contain("this.Kind = 1");
      expect(publicKey).to.equal("Schema.A-[Schema.Rel]->Schema.B");
    });
  });

  describe("decodeGroupRows", () => {
    const relatedColumnNames: SelectProjection["columnNames"] = {
      primaryKey: columnNames.primaryKey,
      propertyBlobs: { "Schema.B.Name": "t0", "Schema.B.Code": "t0" },
      calculatedValues: {},
      relatedBlobs: { t0: { className: "t0_cls", pathKey: "A-[Rel]->B", role: "target" } },
    };
    const relatedDescriptor = {
      selectors: {
        "Schema.B.Name": { kind: "property", id: "Schema.B.Name", propertyName: "Name", pathFromTarget: [] },
        "Schema.B.Code": { kind: "property", id: "Schema.B.Code", propertyName: "Code", pathFromTarget: [] },
      },
    } as unknown as ContentDescriptor;
    const row = (primaryId: string, related: { id: string; name?: string; code?: string } | null) => ({
      ["pres_primary_class"]: "Schema.A",
      ["pres_primary_id"]: primaryId,
      ["t0"]: related
        ? JSON.stringify({ ["ECInstanceId"]: related.id, ["Name"]: related.name, ["Code"]: related.code })
        : null,
      ["t0_cls"]: related ? "Schema.B" : null,
    });

    it("decodes a `one` group to scalar values and single-entry related-instance arrays", () => {
      const byId = decodeGroupRows({
        rows: [row("0x1", { id: "0x10", name: "n", code: "c" }), row("0x2", null)],
        descriptor: relatedDescriptor,
        cardinality: "one",
        columnNames: relatedColumnNames,
      });
      expect(byId.get("0x1")!.selectorValues.get("Schema.B.Name")).to.equal("n");
      expect(byId.get("0x1")!.relatedInstances.get("A-[Rel]->B")).to.deep.equal([
        { key: { className: "Schema.B", id: "0x10" } },
      ]);
      // An outer-join miss: the primary is present, its related values and identity are absent.
      expect(byId.get("0x2")!.selectorValues.size).to.equal(0);
      expect(byId.get("0x2")!.relatedInstances.size).to.equal(0);
    });

    it("decodes a `many` group to index-aligned arrays with `undefined` holes, seeding `[]` for ids without rows", () => {
      const byId = decodeGroupRows({
        rows: [
          row("0x1", { id: "0x10", name: "first", code: "c1" }),
          row("0x1", { id: "0x11", name: undefined, code: "c2" }),
          row("0x1", { id: "0x12", name: "third" }),
        ],
        descriptor: relatedDescriptor,
        cardinality: "many",
        columnNames: relatedColumnNames,
        ids: ["0x1", "0x2"],
      });
      const first = byId.get("0x1")!;
      expect(first.selectorValues.get("Schema.B.Name")).to.deep.equal(["first", undefined, "third"]);
      expect(first.selectorValues.get("Schema.B.Code")).to.deep.equal(["c1", "c2", undefined]);
      expect(first.relatedInstances.get("A-[Rel]->B")!.map((entry) => entry.key.id)).to.deep.equal([
        "0x10",
        "0x11",
        "0x12",
      ]);
      const second = byId.get("0x2")!;
      expect(second.selectorValues.get("Schema.B.Name")).to.deep.equal([]);
      expect(second.selectorValues.get("Schema.B.Code")).to.deep.equal([]);
      expect(second.relatedInstances.get("A-[Rel]->B")).to.deep.equal([]);
    });

    it("ignores rows for ids outside `ids` in both cardinalities", () => {
      const rows = [row("0x9", { id: "0x10", name: "n" }), row("0x1", { id: "0x11", name: "m" })];
      for (const cardinality of ["one", "many"] as const) {
        const byId = decodeGroupRows({
          rows,
          descriptor: relatedDescriptor,
          cardinality,
          columnNames: relatedColumnNames,
          ids: ["0x1"],
        });
        expect([...byId.keys()]).to.deep.equal(["0x1"]);
      }
    });

    it("accepts every row when `ids` is omitted", () => {
      const byId = decodeGroupRows({
        rows: [row("0x9", { id: "0x10", name: "n" })],
        descriptor: relatedDescriptor,
        cardinality: "many",
        columnNames: relatedColumnNames,
      });
      expect(byId.get("0x9")!.selectorValues.get("Schema.B.Name")).to.deep.equal(["n"]);
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
      ).toThrow(/"0x1".*A-\[Rel\]->B/);
    });
  });
});
