/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { transformContent } from "../../content/transform/TransformContent.js";
import { aspectProp1, aspectsPath, createDescriptor, createItem, createPropertyField } from "./Helpers.js";

describe("transformContent", () => {
  describe("propertyGrid", () => {
    const common = createPropertyField("common", { primaryClassNames: ["Plant.Pump", "Plant.Valve"] });
    const pumpOnly = createPropertyField("pumpOnly", { primaryClassNames: ["Plant.Pump"] });
    const hidden = createPropertyField("hidden", { primaryClassNames: ["Plant.Pump", "Plant.Valve"], hidden: true });
    const related = { ...aspectProp1, primaryClassNames: ["Plant.Pump" as const, "Plant.Valve" as const] };
    const descriptor = createDescriptor([common, pumpOnly, hidden, related]);
    const aspectKey = { className: "BisCore.ElementMultiAspect" as const, id: "0x10" };
    const items = [
      createItem({
        descriptor,
        primaryKey: { className: "Plant.Pump", id: "0x1" },
        values: { common: "a", pumpOnly: "p", hidden: "h", aspectProp1: ["x"] },
        relatedInstances: [{ path: aspectsPath, instances: [{ key: aspectKey }] }],
      }),
      createItem({
        descriptor,
        primaryKey: { className: "Plant.Valve", id: "0x2" },
        values: { common: "b", hidden: "h", aspectProp1: ["x"] },
        relatedInstances: [{ path: aspectsPath, instances: [{ key: { ...aspectKey, id: "0x11" } }] }],
      }),
    ];

    it("keeps common fields, removes hidden fields, collapses related instances and identifies varying values", () => {
      const result = transformContent({ descriptor, items, config: { type: "propertyGrid" } });

      expect(result).to.deep.equal({
        entries: [
          { kind: "field", field: common, values: ["a", "b"], varies: true },
          { kind: "field", field: related, values: ["x", "x"], varies: false },
        ],
      });
    });

    it("keeps all fields when `fields` is `all`", () => {
      const result = transformContent({ descriptor, items, config: { type: "propertyGrid", fields: "all" } });

      expect(result).to.deep.equal({
        entries: [
          { kind: "field", field: common, values: ["a", "b"], varies: true },
          { kind: "field", field: pumpOnly, values: ["p", undefined], varies: false },
          { kind: "field", field: related, values: ["x", "x"], varies: false },
        ],
      });
    });
  });
});
