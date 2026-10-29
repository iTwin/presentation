/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { mergeFields } from "../../../content/transform/steps/MergeFields.js";
import {
  aspectA,
  createDescriptor,
  createItem,
  createPropertyField,
  createRecords,
  createRelatedEntry,
} from "../Helpers.js";

import type { EC } from "@itwin/presentation-shared";
import type { ContentItem } from "../../../content/model/ContentItem.js";
import type { ContentEntry, FieldEntry } from "../../../content/transform/ContentTransformer.js";

const descriptor = createDescriptor([]);
const aspectKey = { className: "BisCore.ElementMultiAspect" as const, id: "0x10" };

function createItems(classNames: Array<EC.FullClassNameDotNotation>): ContentItem[] {
  return classNames.map((className, index) =>
    createItem({ descriptor, primaryKey: { className, id: `0x${index + 1}` } }),
  );
}

function merge(items: ContentItem[], entries: ContentEntry[]) {
  return mergeFields()(createRecords({ descriptor, items, entries })).entries;
}

describe("mergeFields", () => {
  it("leaves entries with equal values untouched", () => {
    const items = createItems(["BisCore.Element", "BisCore.Element"]);
    const equal: FieldEntry = { kind: "field", field: createPropertyField("equal"), values: [{ a: [1] }, { a: [1] }] };
    const equalDates: FieldEntry = {
      kind: "field",
      field: createPropertyField("equalDates"),
      values: [new Date(1), new Date(1)],
    };
    const relatedEqual = createRelatedEntry({
      values: [
        [{ key: aspectKey, values: { aspectA: "a" } }],
        [{ key: { ...aspectKey, id: "0x20" }, values: { aspectA: "a" } }],
      ],
    });
    const entries = [equal, equalDates, relatedEqual];

    const result = merge(items, entries);

    expect(result).to.have.lengthOf(entries.length);
    result.forEach((entry, index) => expect(entry).to.equal(entries[index]));
  });

  it("marks entries with different values as merged", () => {
    const items = createItems(["BisCore.Element", "BisCore.Element", "BisCore.Element"]);
    const different: FieldEntry = { kind: "field", field: createPropertyField("different"), values: ["x", "x", "y"] };
    const differentDates: FieldEntry = {
      kind: "field",
      field: createPropertyField("differentDates"),
      values: [new Date(1), new Date(2), new Date(1)],
    };
    const relatedDifferent = createRelatedEntry({
      values: [
        [{ key: aspectKey, values: { aspectA: "a" } }],
        [
          { key: { ...aspectKey, id: "0x20" }, values: { aspectA: "a" } },
          { key: { ...aspectKey, id: "0x21" }, values: { aspectA: "b" } },
        ],
        [],
      ],
    });

    const result = merge(items, [different, differentDates, relatedDifferent]);

    expect(result).to.deep.equal([
      { ...different, isMerged: true },
      { ...differentDates, isMerged: true },
      { ...relatedDifferent, isMerged: true },
    ]);
  });

  it("ignores items the entry doesn't apply to", () => {
    const items = createItems(["Plant.Pump", "Plant.Valve", "Plant.Pump"]);
    const pumpField: FieldEntry = {
      kind: "field",
      field: createPropertyField("pump", { primaryClassNames: ["Plant.Pump"] }),
      values: ["x", undefined, "x"],
    };
    const pumpRelated = createRelatedEntry({
      fields: [{ ...aspectA, primaryClassNames: ["Plant.Pump"] }],
      values: [[{ key: aspectKey, values: { aspectA: "a" } }], [], [{ key: aspectKey, values: { aspectA: "a" } }]],
    });

    const result = merge(items, [pumpField, pumpRelated]);

    expect(result[0]).to.equal(pumpField);
    expect(result[1]).to.equal(pumpRelated);
  });
});
