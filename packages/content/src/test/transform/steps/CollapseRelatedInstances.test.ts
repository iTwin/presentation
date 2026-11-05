/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collapseRelatedInstances } from "../../../content/transform/steps/CollapseRelatedInstances.js";
import {
  aspectProp1,
  aspectProp2,
  aspectsPath,
  childrenPath,
  createCalculatedField,
  createDescriptor,
  createItem,
  createPropertyField,
  createStepArgs,
  getRelatedInstanceValues,
} from "../Helpers.js";

import type { InstanceKey } from "@itwin/presentation-shared";
import type { FieldEntry } from "../../../content/transform/TransformContent.js";

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

    const result = collapseRelatedInstances()(...createStepArgs({ descriptor, items, entries }));

    expect(result.entries).to.deep.equal(entries);
  });

  it("unwraps values when every item reaches at most one related instance", () => {
    const descriptor = createDescriptor([aspectProp1]);
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
    const entry: FieldEntry = { kind: "field", field: aspectProp1, values: [["a1"], [], undefined] };

    const result = collapseRelatedInstances()(...createStepArgs({ descriptor, items, entries: [entry] }));

    expect(result.entries).to.deep.equal([{ ...entry, values: ["a1", undefined, undefined] }]);
  });

  it("groups fields of the same path and category by related instance", () => {
    const aspectPropOtherCategory = createPropertyField("aspectPropOtherCategory", {
      propertyClassName: "BisCore.ElementMultiAspect",
      pathFromTarget: aspectsPath,
      pathCardinality: "many",
    });
    const descriptor = createDescriptor([direct, aspectProp1, aspectPropOtherCategory, aspectProp2]);
    const aspect1: InstanceKey = { className: "BisCore.ElementMultiAspect", id: "0x10" };
    const aspect2: InstanceKey = { className: "BisCore.ElementMultiAspect", id: "0x11" };
    const items = [
      createItem({
        descriptor,
        values: { aspectProp1: ["a1", "a2"], aspectPropOtherCategory: ["o1"], aspectProp2: ["b1"] },
        relatedInstances: [{ path: aspectsPath, instances: [{ key: aspect1 }, { key: aspect2 }] }],
      }),
      createItem({ descriptor }),
    ];
    const entries: FieldEntry[] = [
      { kind: "field", field: direct, values: ["d1", "d2"] },
      { kind: "field", field: aspectProp1, values: [["a1", "a2"], undefined] },
      { kind: "field", field: aspectPropOtherCategory, values: [["o1"], undefined] },
      { kind: "field", field: aspectProp2, values: [["b1"], undefined] },
    ];

    const result = collapseRelatedInstances()(...createStepArgs({ descriptor, items, entries }));

    expect(result.entries).to.have.lengthOf(3);
    expect(result.entries[0]).to.equal(entries[0]);
    expect(result.entries[1]).to.deep.include({ kind: "related-instances", fields: [aspectProp1, aspectProp2] });
    expect(getRelatedInstanceValues(result.entries[1])).to.deep.equal([
      [
        { key: aspect1, values: { aspectProp1: "a1", aspectProp2: "b1" } },
        { key: aspect2, values: { aspectProp1: "a2", aspectProp2: undefined } },
      ],
      [],
    ]);
    expect(result.entries[2]).to.deep.include({ kind: "related-instances", fields: [aspectPropOtherCategory] });
    expect(getRelatedInstanceValues(result.entries[2])).to.deep.equal([
      [
        { key: aspect1, values: { aspectPropOtherCategory: "o1" } },
        { key: aspect2, values: { aspectPropOtherCategory: undefined } },
      ],
      [],
    ]);
  });
});
