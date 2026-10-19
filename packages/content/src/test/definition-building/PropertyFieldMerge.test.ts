/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { mergePropertyFieldsByIdentity } from "../../content/definition-building/PropertyFieldMerge.js";
import { PropertyField } from "../../content/model/Field.js";

import type { EC } from "@itwin/presentation-shared";
import type { CategoryContext } from "../../content/ContentTarget.js";

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
  pathCardinality?: PropertyField["pathCardinality"];
}): PropertyField {
  const id = PropertyField.computeId({
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
  const pathCardinality = props.pathCardinality ?? "one";
  return {
    kind: "property",
    id,
    label: props.label ?? "Label",
    type: props.type ?? { kind: "primitive", type: "String" },
    hidden: props.hidden,
    readOnly: props.readOnly,
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: props.valueClassNames,
    primaryClassNames: props.primaryClassNames ?? props.valueClassNames,
    pathCardinality,
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
      mergePropertyFieldsByIdentity(
        fields.map((field) => ({ field, categorization: { anchor: "none" as const, categoryContext: [] } })),
      ),
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
        valueClassNames: ["Stuff.Door", "Stuff.Window"],
        primaryClassNames: ["Stuff.Door", "Stuff.Window"],
        pathCardinality: "one",
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

  it("keeps the same property reached through different filtered paths separate", () => {
    const pathA: PropertyField["pathFromTarget"] = [
      {
        sourceClassName: "Stuff.Thing",
        relationshipName: "Stuff.RelA",
        targetClassName: "Stuff.Other",
        instanceFilter: { expression: "this.Kind = 1" },
      },
    ];
    const pathB: PropertyField["pathFromTarget"] = [
      {
        sourceClassName: "Stuff.Thing",
        relationshipName: "Stuff.RelA",
        targetClassName: "Stuff.Other",
        instanceFilter: { expression: "this.Kind = 2" },
      },
    ];
    const a = createField({
      propertyClassName: "Stuff.Other",
      propertyName: "Name",
      pathFromTarget: pathA,
      valueClassNames: ["Stuff.Other"],
    });
    const b = createField({
      propertyClassName: "Stuff.Other",
      propertyName: "Name",
      pathFromTarget: pathB,
      valueClassNames: ["Stuff.Other"],
    });

    const result = merge([a, b]);
    expect(Object.keys(result)).to.have.length(2);
    expect(Object.keys(result)[0]).to.not.equal(Object.keys(result)[1]);
    expect(Object.keys(result)).to.deep.equal([
      PropertyField.computeId({ propertyClassName: "Stuff.Other", propertyName: "Name", pathFromTarget: pathA }),
      PropertyField.computeId({ propertyClassName: "Stuff.Other", propertyName: "Name", pathFromTarget: pathB }),
    ]);
  });

  it("merges to `many` when candidates disagree about the path cardinality", () => {
    // Describing a many-valued path as single-valued would drop every related instance but one, so
    // `many` wins regardless of candidate order.
    const path: PropertyField["pathFromTarget"] = [
      {
        sourceClassName: "BisCore.Element",
        targetClassName: "BisCore.ExternalSourceAspect",
        relationshipName: "BisCore.ElementOwnsMultiAspects",
      },
    ];
    const id = PropertyField.computeId({
      propertyClassName: "BisCore.ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
    });
    const one = createField({
      propertyClassName: "BisCore.ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
      pathCardinality: "one",
      valueClassNames: ["BisCore.ExternalSourceAspect"],
    });
    const many = createField({
      propertyClassName: "BisCore.ExternalSourceAspect",
      propertyName: "Identifier",
      pathFromTarget: path,
      pathCardinality: "many",
      valueClassNames: ["BisCore.ExternalSourceAspect"],
    });

    for (const candidates of [
      [one, many],
      [many, one],
    ]) {
      const merged = merge(candidates)[id];
      expect(merged.pathCardinality).to.equal("many");
      expect(merged.type).to.deep.equal({ kind: "primitive", type: "String" });
    }
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
        {
          field: a,
          categorization: { anchor: "none", categoryContext: [], category: { source: "override", id: "a" } },
        },
        {
          field: b,
          categorization: { anchor: "none", categoryContext: [], category: { source: "override", id: "b" } },
        },
      ]),
    ).to.throw(/divergent metadata/);
  });

  describe("category placement", () => {
    const outerContext = [{ stepIndex: 0, kind: "targetClass" }] as const;
    const innerContext = [...outerContext, { stepIndex: 1, kind: "targetClass" }] as const;
    const create = (valueClassName: EC.FullClassNameDotNotation) =>
      createField({ propertyClassName: "Stuff.Thing", propertyName: "Height", valueClassNames: [valueClassName] });
    const placementOf = (
      candidates: Array<{
        scope?: "relatedClass" | "parent";
        context?: CategoryContext;
        providerId: `${string}_v${number}`;
        priority?: number;
      }>,
    ) =>
      mergePropertyFieldsByIdentity(
        candidates.map(({ scope, context, providerId, priority }, index) => ({
          field: create(`Stuff.V${index}`),
          categorization: {
            anchor: "targetClass" as const,
            ...(scope ? { propertyCategoryScope: scope } : undefined),
            categoryContext: context ?? [],
          },
          provider: { id: providerId, ...(priority !== undefined ? { priority } : undefined) },
        })),
      )[0].categorization;

    it("keeps parent scope and context when every winning candidate agrees", () => {
      expect(
        placementOf([
          { scope: "parent", context: innerContext, providerId: "a_v1" },
          { scope: "parent", context: innerContext, providerId: "b_v1" },
        ]),
      ).to.deep.equal({ anchor: "targetClass", propertyCategoryScope: "parent", categoryContext: innerContext });
    });

    it("keeps the first candidate's scope when priorities tie", () => {
      const parent = { scope: "parent", providerId: "a_v1" } as const;
      const related = { providerId: "b_v1" } as const;
      expect(placementOf([parent, related])).to.deep.equal({
        anchor: "targetClass",
        propertyCategoryScope: "parent",
        categoryContext: [],
      });
      expect(placementOf([related, parent])).to.deep.equal({ anchor: "targetClass", categoryContext: [] });
    });

    it("keeps the first candidate's context when priorities tie", () => {
      const inner = { context: innerContext, providerId: "a_v1" } as const;
      const outer = { context: outerContext, providerId: "b_v1" } as const;
      expect(placementOf([inner, outer])).to.deep.equal({ anchor: "targetClass", categoryContext: innerContext });
      expect(placementOf([outer, inner])).to.deep.equal({ anchor: "targetClass", categoryContext: outerContext });
    });

    it("ignores placement of lower-priority candidates", () => {
      expect(
        placementOf([
          { providerId: "a_v1", priority: 1 },
          { scope: "parent", context: innerContext, providerId: "b_v1", priority: 2 },
        ]),
      ).to.deep.equal({ anchor: "targetClass", propertyCategoryScope: "parent", categoryContext: innerContext });
    });

    it("accepts equivalent omitted and explicit defaults from the same provider", () => {
      const implicit = { providerId: "a_v1" } as const;
      const explicit = { providerId: "a_v1", scope: "relatedClass", context: [] } as const;
      expect(placementOf([implicit, explicit])).to.deep.equal({ anchor: "targetClass", categoryContext: [] });
      expect(placementOf([explicit, implicit])).to.deep.equal({
        anchor: "targetClass",
        propertyCategoryScope: "relatedClass",
        categoryContext: [],
      });
    });

    it("rejects divergent scopes from the same provider", () => {
      expect(() => placementOf([{ providerId: "a_v1", scope: "parent" }, { providerId: "a_v1" }])).to.throw(
        /divergent metadata/,
      );
    });

    it("rejects divergent contexts from the same provider", () => {
      expect(() =>
        placementOf([
          { providerId: "a_v1", context: outerContext },
          { providerId: "a_v1", context: innerContext },
        ]),
      ).to.throw(/divergent metadata/);
    });
  });

  it("merges candidates that agree on property category facts", () => {
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
    const categorization = {
      anchor: "targetClass",
      categoryContext: [],
      category: { source: "propertyCategory", id: "Stuff.Geo", label: "Geometry" },
    } as const;
    const result = toRecord(
      mergePropertyFieldsByIdentity([
        { field: a, categorization, provider: { id: "p_v1" } },
        { field: b, categorization, provider: { id: "p_v1" } },
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
        { field: a, categorization: { anchor: "none", categoryContext: [] }, provider: { id: "a_v1", priority: 1 } },
        { field: b, categorization: { anchor: "none", categoryContext: [] }, provider: { id: "b_v1", priority: 2 } },
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
        { field: a, categorization: { anchor: "none", categoryContext: [] }, provider: { id: "a_v1", priority: 5 } },
        { field: b, categorization: { anchor: "none", categoryContext: [] }, provider: { id: "b_v1", priority: 5 } },
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
        { field: a, categorization: { anchor: "none", categoryContext: [] }, provider: { id: "p_v1" } },
        { field: b, categorization: { anchor: "none", categoryContext: [] }, provider: { id: "p_v1" } },
      ]),
    ).to.throw(/provider "p_v1"/);
  });
});
