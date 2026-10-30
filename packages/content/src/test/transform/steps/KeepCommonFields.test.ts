/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { keepCommonFields } from "../../../content/transform/steps/KeepCommonFields.js";
import {
  aspectA,
  aspectB,
  createCalculatedField,
  createDescriptor,
  createExternalField,
  createItem,
  createPropertyField,
  createRecords,
  createRelatedEntry,
} from "../Helpers.js";

import type { EC, InstanceKey } from "@itwin/presentation-shared";
import type { PropertyField, ReadonlyField, ReadonlyPropertyField } from "../../../content/model/Field.js";
import type { FieldEntry } from "../../../content/transform/ContentTransformer.js";

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

    const result = keepCommonFields()(createRecords({ descriptor, items, entries }));

    expect(result.entries).to.deep.equal([entries[0], entries[2], entries[4]]);
  });

  it("keeps all fields when there are no items", () => {
    const entries: FieldEntry[] = [
      { kind: "field", field: createPropertyField("a", { primaryClassNames: ["Plant.Pump"] }), values: [] },
    ];

    const result = keepCommonFields()(createRecords({ entries }));

    expect(result.entries).to.deep.equal(entries);
  });

  it("filters fields of related instances entries", () => {
    const descriptor = createDescriptor([]);
    const items = [createItem({ descriptor, primaryKey: pumpKey })];
    const keptEntry = createRelatedEntry({
      fields: [
        { ...aspectA, primaryClassNames: ["Plant.Pump"] },
        { ...aspectB, primaryClassNames: ["Plant.Pump"] },
      ],
    });
    const partialEntry = createRelatedEntry({
      fields: [
        { ...aspectA, primaryClassNames: ["Plant.Pump"] },
        { ...aspectB, primaryClassNames: ["Plant.Valve"] },
      ],
    });
    const droppedEntry = createRelatedEntry({ fields: [{ ...aspectA, primaryClassNames: ["Plant.Valve"] }] });

    const result = keepCommonFields()(
      createRecords({ descriptor, items, entries: [keptEntry, partialEntry, droppedEntry] }),
    );

    expect(result.entries).to.have.lengthOf(2);
    expect(result.entries[0]).to.equal(keptEntry);
    expect(result.entries[1]).to.deep.equal({
      ...partialEntry,
      fields: [partialEntry.fields[0]],
      values: [
        [
          { key: { className: "BisCore.ElementMultiAspect", id: "0x10" }, values: { aspectA: "a1" } },
          { key: { className: "BisCore.ElementMultiAspect", id: "0x11" }, values: { aspectA: "a2" } },
        ],
      ],
    });
  });

  describe("combining related fields", () => {
    const descriptor = createDescriptor([]);
    const items = [createItem({ descriptor, primaryKey: pumpKey }), createItem({ descriptor, primaryKey: valveKey })];

    function createRelatedFieldEntry(props: {
      id: string;
      source: EC.FullClassNameDotNotation;
      values: FieldEntry["values"];
      overrides?: Partial<PropertyField>;
    }): FieldEntry {
      return {
        kind: "field",
        field: {
          ...aspectA,
          id: props.id,
          pathFromTarget: [{ ...aspectA.pathFromTarget[0], sourceClassName: props.source }],
          valueClassNames: [`${props.source}Aspect`],
          primaryClassNames: [props.source],
          ...props.overrides,
        },
        categoryId: `${props.source}-category`,
        values: props.values,
      };
    }

    it("combines fields that differ only by the first step's source class", () => {
      const direct: FieldEntry = {
        kind: "field",
        field: createPropertyField("direct", { primaryClassNames: ["Plant.Pump", "Plant.Valve"] }),
        values: ["a", "b"],
      };
      const pumpAspect = createRelatedFieldEntry({ id: "pump", source: "Plant.Pump", values: [["x"], undefined] });
      const valveAspect = createRelatedFieldEntry({ id: "valve", source: "Plant.Valve", values: [undefined, ["y"]] });
      const combinedFields = new WeakMap<ReadonlyField, ReadonlyPropertyField[]>();

      const result = keepCommonFields({ combinedFields })(
        createRecords({ descriptor, items, entries: [pumpAspect, direct, valveAspect] }),
      );

      expect(result.entries).to.deep.equal([
        {
          ...pumpAspect,
          field: {
            ...pumpAspect.field,
            primaryClassNames: ["Plant.Pump", "Plant.Valve"],
            valueClassNames: ["Plant.PumpAspect", "Plant.ValveAspect"],
          },
          values: [["x"], ["y"]],
        },
        direct,
      ]);
      expect(combinedFields.get((result.entries[0] as FieldEntry).field)).to.deep.equal([
        pumpAspect.field,
        valveAspect.field,
      ]);
    });

    it("doesn't combine fields of different properties or relationships", () => {
      const primaryClassNames: PropertyField["primaryClassNames"] = ["Plant.Pump", "Plant.Valve"];
      const pumpAspect = createRelatedFieldEntry({
        id: "pump",
        source: "Plant.Pump",
        values: ["x", undefined],
        overrides: { primaryClassNames },
      });
      const otherProperty = createRelatedFieldEntry({
        id: "otherProperty",
        source: "Plant.Valve",
        values: [undefined, "y"],
        overrides: { primaryClassNames, propertyName: "Other" },
      });
      const otherRelationship = createRelatedFieldEntry({
        id: "otherRelationship",
        source: "Plant.Valve",
        values: [undefined, "z"],
        overrides: {
          primaryClassNames,
          pathFromTarget: [
            { ...aspectA.pathFromTarget[0], sourceClassName: "Plant.Valve", relationshipName: "Plant.Other" },
          ],
        },
      });
      const entries = [pumpAspect, otherProperty, otherRelationship];

      const result = keepCommonFields()(createRecords({ descriptor, items, entries }));

      expect(result.entries).to.have.lengthOf(entries.length);
      result.entries.forEach((entry, index) => expect(entry).to.equal(entries[index]));
    });

    it("keeps single-valued cardinality when combining single-valued fields", () => {
      const pumpAspect = createRelatedFieldEntry({
        id: "pump",
        source: "Plant.Pump",
        values: ["x", undefined],
        overrides: { pathCardinality: "one" },
      });
      const valveAspect = createRelatedFieldEntry({
        id: "valve",
        source: "Plant.Valve",
        values: [undefined, "y"],
        overrides: { pathCardinality: "one" },
      });

      const result = keepCommonFields()(createRecords({ descriptor, items, entries: [pumpAspect, valveAspect] }));

      expect(result.entries).to.have.lengthOf(1);
      expect(result.entries[0]).to.deep.include({ values: ["x", "y"] });
      expect((result.entries[0] as FieldEntry).field).to.deep.include({ pathCardinality: "one" });
    });

    it("wraps single values into arrays when combining fields of different cardinalities", () => {
      const pipeItems = [...items, createItem({ descriptor, primaryKey: { className: "Plant.Pipe", id: "0x3" } })];
      const pumpAspect = createRelatedFieldEntry({
        id: "pump",
        source: "Plant.Pump",
        values: [undefined, undefined, undefined],
        overrides: { pathCardinality: "one" },
      });
      const valveAspect = createRelatedFieldEntry({
        id: "valve",
        source: "Plant.Valve",
        values: [undefined, ["y"], undefined],
      });
      const pipeAspect = createRelatedFieldEntry({
        id: "pipe",
        source: "Plant.Pipe",
        values: [undefined, undefined, "z"],
        overrides: { pathCardinality: "one" },
      });

      const result = keepCommonFields()(
        createRecords({ descriptor, items: pipeItems, entries: [pumpAspect, valveAspect, pipeAspect] }),
      );

      expect(result.entries).to.have.lengthOf(1);
      expect(result.entries[0]).to.deep.include({ values: [[], ["y"], ["z"]] });
      expect((result.entries[0] as FieldEntry).field).to.deep.include({ pathCardinality: "many" });
    });

    it("drops combined fields that don't apply to all items", () => {
      const tankItems = [items[0], createItem({ descriptor, primaryKey: { className: "Plant.Tank", id: "0x4" } })];
      const pumpAspect = createRelatedFieldEntry({ id: "pump", source: "Plant.Pump", values: [["x"], undefined] });
      const valveAspect = createRelatedFieldEntry({
        id: "valve",
        source: "Plant.Valve",
        values: [undefined, undefined],
      });

      const result = keepCommonFields()(
        createRecords({ descriptor, items: tankItems, entries: [pumpAspect, valveAspect] }),
      );

      expect(result.entries).to.deep.equal([]);
    });

    it("doesn't combine forks of the same field", () => {
      const pumpItems = [items[0]];
      const original = createRelatedFieldEntry({ id: "original", source: "Plant.Pump", values: [undefined] });
      const fork = createRelatedFieldEntry({
        id: "fork",
        source: "Plant.Pump",
        values: [["x"]],
        overrides: { label: "Fork" },
      });
      const entries = [original, fork];

      const result = keepCommonFields()(createRecords({ descriptor, items: pumpItems, entries }));

      expect(result.entries).to.have.lengthOf(entries.length);
      result.entries.forEach((entry, index) => expect(entry).to.equal(entries[index]));
    });

    it("combines forks with forks of other fields that have the same value classes", () => {
      const pumpOriginal = createRelatedFieldEntry({
        id: "pumpOriginal",
        source: "Plant.Pump",
        values: [["a"], undefined],
        overrides: { valueClassNames: ["Plant.AspectA"] },
      });
      const pumpFork = createRelatedFieldEntry({
        id: "pumpFork",
        source: "Plant.Pump",
        values: [["b"], undefined],
        overrides: { valueClassNames: ["Plant.AspectB"] },
      });
      const valveFork = createRelatedFieldEntry({
        id: "valveFork",
        source: "Plant.Valve",
        values: [undefined, ["c"]],
        overrides: { valueClassNames: ["Plant.AspectB"] },
      });
      const valveOriginal = createRelatedFieldEntry({
        id: "valveOriginal",
        source: "Plant.Valve",
        values: [undefined, ["d"]],
        overrides: { valueClassNames: ["Plant.AspectA"] },
      });
      const combinedFields = new WeakMap<ReadonlyField, ReadonlyPropertyField[]>();

      const result = keepCommonFields({ combinedFields })(
        createRecords({ descriptor, items, entries: [pumpOriginal, pumpFork, valveFork, valveOriginal] }),
      );

      expect(result.entries).to.have.lengthOf(2);
      expect(result.entries[0]).to.deep.include({ values: [["a"], ["d"]] });
      expect(result.entries[1]).to.deep.include({ values: [["b"], ["c"]] });
      expect(combinedFields.get((result.entries[0] as FieldEntry).field)).to.deep.equal([
        pumpOriginal.field,
        valveOriginal.field,
      ]);
      expect(combinedFields.get((result.entries[1] as FieldEntry).field)).to.deep.equal([
        pumpFork.field,
        valveFork.field,
      ]);
    });

    it("combines fields with the same value classes even when non-matching fields come first", () => {
      const pump = createRelatedFieldEntry({
        id: "pump",
        source: "Plant.Pump",
        values: [["a"], undefined],
        overrides: { valueClassNames: ["Plant.AspectB"] },
      });
      const valveOriginal = createRelatedFieldEntry({
        id: "valveOriginal",
        source: "Plant.Valve",
        values: [undefined, ["b"]],
        overrides: { valueClassNames: ["Plant.AspectA"] },
      });
      const valveFork = createRelatedFieldEntry({
        id: "valveFork",
        source: "Plant.Valve",
        values: [undefined, ["c"]],
        overrides: { valueClassNames: ["Plant.AspectB"] },
      });
      const combinedFields = new WeakMap<ReadonlyField, ReadonlyPropertyField[]>();

      const result = keepCommonFields({ combinedFields })(
        createRecords({ descriptor, items, entries: [pump, valveOriginal, valveFork] }),
      );

      expect(result.entries).to.have.lengthOf(1);
      expect(result.entries[0]).to.deep.include({ values: [["a"], ["c"]] });
      expect(combinedFields.get((result.entries[0] as FieldEntry).field)).to.deep.equal([pump.field, valveFork.field]);
    });

    it("combines fields of all classes when unmatched fields come before matched ones", () => {
      const pipeItems = [...items, createItem({ descriptor, primaryKey: { className: "Plant.Pipe", id: "0x3" } })];
      const pump = createRelatedFieldEntry({
        id: "pump",
        source: "Plant.Pump",
        values: [["a"], undefined, undefined],
        overrides: { valueClassNames: ["Plant.AspectA"] },
      });
      const valveOriginal = createRelatedFieldEntry({
        id: "valveOriginal",
        source: "Plant.Valve",
        values: [undefined, ["c"], undefined],
        overrides: { valueClassNames: ["Plant.AspectC"] },
      });
      const pipe = createRelatedFieldEntry({
        id: "pipe",
        source: "Plant.Pipe",
        values: [undefined, undefined, ["b1"]],
        overrides: { valueClassNames: ["Plant.AspectB"] },
      });
      const valveFork = createRelatedFieldEntry({
        id: "valveFork",
        source: "Plant.Valve",
        values: [undefined, ["b2"], undefined],
        overrides: { valueClassNames: ["Plant.AspectB"] },
      });
      const combinedFields = new WeakMap<ReadonlyField, ReadonlyPropertyField[]>();

      const result = keepCommonFields({ combinedFields })(
        createRecords({ descriptor, items: pipeItems, entries: [pump, valveOriginal, pipe, valveFork] }),
      );

      expect(result.entries).to.have.lengthOf(1);
      expect(result.entries[0]).to.deep.include({ values: [["a"], ["b2"], ["b1"]] });
      expect(combinedFields.get((result.entries[0] as FieldEntry).field)).to.deep.equal([
        pump.field,
        pipe.field,
        valveFork.field,
      ]);
    });
  });
});
