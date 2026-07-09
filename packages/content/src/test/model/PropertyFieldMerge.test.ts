/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { PropertyField } from "../../content/model/Field.js";
import { mergePropertyFieldsByIdentity } from "../../content/model/PropertyFieldMerge.js";

import type { EC } from "@itwin/presentation-shared";

function createField(props: {
  sourceClassName: EC.FullClassName;
  propertyName: string;
  valueClassNames: EC.FullClassName[];
  label?: string;
  categoryId?: string;
  hidden?: boolean;
  readOnly?: boolean;
  type?: PropertyField["type"];
  pathFromTarget?: PropertyField["pathFromTarget"];
}): PropertyField {
  return {
    kind: "property",
    id: "unused",
    selectorId: "unused",
    label: props.label ?? "Label",
    type: props.type ?? { kind: "primitive", type: "String" },
    categoryId: props.categoryId,
    hidden: props.hidden,
    readOnly: props.readOnly,
    sourceClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: props.valueClassNames,
  };
}

describe("mergePropertyFieldsByIdentity", () => {
  it("returns an empty record for no candidates", () => {
    expect(mergePropertyFieldsByIdentity([])).to.deep.equal({});
  });

  it("passes a single candidate through, keyed by base id, with normalized target classes", () => {
    const field = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window", "Stuff:Door"],
    });
    const result = mergePropertyFieldsByIdentity([field]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff:Thing", propertyName: "Height" });
    expect(result).to.deep.equal({
      [id]: { ...field, id, selectorId: id, valueClassNames: ["Stuff.Door", "Stuff.Window"] },
    });
  });

  it("does not mutate the input candidate", () => {
    const field = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window"],
    });
    mergePropertyFieldsByIdentity([field]);
    expect(field.id).to.equal("unused");
    expect(field.valueClassNames).to.deep.equal(["Stuff:Window"]);
  });

  it("unions target classes of direct-property candidates that share identity", () => {
    const a = createField({ sourceClassName: "Stuff:Thing", propertyName: "Height", valueClassNames: ["Stuff:Door"] });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window"],
    });
    const result = mergePropertyFieldsByIdentity([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff:Thing", propertyName: "Height" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });

  it("de-duplicates overlapping target classes across candidates", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Door", "Stuff:Window"],
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window", "Stuff:Roof"],
    });
    const result = mergePropertyFieldsByIdentity([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff:Thing", propertyName: "Height" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Roof", "Stuff.Window"]);
  });

  it("unions related-endpoint candidates that share identity", () => {
    const path: PropertyField["pathFromTarget"] = [
      {
        sourceClassName: "BisCore:Element",
        targetClassName: "BisCore:ExternalSourceAspect",
        relationshipName: "BisCore:ElementOwnsMultiAspects",
      },
    ];
    const a = createField({
      sourceClassName: "BisCore:ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
      valueClassNames: ["BisCore:ExternalSourceAspectX"],
    });
    const b = createField({
      sourceClassName: "BisCore:ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
      valueClassNames: ["BisCore:ExternalSourceAspectY"],
    });
    const result = mergePropertyFieldsByIdentity([a, b]);
    const id = PropertyField.computeId({
      propertyClassName: "BisCore:ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
    });
    expect(result[id].valueClassNames).to.deep.equal([
      "BisCore.ExternalSourceAspectX",
      "BisCore.ExternalSourceAspectY",
    ]);
  });

  it("keeps candidates with distinct identities separate", () => {
    const a = createField({ sourceClassName: "Stuff:Thing", propertyName: "Height", valueClassNames: ["Stuff:Door"] });
    const b = createField({ sourceClassName: "Stuff:Thing", propertyName: "Width", valueClassNames: ["Stuff:Door"] });
    const result = mergePropertyFieldsByIdentity([a, b]);
    expect(Object.keys(result)).to.have.length(2);
  });

  it("throws when grouped candidates have divergent metadata", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Door"],
      label: "One",
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window"],
      label: "Two",
    });
    expect(() => mergePropertyFieldsByIdentity([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped candidates have divergent category", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Door"],
      categoryId: "a",
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window"],
      categoryId: "b",
    });
    expect(() => mergePropertyFieldsByIdentity([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped candidates have divergent hidden flag", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Door"],
      hidden: true,
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window"],
      hidden: false,
    });
    expect(() => mergePropertyFieldsByIdentity([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped candidates have divergent readOnly flag", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Door"],
      readOnly: true,
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window"],
      readOnly: false,
    });
    expect(() => mergePropertyFieldsByIdentity([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped candidates have divergent value type", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Door"],
      type: { kind: "primitive", type: "String" },
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Window"],
      type: { kind: "primitive", type: "Double" },
    });
    expect(() => mergePropertyFieldsByIdentity([a, b])).to.throw(/divergent metadata/);
  });

  it("throws when grouped navigation candidates have divergent target class", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff:Door"],
      type: { kind: "navigation", targetClassName: "Stuff.Person" },
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff:Window"],
      type: { kind: "navigation", targetClassName: "Stuff.Organization" },
    });
    expect(() => mergePropertyFieldsByIdentity([a, b])).to.throw(/divergent metadata/);
  });

  it("merges navigation candidates that share a target class", () => {
    const a = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff:Door"],
      type: { kind: "navigation", targetClassName: "Stuff.Person" },
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Owner",
      valueClassNames: ["Stuff:Window"],
      type: { kind: "navigation", targetClassName: "Stuff.Person" },
    });
    const result = mergePropertyFieldsByIdentity([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff:Thing", propertyName: "Owner" });
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
      sourceClassName: "Stuff:Thing",
      propertyName: "Point",
      valueClassNames: ["Stuff:Door"],
      type: type(),
    });
    const b = createField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Point",
      valueClassNames: ["Stuff:Window"],
      type: type(),
    });
    const result = mergePropertyFieldsByIdentity([a, b]);
    const id = PropertyField.computeId({ propertyClassName: "Stuff:Thing", propertyName: "Point" });
    expect(result[id].valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });
});
