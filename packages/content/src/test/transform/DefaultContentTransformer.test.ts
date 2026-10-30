/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createDefaultContentTransformer } from "../../content/transform/DefaultContentTransformer.js";
import { aspectA, aspectsPath, createDescriptor, createItem, createPropertyField } from "./Helpers.js";

describe("createDefaultContentTransformer", () => {
  const common = createPropertyField("common", { primaryClassNames: ["Plant.Pump", "Plant.Valve"] });
  const pumpOnly = createPropertyField("pumpOnly", { primaryClassNames: ["Plant.Pump"] });
  const hidden = createPropertyField("hidden", { primaryClassNames: ["Plant.Pump", "Plant.Valve"], hidden: true });
  const related = { ...aspectA, primaryClassNames: ["Plant.Pump" as const, "Plant.Valve" as const] };
  const descriptor = createDescriptor([common, pumpOnly, hidden, related]);
  const aspectKey = { className: "BisCore.ElementMultiAspect" as const, id: "0x10" };
  const items = [
    createItem({
      descriptor,
      primaryKey: { className: "Plant.Pump", id: "0x1" },
      values: { common: "a", pumpOnly: "p", hidden: "h", aspectA: ["x"] },
      relatedInstances: [{ path: aspectsPath, instances: [{ key: aspectKey }] }],
    }),
    createItem({
      descriptor,
      primaryKey: { className: "Plant.Valve", id: "0x2" },
      values: { common: "b", hidden: "h", aspectA: ["x"] },
      relatedInstances: [{ path: aspectsPath, instances: [{ key: { ...aspectKey, id: "0x11" } }] }],
    }),
  ];

  it("keeps common fields, hides hidden fields, collapses related instances and merges values", () => {
    const result = createDefaultContentTransformer()({ descriptor, items });

    expect(result.entries).to.deep.equal([
      { kind: "field", field: common, values: ["a", "b"], isMerged: true },
      { kind: "field", field: related, categoryId: "aspects", values: ["x", "x"] },
    ]);
  });

  it("keeps all fields when `fields` is `all`", () => {
    const result = createDefaultContentTransformer({ fields: "all" })({ descriptor, items });

    expect(result.entries).to.deep.equal([
      { kind: "field", field: common, values: ["a", "b"], isMerged: true },
      { kind: "field", field: pumpOnly, values: ["p", undefined] },
      { kind: "field", field: related, categoryId: "aspects", values: ["x", "x"] },
    ]);
  });

  it("combines related fields of different content targets", () => {
    const pumpPath = [{ ...aspectsPath[0], sourceClassName: "Plant.Pump" as const }];
    const valvePath = [{ ...aspectsPath[0], sourceClassName: "Plant.Valve" as const }];
    const pumpAspect = {
      ...aspectA,
      id: "pumpAspect",
      pathFromTarget: pumpPath,
      primaryClassNames: ["Plant.Pump" as const],
    };
    const valveAspect = {
      ...aspectA,
      id: "valveAspect",
      pathFromTarget: valvePath,
      primaryClassNames: ["Plant.Valve" as const],
    };
    const relatedDescriptor = createDescriptor([pumpAspect, valveAspect]);
    const pumpAspectKey = { className: "BisCore.ElementMultiAspect" as const, id: "0x10" };
    const valveAspectKeys = [
      { className: "BisCore.ElementMultiAspect" as const, id: "0x11" },
      { className: "BisCore.ElementMultiAspect" as const, id: "0x12" },
    ];
    const relatedItems = [
      createItem({
        descriptor: relatedDescriptor,
        primaryKey: { className: "Plant.Pump", id: "0x1" },
        values: { pumpAspect: ["x"] },
        relatedInstances: [{ path: pumpPath, instances: [{ key: pumpAspectKey }] }],
      }),
      createItem({
        descriptor: relatedDescriptor,
        primaryKey: { className: "Plant.Valve", id: "0x2" },
        values: { valveAspect: ["x", "y"] },
        relatedInstances: [{ path: valvePath, instances: valveAspectKeys.map((key) => ({ key })) }],
      }),
    ];

    const result = createDefaultContentTransformer()({ descriptor: relatedDescriptor, items: relatedItems });

    expect(result.entries).to.deep.equal([
      {
        kind: "related-instances",
        pathFromTarget: pumpPath,
        fields: [{ ...pumpAspect, primaryClassNames: ["Plant.Pump", "Plant.Valve"] }],
        categoryId: "aspects",
        values: [
          [{ key: pumpAspectKey, values: { pumpAspect: "x" } }],
          [
            { key: valveAspectKeys[0], values: { pumpAspect: "x" } },
            { key: valveAspectKeys[1], values: { pumpAspect: "y" } },
          ],
        ],
        isMerged: true,
      },
    ]);

    // Fields aren't combined when all fields are kept.
    const allFieldsResult = createDefaultContentTransformer({ fields: "all" })({
      descriptor: relatedDescriptor,
      items: relatedItems,
    });
    expect(
      allFieldsResult.entries.map((entry) => (entry.kind === "field" ? entry.field.id : entry.fields[0].id)),
    ).to.deep.equal(["pumpAspect", "valveAspect"]);
  });
});
