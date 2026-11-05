/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { keepCommonFields } from "../../../content/transform/steps/KeepCommonFields.js";
import {
  aspectProp1,
  aspectProp2,
  createCalculatedField,
  createDescriptor,
  createExternalField,
  createItem,
  createPropertyField,
  createStepArgs,
  createRelatedEntry,
} from "../Helpers.js";

import type { InstanceKey } from "@itwin/presentation-shared";
import type { FieldEntry } from "../../../content/transform/TransformContent.js";

describe("keepCommonFields", () => {
  const pumpKey: InstanceKey = { className: "Plant.Pump", id: "0x1" };
  const valveKey: InstanceKey = { className: "Plant.Valve", id: "0x2" };

  it("keeps fields available to all items' primary classes", () => {
    const common = createPropertyField("common", { primaryClassNames: ["Plant.Pump", "Plant.Valve"] });
    const pumpOnly = createPropertyField("pumpOnly", { primaryClassNames: ["Plant.Pump"] });
    const commonCalculated = createCalculatedField("commonCalculated", {
      primaryClassNames: ["Plant.Pump", "Plant.Valve"],
    });
    const valveOnlyCalculated = createCalculatedField("valveOnlyCalculated", { primaryClassNames: ["Plant.Valve"] });
    const external = createExternalField("external");
    const descriptor = createDescriptor([common, pumpOnly, commonCalculated, valveOnlyCalculated, external]);
    const items = [
      createItem({ descriptor, primaryKey: pumpKey }),
      createItem({ descriptor, primaryKey: { ...pumpKey, id: "0x3" } }),
      createItem({ descriptor, primaryKey: valveKey }),
    ];
    const entries = [common, pumpOnly, commonCalculated, valveOnlyCalculated, external].map((field): FieldEntry => ({
      kind: "field",
      field,
      values: [undefined, undefined, undefined],
    }));

    const result = keepCommonFields()(...createStepArgs({ descriptor, items, entries }));

    expect(result.entries).to.deep.equal([entries[0], entries[2], entries[4]]);
  });

  it("keeps all fields when there are no items", () => {
    const entries: FieldEntry[] = [
      { kind: "field", field: createPropertyField("a", { primaryClassNames: ["Plant.Pump"] }), values: [] },
    ];

    const result = keepCommonFields()(...createStepArgs({ entries }));

    expect(result.entries).to.deep.equal(entries);
  });

  it("filters fields of related instances entries", () => {
    const descriptor = createDescriptor([]);
    const items = [createItem({ descriptor, primaryKey: pumpKey })];
    const keptEntry = createRelatedEntry({
      fields: [
        { ...aspectProp1, primaryClassNames: ["Plant.Pump"] },
        { ...aspectProp2, primaryClassNames: ["Plant.Pump"] },
      ],
    });
    const partialEntry = createRelatedEntry({
      fields: [
        { ...aspectProp1, primaryClassNames: ["Plant.Pump"] },
        { ...aspectProp2, primaryClassNames: ["Plant.Valve"] },
      ],
    });
    const droppedEntry = createRelatedEntry({ fields: [{ ...aspectProp1, primaryClassNames: ["Plant.Valve"] }] });

    const result = keepCommonFields()(
      ...createStepArgs({ descriptor, items, entries: [keptEntry, partialEntry, droppedEntry] }),
    );

    expect(result.entries).to.have.lengthOf(2);
    expect(result.entries[0]).to.equal(keptEntry);
    expect(result.entries[1]).to.deep.equal({ ...partialEntry, fields: [partialEntry.fields[0]] });
  });
});
