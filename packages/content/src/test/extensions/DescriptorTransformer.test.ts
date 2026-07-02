/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createTransformableDescriptor } from "../../content/extensions/DescriptorTransformer.js";
import { PropertyField } from "../../content/model/Field.js";
import { computeFieldForkKey, toSortedUniqueClassNames } from "../../content/model/Utils.js";

import type { EC } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { CalculatedField, Field } from "../../content/model/Field.js";

function propertyField(props: {
  sourceClassName: EC.FullClassName;
  propertyName: string;
  valueClassNames: EC.FullClassName[];
  pathFromTarget?: PropertyField["pathFromTarget"];
}): PropertyField {
  return {
    kind: "property",
    id: PropertyField.computeId({
      propertyClassName: props.sourceClassName,
      propertyName: props.propertyName,
      pathFromTarget: props.pathFromTarget,
    }),
    label: "Label",
    type: { kind: "primitive", type: "String" },
    sourceClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: toSortedUniqueClassNames(props.valueClassNames),
  };
}

function createDescriptor(fields: Field[]): ContentDescriptor {
  return { sources: [], categories: {}, fields: Object.fromEntries(fields.map((f) => [f.id, f])) };
}

describe("createTransformableDescriptor", () => {
  it("exposes sources, categories, and fields of the backing descriptor", () => {
    const field = propertyField({
      sourceClassName: "Stuff:Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff:Door"],
    });
    const descriptor = createDescriptor([field]);
    const transformable = createTransformableDescriptor(descriptor);
    expect(transformable.sources).to.equal(descriptor.sources);
    expect(transformable.categories).to.equal(descriptor.categories);
    expect(transformable.fields[field.id]).to.equal(field);
  });

  describe("removeField", () => {
    it("removes a field from the backing descriptor", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);
      transformable.removeField(field.id);
      expect(descriptor.fields[field.id]).to.be.undefined;
    });
  });

  describe("forkField", () => {
    it("carves a strict subset into a new field and shrinks the original", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door", "Stuff:Window", "Stuff:Roof"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);

      const fork = transformable.forkField(field.id, ["Stuff:Door"]);
      const forkedId = PropertyField.computeId({
        propertyClassName: "Stuff:Thing",
        propertyName: "Height",
        forkKey: computeFieldForkKey(["Stuff.Door"]),
      });

      expect(fork.id).to.equal(forkedId);
      expect(fork.valueClassNames).to.deep.equal(["Stuff.Door"]);
      expect(descriptor.fields[forkedId]).to.equal(fork);
      // original is shrunk to the remainder
      expect(field.valueClassNames).to.deep.equal(["Stuff.Roof", "Stuff.Window"]);
      expect(field.id).to.equal(PropertyField.computeId({ propertyClassName: "Stuff:Thing", propertyName: "Height" }));
    });

    it("carves a related-endpoint subclass over a relationship path", () => {
      const path: PropertyField["pathFromTarget"] = [
        {
          sourceClassName: "BisCore:Element",
          targetClassName: "BisCore:ExternalSourceAspect",
          relationshipName: "BisCore:ElementOwnsMultiAspects",
        },
      ];
      const field = propertyField({
        sourceClassName: "BisCore:ExternalSourceAspect",
        propertyName: "Identifier",
        pathFromTarget: path,
        valueClassNames: ["BisCore:ExternalSourceAspectX", "BisCore:ExternalSourceAspectY"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);

      const fork = transformable.forkField(field.id, ["BisCore:ExternalSourceAspectX"]);
      expect(fork.valueClassNames).to.deep.equal(["BisCore.ExternalSourceAspectX"]);
      expect(field.valueClassNames).to.deep.equal(["BisCore.ExternalSourceAspectY"]);
    });

    it("returns the original field in place when the subset covers all classes", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door", "Stuff:Window"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);

      const fork = transformable.forkField(field.id, ["Stuff:Window", "Stuff:Door"]);
      expect(fork).to.equal(field);
      expect(Object.keys(descriptor.fields)).to.deep.equal([field.id]);
      expect(field.valueClassNames).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
    });

    it("is idempotent — forking the same subset twice returns the same field", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door", "Stuff:Window"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);

      const first = transformable.forkField(field.id, ["Stuff:Door"]);
      const second = transformable.forkField(field.id, ["Stuff:Door"]);
      expect(second).to.equal(first);
      // original stays shrunk to the remainder, not shrunk twice
      expect(field.valueClassNames).to.deep.equal(["Stuff.Window"]);
      expect(Object.keys(descriptor.fields)).to.have.length(2);
    });

    it("keeps the forked field's target classes independent of the original", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door", "Stuff:Window"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);

      const fork = transformable.forkField(field.id, ["Stuff:Door"]);
      expect(fork.valueClassNames).to.not.equal(field.valueClassNames);
    });

    it("throws when the field does not exist", () => {
      const descriptor = createDescriptor([]);
      const transformable = createTransformableDescriptor(descriptor);
      expect(() => transformable.forkField("missing", ["Stuff:Door"])).to.throw(/no such field/);
    });

    it("throws when the field is not a property field", () => {
      const calculated: CalculatedField = {
        kind: "calculated",
        id: "calc",
        label: "Calc",
        type: { kind: "primitive", type: "String" },
        expression: "1",
      };
      const descriptor = createDescriptor([calculated]);
      const transformable = createTransformableDescriptor(descriptor);
      expect(() => transformable.forkField("calc", ["Stuff:Door"])).to.throw(/only property fields/);
    });

    it("throws when the target class subset is empty", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);
      expect(() => transformable.forkField(field.id, [])).to.throw(/must not be empty/);
    });

    it("throws when a subset class is not represented by the field", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door"],
      });
      const descriptor = createDescriptor([field]);
      const transformable = createTransformableDescriptor(descriptor);
      expect(() => transformable.forkField(field.id, ["Stuff:Window"])).to.throw(/not represented/);
    });
  });
});
