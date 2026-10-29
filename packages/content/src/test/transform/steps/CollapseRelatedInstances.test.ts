/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collapseRelatedInstances } from "../../../content/transform/steps/CollapseRelatedInstances.js";
import {
  aspectA,
  aspectB,
  aspectsPath,
  childrenPath,
  createCalculatedField,
  createDescriptor,
  createItem,
  createPropertyField,
  createRecords,
} from "../Helpers.js";

import type { InstanceKey } from "@itwin/presentation-shared";
import type { FieldEntry } from "../../../content/transform/ContentTransformer.js";

describe("collapseRelatedInstances", () => {
  const direct = createPropertyField("direct");
  const singleRelated = createPropertyField("singleRelated", { pathFromTarget: childrenPath, pathCardinality: "one" });
  const calculated = createCalculatedField("calculated");

  it("leaves non-many fields untouched", () => {
    const descriptor = createDescriptor([direct, singleRelated, calculated]);
    const items = [createItem({ descriptor })];
    const entries = [direct, singleRelated, calculated].map((field): FieldEntry => ({
      kind: "field",
      field,
      values: ["x"],
    }));

    const result = collapseRelatedInstances()(createRecords({ descriptor, items, entries }));

    expect(result.entries).to.deep.equal(entries);
  });

  it("unwraps values when every item reaches at most one related instance", () => {
    const descriptor = createDescriptor([aspectA]);
    const items = [
      createItem({
        descriptor,
        relatedInstances: [
          { path: aspectsPath, instances: [{ key: { className: "BisCore.ElementMultiAspect", id: "0x10" } }] },
        ],
      }),
      createItem({ descriptor, relatedInstances: [{ path: aspectsPath, instances: [] }] }),
      createItem({ descriptor }),
    ];
    const entry: FieldEntry = { kind: "field", field: aspectA, categoryId: "aspects", values: [["a1"], [], undefined] };

    const result = collapseRelatedInstances()(createRecords({ descriptor, items, entries: [entry] }));

    expect(result.entries).to.deep.equal([{ ...entry, values: ["a1", undefined, undefined] }]);
  });

  it("groups fields of the same path and category by related instance", () => {
    const aspectOtherCategory = createPropertyField("aspectOtherCategory", {
      pathFromTarget: aspectsPath,
      pathCardinality: "many",
    });
    const descriptor = createDescriptor([direct, aspectA, aspectOtherCategory, aspectB]);
    const aspect1: InstanceKey = { className: "BisCore.ElementMultiAspect", id: "0x10" };
    const aspect2: InstanceKey = { className: "BisCore.ElementMultiAspect", id: "0x11" };
    const relationship: InstanceKey = { className: "BisCore.ElementOwnsMultiAspects", id: "0x20" };
    const items = [
      createItem({
        descriptor,
        relatedInstances: [
          { path: aspectsPath, instances: [{ key: aspect1, relationshipKey: relationship }, { key: aspect2 }] },
        ],
      }),
      createItem({ descriptor }),
    ];
    const entries: FieldEntry[] = [
      { kind: "field", field: direct, values: ["d1", "d2"] },
      { kind: "field", field: aspectA, categoryId: "aspects", values: [["a1", "a2"], undefined] },
      { kind: "field", field: aspectOtherCategory, values: [["o1", undefined], undefined] },
      { kind: "field", field: aspectB, categoryId: "aspects", values: [["b1"], undefined] },
    ];

    const result = collapseRelatedInstances()(createRecords({ descriptor, items, entries }));

    expect(result.entries).to.deep.equal([
      entries[0],
      {
        kind: "related-instances",
        pathFromTarget: aspectsPath,
        fields: [aspectA, aspectB],
        categoryId: "aspects",
        values: [
          [
            { key: aspect1, relationshipKey: relationship, values: { aspectA: "a1", aspectB: "b1" } },
            { key: aspect2, values: { aspectA: "a2", aspectB: undefined } },
          ],
          [],
        ],
      },
      {
        kind: "related-instances",
        pathFromTarget: aspectsPath,
        fields: [aspectOtherCategory],
        values: [
          [
            { key: aspect1, relationshipKey: relationship, values: { aspectOtherCategory: "o1" } },
            { key: aspect2, values: { aspectOtherCategory: undefined } },
          ],
          [],
        ],
      },
    ]);
  });

  it("looks up related instances over all paths returned by `getFieldPaths`", () => {
    const valvePath = [{ ...aspectsPath[0], sourceClassName: "Plant.Valve" as const }];
    const descriptor = createDescriptor([aspectA]);
    const aspect1: InstanceKey = { className: "BisCore.ElementMultiAspect", id: "0x10" };
    const aspect2: InstanceKey = { className: "BisCore.ElementMultiAspect", id: "0x11" };
    const aspect3: InstanceKey = { className: "BisCore.ElementMultiAspect", id: "0x12" };
    const items = [
      createItem({ descriptor, relatedInstances: [{ path: aspectsPath, instances: [{ key: aspect1 }] }] }),
      createItem({
        descriptor,
        relatedInstances: [
          { path: aspectsPath, instances: [] },
          { path: valvePath, instances: [{ key: aspect2 }, { key: aspect3 }] },
        ],
      }),
    ];
    const entry: FieldEntry = { kind: "field", field: aspectA, categoryId: "aspects", values: [["a1"], ["a2", "a3"]] };

    const result = collapseRelatedInstances({ getFieldPaths: () => [aspectsPath, valvePath] })(
      createRecords({ descriptor, items, entries: [entry] }),
    );

    expect(result.entries).to.deep.equal([
      {
        kind: "related-instances",
        pathFromTarget: aspectsPath,
        fields: [aspectA],
        categoryId: "aspects",
        values: [
          [{ key: aspect1, values: { aspectA: "a1" } }],
          [
            { key: aspect2, values: { aspectA: "a2" } },
            { key: aspect3, values: { aspectA: "a3" } },
          ],
        ],
      },
    ]);
  });
});
