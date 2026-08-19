/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { mergePropertyFieldsByIdentity } from "../../content/descriptor-building/PropertyFieldMerge.js";
import { PropertyField } from "../../content/model/Field.js";

import type { EC } from "@itwin/presentation-shared";

function createField(props: {
  propertyClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  valueClassNames: EC.FullClassNameDotNotation[];
  primaryClassNames?: EC.FullClassNameDotNotation[];
  label?: string;
  hidden?: boolean;
  readOnly?: boolean;
  type?: PropertyField["type"];
  pathFromTarget?: PropertyField["pathFromTarget"];
}): PropertyField {
  const id = PropertyField.computeId({
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
  return {
    kind: "property",
    id,
    selectorId: id,
    label: props.label ?? "Label",
    type: props.type ?? { kind: "primitive", type: "String" },
    hidden: props.hidden,
    readOnly: props.readOnly,
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: props.valueClassNames,
    primaryClassNames: props.primaryClassNames ?? props.valueClassNames,
  };
}

/** Re-keys the merge output by field id, for the record-shaped assertions below. */
function toRecord(result: ReturnType<typeof mergePropertyFieldsByIdentity>): Record<string, PropertyField> {
  return Object.fromEntries(result.map(({ field }) => [field.id, field]));
}

describe("mergePropertyFieldsByIdentity", () => {
  /** Wraps bare fields as merge candidates from a single (unspecified) source, keyed by field id. */
  function merge(fields: PropertyField[]) {
    return toRecord(
      mergePropertyFieldsByIdentity(fields.map((field) => ({ field, categorization: { anchor: "none" as const } }))),
    );
  }

  it("returns an empty record for no candidates", () => {
    expect(merge([])).to.deep.equal({});
  });

  it("passes a single candidate through, keyed by base id, with normalized target classes", () => {
    const field = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window", "Stuff.Door"],
    });
    const result = merge([field]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Height" });
    expect(result).to.deep.equal({
      [id]: {
        ...field,
        id,
        selectorId: id,
        valueClassNames: ["Stuff.Door", "Stuff.Window"],
        primaryClassNames: ["Stuff.Door", "Stuff.Window"],
      },
    });
  });

  it("does not mutate the input candidate", () => {
    const field = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
    });
    merge([field]);
    expect(field.id).to.equal(PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Height" }));
    expect(field.valueClassNames).to.deep.equal(["Stuff.Window"]);
  });

  it("unions target classes of direct-property candidates that share identity", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
    });
    const result = merge([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Height" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });

  it("unions primary classes of related-property candidates that share identity", () => {
    const a = createField({
      propertyClassName: "Stuff.B",
      propertyName: "Prop",
      valueClassNames: ["Stuff.B"],
      primaryClassNames: ["Stuff.A1"],
    });
    const b = createField({
      propertyClassName: "Stuff.B",
      propertyName: "Prop",
      valueClassNames: ["Stuff.B"],
      primaryClassNames: ["Stuff.A2"],
    });
    const result = merge([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff.B", propertyName: "Prop" });
    expect(result[id].primaryClassNames).to.deep.equal(["Stuff.A1", "Stuff.A2"]);
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.B"]);
  });

  it("de-duplicates overlapping target classes across candidates", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door", "Stuff.Window"],
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window", "Stuff.Roof"],
    });
    const result = merge([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Height" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Roof", "Stuff.Window"]);
  });

  it("unions related-endpoint candidates that share identity", () => {
    const path: PropertyField["pathFromTarget"] = [
      {
        sourceClassName: "BisCore.Element",
        targetClassName: "BisCore.ExternalSourceAspect",
        relationshipName: "BisCore.ElementOwnsMultiAspects",
      },
    ];
    const a = createField({
      propertyClassName: "BisCore.ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
      valueClassNames: ["BisCore.ExternalSourceAspectX"],
    });
    const b = createField({
      propertyClassName: "BisCore.ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
      valueClassNames: ["BisCore.ExternalSourceAspectY"],
    });
    const result = merge([a, b]);
    const id = PropertyField.computeId({
      propertyClassName: "BisCore.ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
    });
    expect(result[id].valueClassNames).to.deep.equal([
      "BisCore.ExternalSourceAspectX",
      "BisCore.ExternalSourceAspectY",
    ]);
  });

  it("keeps candidates with distinct identities separate", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
    });
    const b = createField({ propertyClassName: "Stuff.Thing", propertyName: "Width", valueClassNames: ["Stuff.Door"] });
    const result = merge([a, b]);
    expect(Object.keys(result)).to.have.length(2);
  });

  it("throws when grouped candidates have divergent metadata", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
      label: "One",
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
      label: "Two",
    });
    expect(() => merge([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped candidates have divergent category facts", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
    });
    expect(() =>
      mergePropertyFieldsByIdentity([
        { field: a, categorization: { anchor: "none", category: { source: "override", id: "a" } } },
        { field: b, categorization: { anchor: "none", category: { source: "override", id: "b" } } },
      ]),
    ).to.throw(/divergent metadata/);
  });

  it("merges candidates that agree on schema category facts", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
    });
    const schema = { anchor: "targetClass", category: { source: "schema", id: "Geo", label: "Geometry" } } as const;
    const result = toRecord(
      mergePropertyFieldsByIdentity([
        { field: a, categorization: schema, provider: { id: "p_v1" } },
        { field: b, categorization: schema, provider: { id: "p_v1" } },
      ]),
    );
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Height" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });

  it("throws when grouped candidates have divergent hidden flag", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
      hidden: true,
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
      hidden: false,
    });
    expect(() => merge([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped candidates have divergent readOnly flag", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
      readOnly: true,
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
      readOnly: false,
    });
    expect(() => merge([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped candidates have divergent value type", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
      type: { kind: "primitive", type: "String" },
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
      type: { kind: "primitive", type: "Double" },
    });
    expect(() => merge([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped navigation candidates have divergent target class", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff.Door"],
      type: { kind: "navigation", targetClassName: "Stuff.Person" },
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff.Window"],
      type: { kind: "navigation", targetClassName: "Stuff.Organization" },
    });
    expect(() => merge([a, b])).to.throw(/divergent metadata/);
  });

  it("merges navigation candidates that share a target class", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff.Door"],
      type: { kind: "navigation", targetClassName: "Stuff.Person" },
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff.Window"],
      type: { kind: "navigation", targetClassName: "Stuff.Person" },
    });
    const result = merge([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Owner" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });

  it("merges candidates whose value types are structurally equal but distinct instances", () => {
    const type = (): PropertyField["type"] => ({
      kind: "struct",
      members: [
        {
          name: "coords",
          label: "Coords",
          type: { kind: "array", elementType: { kind: "primitive", type: "Double", kindOfQuantity: "Units.LENGTH" } },
        },
      ],
    });
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Point",
      valueClassNames: ["Stuff.Door"],
      type: type(),
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Point",
      valueClassNames: ["Stuff.Window"],
      type: type(),
    });
    const result = merge([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Point" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });

  it("merges candidates with structurally equal enumeration metadata", () => {
    const type = (): PropertyField["type"] => ({
      kind: "primitive",
      type: "Integer",
      enumeration: {
        name: "Stuff.Color",
        isStrict: true,
        enumerators: [
          { value: 0, label: "Red" },
          { value: 1, label: "Green", description: "The green one" },
        ],
      },
    });
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Color",
      valueClassNames: ["Stuff.Door"],
      type: type(),
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Color",
      valueClassNames: ["Stuff.Window"],
      type: type(),
    });
    const result = merge([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Color" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });

  it("throws when grouped candidates have divergent enumeration metadata", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Color",
      valueClassNames: ["Stuff.Door"],
      type: {
        kind: "primitive",
        type: "Integer",
        enumeration: { name: "Stuff.Color", isStrict: true, enumerators: [{ value: 0, label: "Red" }] },
      },
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Color",
      valueClassNames: ["Stuff.Window"],
      type: {
        kind: "primitive",
        type: "Integer",
        enumeration: { name: "Stuff.Color", isStrict: true, enumerators: [{ value: 1, label: "Green" }] },
      },
    });
    expect(() => merge([a, b])).to.throw(/divergent metadata/);
  });

  it("resolves inter-provider metadata conflicts in favor of the higher priority, unioning value classes", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
      label: "Low priority",
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
      label: "High priority",
    });
    const result = toRecord(
      mergePropertyFieldsByIdentity([
        { field: a, categorization: { anchor: "none" }, provider: { id: "a_v1", priority: 1 } },
        { field: b, categorization: { anchor: "none" }, provider: { id: "b_v1", priority: 2 } },
      ]),
    );
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Height" });
    expect(result[id].label).to.equal("High priority");
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });

  it("resolves inter-provider ties in favor of input order", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
      label: "First",
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
      label: "Second",
    });
    const result = toRecord(
      mergePropertyFieldsByIdentity([
        { field: a, categorization: { anchor: "none" }, provider: { id: "a_v1", priority: 5 } },
        { field: b, categorization: { anchor: "none" }, provider: { id: "b_v1", priority: 5 } },
      ]),
    );
    const id = PropertyField.computeId({ propertyClassName: "Stuff.Thing", propertyName: "Height" });
    expect(result[id].label).to.equal("First");
  });

  it("throws when the same provider produces divergent metadata for one field id", () => {
    const a = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
      label: "One",
    });
    const b = createField({
      propertyClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Window"],
      label: "Two",
    });
    expect(() =>
      mergePropertyFieldsByIdentity([
        { field: a, categorization: { anchor: "none" }, provider: { id: "p_v1" } },
        { field: b, categorization: { anchor: "none" }, provider: { id: "p_v1" } },
      ]),
    ).to.throw(/provider "p_v1"/);
  });
});
