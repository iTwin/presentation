/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  collapseRelatedInstances,
  createFieldValues,
  identifyVaryingEntries,
  keepCommonFields,
  removeHiddenFields,
} from "../../content/transform/PropertyGrid.js";
import {
  aspectProp1,
  aspectProp2,
  aspectsPath,
  childrenPath,
  createCalculatedField,
  createDescriptor,
  createExternalField,
  createItem,
  createPropertyField,
  createRelatedEntry,
  createRelatedInstance,
  getRelatedInstanceValues,
} from "./Helpers.js";

import type { EC, InstanceKey } from "@itwin/presentation-shared";
import type { ContentItem, RelatedInstanceEntry } from "../../content/model/ContentItem.js";
import type { PropertyField } from "../../content/model/Field.js";
import type { FieldValues, RelatedInstancesValues } from "../../content/transform/PropertyGrid.js";

describe("createFieldValues", () => {
  it("pairs every descriptor field with values of every item", () => {
    const fieldA = createPropertyField("a");
    const fieldB = createPropertyField("b");
    const descriptor = createDescriptor([fieldA, fieldB]);
    const items = [
      createItem({ descriptor, values: { a: "a1", b: 1 } }),
      createItem({ descriptor, primaryKey: { className: "BisCore.Element", id: "0x2" }, values: { a: "a2" } }),
    ];

    expect(createFieldValues({ descriptor, items })).to.deep.equal([
      { kind: "field", field: fieldA, values: ["a1", "a2"] },
      { kind: "field", field: fieldB, values: [1, undefined] },
    ]);
  });
});

describe("removeHiddenFields", () => {
  it("drops hidden fields", () => {
    const fields = [createPropertyField("visible"), createPropertyField("hidden", { hidden: true })].map(
      (field): FieldValues => ({ kind: "field", field, values: [] }),
    );
    expect(removeHiddenFields(fields)).to.deep.equal([fields[0]]);
  });
});

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
    const fields = [common, pumpOnly, commonCalculated, valveOnlyCalculated, external].map((field): FieldValues => ({
      kind: "field",
      field,
      values: [undefined, undefined, undefined],
    }));

    expect(keepCommonFields(fields, items)).to.deep.equal([fields[0], fields[2], fields[4]]);
  });

  it("keeps all fields when there are no items", () => {
    const fields: FieldValues[] = [
      { kind: "field", field: createPropertyField("a", { primaryClassNames: ["Plant.Pump"] }), values: [] },
    ];

    expect(keepCommonFields(fields, [])).to.deep.equal(fields);
  });
});

describe("collapseRelatedInstances", () => {
  const direct = createPropertyField("direct");
  const singleRelated = createPropertyField("singleRelated", { pathFromTarget: childrenPath, pathCardinality: "one" });
  const calculated = createCalculatedField("calculated");

  it("leaves non-many fields untouched", () => {
    const descriptor = createDescriptor([direct, singleRelated, calculated]);
    const items = [createItem({ descriptor })];
    const entries = [direct, singleRelated, calculated].map((field): FieldValues => ({
      kind: "field",
      field,
      values: ["x"],
    }));

    const result = collapseRelatedInstances(entries, items);

    expect(result).to.deep.equal(entries);
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
    const entry: FieldValues = { kind: "field", field: aspectProp1, values: [["a1"], [], undefined] };

    const result = collapseRelatedInstances([entry], items);

    expect(result).to.deep.equal([{ ...entry, values: ["a1", undefined, undefined] }]);
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
    const entries: FieldValues[] = [
      { kind: "field", field: direct, values: ["d1", "d2"] },
      { kind: "field", field: aspectProp1, values: [["a1", "a2"], undefined] },
      { kind: "field", field: aspectPropOtherCategory, values: [["o1"], undefined] },
      { kind: "field", field: aspectProp2, values: [["b1"], undefined] },
    ];

    const result = collapseRelatedInstances(entries, items);

    expect(result).to.have.lengthOf(3);
    expect(result[0]).to.equal(entries[0]);
    expect(result[1]).to.deep.include({ kind: "related-instances", fields: [aspectProp1, aspectProp2] });
    expect(getRelatedInstanceValues(result[1])).to.deep.equal([
      [
        { key: aspect1, values: { aspectProp1: "a1", aspectProp2: "b1" } },
        { key: aspect2, values: { aspectProp1: "a2", aspectProp2: undefined } },
      ],
      [],
    ]);
    expect(result[2]).to.deep.include({ kind: "related-instances", fields: [aspectPropOtherCategory] });
    expect(getRelatedInstanceValues(result[2])).to.deep.equal([
      [
        { key: aspect1, values: { aspectPropOtherCategory: "o1" } },
        { key: aspect2, values: { aspectPropOtherCategory: undefined } },
      ],
      [],
    ]);
  });

  it("groups fields in the target category separately from fields in a defined category", () => {
    const createAspectField = (id: string, category: PropertyField["category"]) =>
      createPropertyField(id, {
        propertyClassName: "BisCore.ElementMultiAspect",
        pathFromTarget: aspectsPath,
        pathCardinality: "many",
        category,
      });
    const target1 = createAspectField("target1", { type: "target" });
    const defined = createAspectField("defined", { type: "category", id: "target" });
    const target2 = createAspectField("target2", { type: "target" });
    const descriptor = createDescriptor([target1, defined, target2]);
    const instances: RelatedInstanceEntry[] = [
      { key: { className: "BisCore.ElementMultiAspect", id: "0x10" } },
      { key: { className: "BisCore.ElementMultiAspect", id: "0x11" } },
    ];
    const items = [createItem({ descriptor, relatedInstances: [{ path: aspectsPath, instances }] })];
    const entries = [target1, defined, target2].map((field): FieldValues => ({
      kind: "field",
      field,
      values: [[field.id, field.id]],
    }));

    const result = collapseRelatedInstances(entries, items);

    expect(result).to.have.lengthOf(2);
    expect(result[0]).to.deep.include({ kind: "related-instances", fields: [target1, target2] });
    expect(result[1]).to.deep.include({ kind: "related-instances", fields: [defined] });
  });
});

describe("identifyVaryingEntries", () => {
  const descriptor = createDescriptor([]);
  const aspectKey = { className: "BisCore.ElementMultiAspect" as const, id: "0x10" };

  function createItems(classNames: Array<EC.FullClassNameDotNotation>): ContentItem[] {
    return classNames.map((className, index) =>
      createItem({ descriptor, primaryKey: { className, id: `0x${index + 1}` } }),
    );
  }

  function identify(items: ContentItem[], entries: Array<FieldValues | RelatedInstancesValues>) {
    return identifyVaryingEntries(entries, items);
  }

  it("doesn't mark entries with equal values as varying", () => {
    const items = createItems(["BisCore.Element", "BisCore.Element"]);
    const equal: FieldValues = { kind: "field", field: createPropertyField("equal"), values: [{ a: [1] }, { a: [1] }] };
    const equalDates: FieldValues = {
      kind: "field",
      field: createPropertyField("equalDates"),
      values: [new Date(1), new Date(1)],
    };
    const relatedEqual = createRelatedEntry({
      values: [
        [createRelatedInstance(aspectKey, { aspectProp1: "a" })],
        [createRelatedInstance({ ...aspectKey, id: "0x20" }, { aspectProp1: "a" })],
      ],
    });
    const entries = [equal, equalDates, relatedEqual];

    const result = identify(items, entries);

    expect(result).to.deep.equal(entries.map((entry) => ({ ...entry, varies: false })));
  });

  it("marks entries with different values as varying", () => {
    const items = createItems(["BisCore.Element", "BisCore.Element", "BisCore.Element"]);
    const different: FieldValues = { kind: "field", field: createPropertyField("different"), values: ["x", "x", "y"] };
    const differentDates: FieldValues = {
      kind: "field",
      field: createPropertyField("differentDates"),
      values: [new Date(1), new Date(2), new Date(1)],
    };
    const relatedDifferent = createRelatedEntry({
      values: [
        [createRelatedInstance(aspectKey, { aspectProp1: "a" })],
        [
          createRelatedInstance({ ...aspectKey, id: "0x20" }, { aspectProp1: "a" }),
          createRelatedInstance({ ...aspectKey, id: "0x21" }, { aspectProp1: "b" }),
        ],
        [],
      ],
    });

    const result = identify(items, [different, differentDates, relatedDifferent]);

    expect(result).to.deep.equal([
      { ...different, varies: true },
      { ...differentDates, varies: true },
      { ...relatedDifferent, varies: true },
    ]);
  });

  it("ignores items the entry doesn't apply to", () => {
    const items = createItems(["Plant.Pump", "Plant.Valve", "Plant.Pump"]);
    const pumpField: FieldValues = {
      kind: "field",
      field: createPropertyField("pump", { primaryClassNames: ["Plant.Pump"] }),
      values: ["x", undefined, "x"],
    };
    const pumpRelated = createRelatedEntry({
      fields: [{ ...aspectProp1, primaryClassNames: ["Plant.Pump"] }],
      values: [
        [createRelatedInstance(aspectKey, { aspectProp1: "a" })],
        [],
        [createRelatedInstance(aspectKey, { aspectProp1: "a" })],
      ],
    });

    const result = identify(items, [pumpField, pumpRelated]);

    expect(result).to.deep.equal([
      { ...pumpField, varies: false },
      { ...pumpRelated, varies: false },
    ]);
  });

  it("ignores order of related instances", () => {
    const items = createItems(["BisCore.Element", "BisCore.Element"]);
    const otherKey = { ...aspectKey, id: "0x11" };
    const related = createRelatedEntry({
      values: [
        [createRelatedInstance(aspectKey, { aspectProp1: "a" }), createRelatedInstance(otherKey, { aspectProp1: "b" })],
        [createRelatedInstance(otherKey, { aspectProp1: "b" }), createRelatedInstance(aspectKey, { aspectProp1: "a" })],
      ],
    });

    const result = identify(items, [related]);

    expect(result).to.deep.equal([{ ...related, varies: false }]);
  });
});
