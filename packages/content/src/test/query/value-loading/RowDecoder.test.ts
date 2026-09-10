/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  decodePrimaryKey,
  decodeSelectorValues,
  mergeSelectorValues,
  toContentValues,
} from "../../../content/query/value-loading/RowDecoder.js";

import type { Value } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { SelectProjection } from "../../../content/query/SelectBuilder.js";

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

  describe("decodeSelectorValues", () => {
    it("reads shared-blob property selectors and scalar calculated selectors", () => {
      const values = decodeSelectorValues({
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
      const values = decodeSelectorValues({
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
        decodeSelectorValues({
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
      const values = decodeSelectorValues({
        row: { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0x1", ["this"]: null },
        descriptor,
        columnNames,
      });
      expect(values.has("Schema.A.Code")).to.equal(false);
      expect(values.has("Schema.A.Label")).to.equal(false);
    });

    it("skips a blob selector missing from the descriptor", () => {
      const values = decodeSelectorValues({
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
      const values = decodeSelectorValues({
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
        decodeSelectorValues({
          row: { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0x1", ["this"]: "{not json" },
          descriptor,
          columnNames,
        }),
      ).toThrow(/column "this"/);
    });
  });

  describe("mergeSelectorValues", () => {
    it("adds new selector values", () => {
      const target = new Map<string, Value>([["a", 1]]);
      mergeSelectorValues(target, new Map<string, Value>([["b", 2]]));
      expect(target.get("b")).to.equal(2);
    });

    it("throws when two groups own the same selector", () => {
      const target = new Map<string, Value>([["a", 1]]);
      expect(() => mergeSelectorValues(target, new Map<string, Value>([["a", 2]]))).toThrow(
        /more than one query group/,
      );
    });
  });

  describe("toContentValues", () => {
    it("maps selector values onto fields and leaves external fields undefined", () => {
      const contentValues = toContentValues({
        descriptor,
        primaryKey: { className: "Schema.A", id: "0x1" },
        selectorValues: new Map<string, Value>([
          ["Schema.A.Code", "A1"],
          ["calc:score", 42],
        ]),
      });
      expect(contentValues.primaryKey).to.deep.equal({ className: "Schema.A", id: "0x1" });
      expect(contentValues.values).to.deep.equal({ "Schema.A.Code": "A1", "calc:score": 42 });
      expect(contentValues.values["ext:note"]).to.equal(undefined);
    });
  });
});
