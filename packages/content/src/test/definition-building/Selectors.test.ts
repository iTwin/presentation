/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectValueRequirements } from "../../content/definition-building/Selectors.js";
import { computePropertySelectorId } from "../../content/definition-building/ValueSelector.js";
import { createTransformableDescriptor } from "../../content/extensions/DescriptorTransformer.js";
import { PropertyField } from "../../content/model/Field.js";
import { toSortedUniqueClassNames } from "../../content/model/Utils.js";

import type { EC, ECSqlBinding } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { CalculatedField, Field, PropertyField as PropertyFieldType } from "../../content/model/Field.js";

function propertyField(props: {
  propertyClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  valueClassNames: EC.FullClassNameDotNotation[];
  label?: string;
  pathFromTarget?: PropertyFieldType["pathFromTarget"];
}): PropertyFieldType {
  const id = PropertyField.computeId({
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
  return {
    kind: "property",
    id,
    label: props.label ?? "Label",
    type: { kind: "primitive", type: "String" },
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    pathCardinality: "one",
    valueClassNames: toSortedUniqueClassNames(props.valueClassNames),
    primaryClassNames: props.pathFromTarget
      ? [props.pathFromTarget[0].sourceClassName]
      : toSortedUniqueClassNames(props.valueClassNames),
  };
}

function calculatedField(props: {
  id: string;
  expression: string;
  targetAlias?: string;
  bindings?: Record<string, ECSqlBinding>;
}): CalculatedField {
  return {
    kind: "calculated",
    id: props.id,
    label: "Calc",
    type: { kind: "primitive", type: "String" },
    expression: props.expression,
    targetAlias: props.targetAlias,
    bindings: props.bindings,
  };
}

function createDescriptor(fields: Field[]): ContentDescriptor {
  return { sources: [], categories: {}, fields: Object.fromEntries(fields.map((f) => [f.id, f])) };
}

describe("ValueSelector", () => {
  describe("collectValueRequirements", () => {
    it("produces one selector per SQL-backed field", () => {
      const prop = propertyField({
        propertyClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const calc = calculatedField({ id: "provider:calc", expression: "1" });
      const { selectors, fieldSelectorIds } = collectValueRequirements({ fields: [prop, calc], externalInputs: [] });
      expect(Object.keys(selectors)).to.have.members([prop.id, calc.id]);
      expect(selectors[prop.id].kind).to.equal("property");
      expect(selectors[calc.id].kind).to.equal("calculated");
      expect(fieldSelectorIds).to.deep.equal({ [prop.id]: prop.id, [calc.id]: calc.id });
    });

    it("carries a calculated field's expression, targetAlias, and bindings onto its selector", () => {
      const calc = calculatedField({
        id: "provider:calc",
        expression: "this.A * :factor",
        targetAlias: "this",
        bindings: { factor: { type: "double", value: 2 } },
      });
      const { selectors } = collectValueRequirements({ fields: [calc], externalInputs: [] });
      expect(selectors[calc.id]).to.deep.equal({
        kind: "calculated",
        id: calc.id,
        expression: "this.A * :factor",
        targetAlias: "this",
        bindings: { factor: { type: "double", value: 2 } },
      });
    });

    it("deduplicates a property field and its fork into a single selector", () => {
      const field = propertyField({
        propertyClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door", "Stuff.Window"],
      });
      const descriptor = createDescriptor([field]);
      const fork = createTransformableDescriptor(descriptor).forkField(field.id, ["Stuff.Door"]);
      expect(fork.id).to.not.equal(field.id);

      const { selectors, fieldSelectorIds } = collectValueRequirements({
        fields: Object.values(descriptor.fields),
        externalInputs: [],
      });
      expect(Object.keys(selectors)).to.deep.equal([field.id]);
      expect(fieldSelectorIds).to.deep.equal({ [field.id]: field.id, [fork.id]: field.id });
    });

    it("adds a field-less selector for an external input with no matching field", () => {
      const { selectors } = collectValueRequirements({
        fields: [],
        externalInputs: [{ propertyClassName: "Stuff.Thing", propertyName: "Height" }],
      });
      const id = computePropertySelectorId({ propertyClassName: "Stuff.Thing", propertyName: "Height" });
      expect(Object.keys(selectors)).to.deep.equal([id]);
      expect(selectors[id]).to.deep.equal({
        kind: "property",
        id,
        propertyClassName: "Stuff.Thing",
        propertyName: "Height",
        pathFromTarget: [],
      });
    });

    it("keeps selector ids distinct for the same property reached through different filtered paths", () => {
      const pathA = [
        {
          sourceClassName: "Stuff.Thing",
          relationshipName: "Stuff.RelA",
          targetClassName: "Stuff.Other",
          instanceFilter: { expression: "this.Kind = 1", bindings: { kind: { type: "int", value: 1 } } },
        },
      ] as const;
      const pathB = [
        {
          sourceClassName: "Stuff.Thing",
          relationshipName: "Stuff.RelA",
          targetClassName: "Stuff.Other",
          instanceFilter: { expression: "this.Kind = 2", bindings: { kind: { type: "int", value: 2 } } },
        },
      ] as const;

      const idA = computePropertySelectorId({
        propertyClassName: "Stuff.Other",
        propertyName: "Name",
        pathFromTarget: [...pathA],
      });
      const idB = computePropertySelectorId({
        propertyClassName: "Stuff.Other",
        propertyName: "Name",
        pathFromTarget: [...pathB],
      });

      expect(idA).to.not.equal(idB);
      expect(idA).to.contain("Kind = 1");
      expect(idB).to.contain("Kind = 2");
    });

    it("reuses the field-backed selector for an external input matching a field (no duplicate)", () => {
      const prop = propertyField({
        propertyClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const { selectors } = collectValueRequirements({
        fields: [prop],
        externalInputs: [{ propertyClassName: "Stuff.Thing", propertyName: "Height" }],
      });
      expect(Object.keys(selectors)).to.deep.equal([prop.id]);
    });

    it("drops a removed output field's selector on recompute, but keeps it when it is also an external input (pinning replacement)", () => {
      const removable = propertyField({
        propertyClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const inputBacked = propertyField({
        propertyClassName: "Stuff.Thing",
        propertyName: "Width",
        valueClassNames: ["Stuff.Door"],
      });
      const descriptor = createDescriptor([removable, inputBacked]);
      const externalInputs = [{ propertyClassName: "Stuff.Thing" as const, propertyName: "Width" }];

      const transformable = createTransformableDescriptor(descriptor);
      transformable.removeField(removable.id);
      transformable.removeField(inputBacked.id);

      const { selectors } = collectValueRequirements({ fields: Object.values(descriptor.fields), externalInputs });
      expect(selectors).to.have.property(inputBacked.id);
      expect(selectors).to.not.have.property(removable.id);
    });
  });
});
