/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectSelectors } from "../../content/descriptor-building/Selectors.js";
import { createTransformableDescriptor } from "../../content/extensions/DescriptorTransformer.js";
import { PropertyField } from "../../content/model/Field.js";
import { toSortedUniqueClassNames } from "../../content/model/Utils.js";
import { computePropertySelectorId } from "../../content/model/ValueSelector.js";

import type { EC, ECSqlBinding } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { CalculatedField, Field, PropertyField as PropertyFieldType } from "../../content/model/Field.js";

function propertyField(props: {
  propertyClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  valueClassNames: string[];
  label?: string;
  pathFromTarget?: PropertyFieldType["pathFromTarget"];
}): PropertyFieldType {
  const selectorId = PropertyField.computeId({
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
  return {
    kind: "property",
    id: selectorId,
    selectorId,
    label: props.label ?? "Label",
    type: { kind: "primitive", type: "String" },
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: toSortedUniqueClassNames(props.valueClassNames as EC.FullClassNameDotNotation[]),
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
    selectorId: props.id,
    label: "Calc",
    type: { kind: "primitive", type: "String" },
    expression: props.expression,
    targetAlias: props.targetAlias,
    bindings: props.bindings,
  };
}

function createDescriptor(fields: Field[]): ContentDescriptor {
  return { sources: [], categories: {}, selectors: {}, fields: Object.fromEntries(fields.map((f) => [f.id, f])) };
}

describe("ValueSelector", () => {
  describe("collectSelectors", () => {
    it("produces one selector per SQL-backed field", () => {
      const prop = propertyField({
        propertyClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const calc = calculatedField({ id: "provider:calc", expression: "1" });
      const selectors = collectSelectors({ fields: [prop, calc], externalInputs: [] });
      expect(Object.keys(selectors)).to.have.members([prop.selectorId, calc.selectorId]);
      expect(selectors[prop.selectorId].kind).to.equal("property");
      expect(selectors[calc.selectorId].kind).to.equal("calculated");
    });

    it("carries a calculated field's expression, targetAlias, and bindings onto its selector", () => {
      const calc = calculatedField({
        id: "provider:calc",
        expression: "this.A * :factor",
        targetAlias: "this",
        bindings: { factor: { type: "double", value: 2 } },
      });
      const selectors = collectSelectors({ fields: [calc], externalInputs: [] });
      expect(selectors[calc.selectorId]).to.deep.equal({
        kind: "calculated",
        id: calc.selectorId,
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

      const selectors = collectSelectors({ fields: Object.values(descriptor.fields), externalInputs: [] });
      expect(Object.keys(selectors)).to.deep.equal([field.selectorId]);
    });

    it("adds a field-less selector for an external input with no matching field", () => {
      const selectors = collectSelectors({
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

    it("reuses the field-backed selector for an external input matching a field (no duplicate)", () => {
      const prop = propertyField({
        propertyClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const selectors = collectSelectors({
        fields: [prop],
        externalInputs: [{ propertyClassName: "Stuff.Thing", propertyName: "Height" }],
      });
      expect(Object.keys(selectors)).to.deep.equal([prop.selectorId]);
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
      const externalInputs = [
        { propertyClassName: "Stuff.Thing" as EC.FullClassNameDotNotation, propertyName: "Width" },
      ];

      const transformable = createTransformableDescriptor(descriptor);
      transformable.removeField(removable.id);
      transformable.removeField(inputBacked.id);

      const selectors = collectSelectors({ fields: Object.values(descriptor.fields), externalInputs });
      expect(selectors).to.have.property(inputBacked.selectorId);
      expect(selectors).to.not.have.property(removable.selectorId);
    });
  });
});
