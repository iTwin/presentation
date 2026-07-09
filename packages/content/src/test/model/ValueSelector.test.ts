/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createTransformableDescriptor } from "../../content/extensions/DescriptorTransformer.js";
import { PropertyField } from "../../content/model/Field.js";
import { toSortedUniqueClassNames } from "../../content/model/Utils.js";
import {
  collectSelectors,
  computePropertySelectorId,
  createCalculatedSelector,
  createPropertySelector,
} from "../../content/model/ValueSelector.js";

import type { EC } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { CalculatedField, Field, PropertyField as PropertyFieldType } from "../../content/model/Field.js";

function propertyField(props: {
  sourceClassName: EC.FullClassName;
  propertyName: string;
  valueClassNames: string[];
  label?: string;
  pathFromTarget?: PropertyFieldType["pathFromTarget"];
}): PropertyFieldType {
  const selectorId = PropertyField.computeId({
    propertyClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
  return {
    kind: "property",
    id: selectorId,
    selectorId,
    label: props.label ?? "Label",
    type: { kind: "primitive", type: "String" },
    sourceClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: toSortedUniqueClassNames(props.valueClassNames as EC.FullClassName[]),
  };
}

function calculatedField(props: { id: string; expression: string; targetAlias?: string }): CalculatedField {
  return {
    kind: "calculated",
    id: props.id,
    selectorId: props.id,
    label: "Calc",
    type: { kind: "primitive", type: "String" },
    expression: props.expression,
    targetAlias: props.targetAlias,
  };
}

function createDescriptor(fields: Field[]): ContentDescriptor {
  return { sources: [], categories: {}, selectors: {}, fields: Object.fromEntries(fields.map((f) => [f.id, f])) };
}

describe("ValueSelector", () => {
  describe("computePropertySelectorId", () => {
    it("returns the base property field id (delegates to PropertyField.computeId without a forkKey)", () => {
      const props = { propertyClassName: "Stuff:Thing" as EC.FullClassName, propertyName: "Height" };
      expect(computePropertySelectorId(props)).to.equal(PropertyField.computeId(props));
    });
  });

  describe("createCalculatedSelector", () => {
    it("builds a calculated selector from the given id and expression", () => {
      expect(createCalculatedSelector({ id: "provider:calc", expression: "1 + 1" })).to.deep.equal({
        kind: "calculated",
        id: "provider:calc",
        expression: "1 + 1",
      });
    });

    it("includes targetAlias and bindings only when provided", () => {
      expect(
        createCalculatedSelector({
          id: "a",
          expression: "x",
          targetAlias: "e",
          bindings: { p: { type: "string", value: "v" } },
        }),
      ).to.deep.equal({
        kind: "calculated",
        id: "a",
        expression: "x",
        targetAlias: "e",
        bindings: { p: { type: "string", value: "v" } },
      });

      const minimal = createCalculatedSelector({ id: "a", expression: "x" });
      expect(minimal).to.not.have.property("targetAlias");
      expect(minimal).to.not.have.property("bindings");
    });
  });

  describe("collectSelectors", () => {
    it("produces one selector per SQL-backed field", () => {
      const prop = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door"],
      });
      const calc = calculatedField({ id: "provider:calc", expression: "1" });
      const selectors = collectSelectors([prop, calc], []);
      expect(Object.keys(selectors)).to.have.members([prop.selectorId, calc.selectorId]);
      expect(selectors[prop.selectorId].kind).to.equal("property");
      expect(selectors[calc.selectorId].kind).to.equal("calculated");
    });

    it("deduplicates a property field and its fork into a single selector", () => {
      const field = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door", "Stuff:Window"],
      });
      const descriptor = createDescriptor([field]);
      const fork = createTransformableDescriptor(descriptor).forkField(field.id, ["Stuff:Door"]);
      expect(fork.id).to.not.equal(field.id);

      const selectors = collectSelectors(Object.values(descriptor.fields), []);
      expect(Object.keys(selectors)).to.deep.equal([field.selectorId]);
    });

    it("adds a field-less selector for an external input with no matching field", () => {
      const selectors = collectSelectors([], [{ className: "Stuff:Thing", propertyName: "Height" }]);
      const id = computePropertySelectorId({ propertyClassName: "Stuff:Thing", propertyName: "Height" });
      expect(Object.keys(selectors)).to.deep.equal([id]);
      expect(selectors[id]).to.deep.equal(
        createPropertySelector({ sourceClassName: "Stuff:Thing", propertyName: "Height" }),
      );
    });

    it("reuses the field-backed selector for an external input matching a field (no duplicate)", () => {
      const prop = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door"],
      });
      const selectors = collectSelectors([prop], [{ className: "Stuff:Thing", propertyName: "Height" }]);
      expect(Object.keys(selectors)).to.deep.equal([prop.selectorId]);
    });

    it("drops a removed output field's selector on recompute, but keeps it when it is also an external input (pinning replacement)", () => {
      const removable = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff:Door"],
      });
      const inputBacked = propertyField({
        sourceClassName: "Stuff:Thing",
        propertyName: "Width",
        valueClassNames: ["Stuff:Door"],
      });
      const descriptor = createDescriptor([removable, inputBacked]);
      const externalInputs = [{ className: "Stuff:Thing" as EC.FullClassName, propertyName: "Width" }];

      const transformable = createTransformableDescriptor(descriptor);
      transformable.removeField(removable.id);
      transformable.removeField(inputBacked.id);

      const selectors = collectSelectors(Object.values(descriptor.fields), externalInputs);
      expect(selectors).to.have.property(inputBacked.selectorId);
      expect(selectors).to.not.have.property(removable.selectorId);
    });
  });
});
