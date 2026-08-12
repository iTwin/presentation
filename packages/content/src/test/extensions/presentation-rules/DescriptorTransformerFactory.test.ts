/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createTransformableDescriptor } from "../../../content/extensions/DescriptorTransformer.js";
import { createDescriptorTransformerFromContentModifierRule } from "../../../content/extensions/presentation-rules/DescriptorTransformerFactory.js";
import { PropertyField } from "../../../content/model/Field.js";
import { computeFieldForkKey, toSortedUniqueClassNames } from "../../../content/model/Utils.js";

import type { EC, ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type * as PresentationRules from "../../../content/extensions/presentation-rules/PresentationRules.js";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { CalculatedField, Field } from "../../../content/model/Field.js";

function propertyField(props: {
  sourceClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  valueClassNames: EC.FullClassNameDotNotation[];
  pathFromTarget?: PropertyField["pathFromTarget"];
  label?: string;
  hidden?: boolean;
}): PropertyField {
  const id = PropertyField.computeId({
    propertyClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
  return {
    kind: "property",
    id,
    selectorId: id,
    label: props.label ?? "Label",
    type: { kind: "primitive", type: "String" },
    propertyClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: toSortedUniqueClassNames(props.valueClassNames),
    hidden: props.hidden,
  };
}

function calculatedField(id: string): CalculatedField {
  return {
    kind: "calculated",
    id,
    label: "Calc",
    type: { kind: "primitive", type: "String" },
    expression: "1+1",
  } as unknown as CalculatedField;
}

function createDescriptor(fields: Field[]): ContentDescriptor {
  return { sources: [], categories: {}, selectors: {}, fields: Object.fromEntries(fields.map((f) => [f.id, f])) };
}

function forkedId(props: {
  sourceClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  subset: EC.FullClassNameDotNotation[];
  pathFromTarget?: PropertyField["pathFromTarget"];
}): Field["id"] {
  return PropertyField.computeId({
    propertyClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
    forkKey: computeFieldForkKey(props.subset),
  });
}

/** Builds an `imodelAccess` stub with configurable schemas and a class-derivation map. */
function createImodelAccess(props?: {
  schemas?: Map<string, EC.SchemaVersion>;
  /** Map of `derivedClass -> list of ancestor classes it derives from` (a class always derives from itself). */
  derivesFrom?: Record<string, string[]>;
}): ECSchemaProvider & ECClassHierarchyInspector {
  const schemas = props?.schemas;
  const derivesFrom = props?.derivesFrom ?? {};
  return {
    getSchema: async (name: string) => {
      const version = schemas?.get(name);
      return version
        ? { name, version, isHidden: false, getClass: () => undefined }
        : undefined;
    },
    classDerivesFrom: async (derived: string, base: string) =>
      derived === base || (derivesFrom[derived] ?? []).includes(base),
  };
}

describe("createDescriptorTransformerFromContentModifierRule", () => {
  it("is a no-op when there are no property overrides", async () => {
    const field = propertyField({
      sourceClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
    });
    const descriptor = createDescriptor([field]);
    const before = structuredClone(descriptor);
    const transformer = createDescriptorTransformerFromContentModifierRule({ rule: { propertyOverrides: [] } });
    await transformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess(),
    });
    expect(descriptor).to.deep.equal(before);
  });

  it("is a no-op when property overrides are undefined", async () => {
    const field = propertyField({
      sourceClassName: "Stuff.Thing",
      propertyName: "Height",
      valueClassNames: ["Stuff.Door"],
    });
    const descriptor = createDescriptor([field]);
    const before = structuredClone(descriptor);
    const transformer = createDescriptorTransformerFromContentModifierRule({ rule: {} });
    await transformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess(),
    });
    expect(descriptor).to.deep.equal(before);
  });

  it("exposes the rule priority on the transformer", () => {
    const transformer = createDescriptorTransformerFromContentModifierRule({
      rule: { priority: 42, propertyOverrides: [] },
    });
    expect(transformer.priority).to.equal(42);
  });

  describe("requiredSchemas gating", () => {
    const field = () =>
      propertyField({ sourceClassName: "Stuff.Thing", propertyName: "Height", valueClassNames: ["Stuff.Door"] });

    it("applies overrides when required schema version is satisfied", async () => {
      const f = field();
      const descriptor = createDescriptor([f]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: {
          requiredSchemas: [{ name: "Stuff", minVersion: "1.0.0" }],
          propertyOverrides: [{ name: "Height", labelOverride: "H" }],
        },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess({ schemas: new Map([["Stuff", { read: 1, write: 0, minor: 0 }]]) }),
      });
      expect(descriptor.fields[f.id].label).to.equal("H");
    });

    it("is a no-op when required schema is missing", async () => {
      const f = field();
      const descriptor = createDescriptor([f]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: {
          requiredSchemas: [{ name: "Missing", minVersion: "1.0.0" }],
          propertyOverrides: [{ name: "Height", labelOverride: "H" }],
        },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(descriptor.fields[f.id].label).to.equal("Label");
    });
  });

  describe("value-class matching and forking", () => {
    it("applies overrides in place to all value classes when the rule has no class", async () => {
      const field = propertyField({
        sourceClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door", "Stuff.Window"],
      });
      const descriptor = createDescriptor([field]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: { propertyOverrides: [{ name: "Height", labelOverride: "H" }] },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(Object.keys(descriptor.fields)).to.have.length(1);
      expect(descriptor.fields[field.id].label).to.equal("H");
      expect((descriptor.fields[field.id] as PropertyField).valueClassNames).to.deep.equal([
        "Stuff.Door",
        "Stuff.Window",
      ]);
    });

    it("mutates in place when the rule class matches all value classes", async () => {
      const field = propertyField({
        sourceClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door", "Stuff.Window"],
      });
      const descriptor = createDescriptor([field]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: {
          class: { schemaName: "Stuff", className: "Thing" },
          propertyOverrides: [{ name: "Height", labelOverride: "H" }],
        },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess({
          derivesFrom: { "Stuff.Door": ["Stuff.Thing"], "Stuff.Window": ["Stuff.Thing"] },
        }),
      });
      expect(Object.keys(descriptor.fields)).to.have.length(1);
      expect(descriptor.fields[field.id].label).to.equal("H");
    });

    it("forks a strict subset into a second field, leaving the unmatched class unchanged", async () => {
      const field = propertyField({
        sourceClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door", "Stuff.Window"],
      });
      const descriptor = createDescriptor([field]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: {
          class: { schemaName: "Stuff", className: "Window" },
          propertyOverrides: [{ name: "Height", labelOverride: "Window Height" }],
        },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess({
          derivesFrom: { "Stuff.Door": ["Stuff.Thing"], "Stuff.Window": ["Stuff.Thing"] },
        }),
      });
      const fork = forkedId({ sourceClassName: "Stuff.Thing", propertyName: "Height", subset: ["Stuff.Window"] });
      expect(Object.keys(descriptor.fields)).to.have.members([field.id, fork]);
      // Original survivor keeps the unmatched class and its label.
      expect(descriptor.fields[field.id].label).to.equal("Label");
      expect((descriptor.fields[field.id] as PropertyField).valueClassNames).to.deep.equal(["Stuff.Door"]);
      // Fork carries the override for the matched class.
      expect(descriptor.fields[fork].label).to.equal("Window Height");
      expect((descriptor.fields[fork] as PropertyField).valueClassNames).to.deep.equal(["Stuff.Window"]);
    });

    it("leaves a field untouched when the rule class matches none of its value classes", async () => {
      const field = propertyField({
        sourceClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const descriptor = createDescriptor([field]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: {
          class: { schemaName: "Stuff", className: "Window" },
          propertyOverrides: [{ name: "Height", labelOverride: "H" }],
        },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(Object.keys(descriptor.fields)).to.have.length(1);
      expect(descriptor.fields[field.id].label).to.equal("Label");
    });

    it("resolves repeat specs targeting the same forked subset to the same fork", async () => {
      const field = propertyField({
        sourceClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door", "Stuff.Window"],
      });
      const descriptor = createDescriptor([field]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: {
          class: { schemaName: "Stuff", className: "Window" },
          propertyOverrides: [
            { name: "Height", labelOverride: "First" },
            { name: "Height", isReadOnly: true },
          ],
        },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess({
          derivesFrom: { "Stuff.Door": ["Stuff.Thing"], "Stuff.Window": ["Stuff.Thing"] },
        }),
      });
      const fork = forkedId({ sourceClassName: "Stuff.Thing", propertyName: "Height", subset: ["Stuff.Window"] });
      expect(Object.keys(descriptor.fields)).to.have.members([field.id, fork]);
      expect(descriptor.fields[fork].label).to.equal("First");
      expect((descriptor.fields[fork] as PropertyField).readOnly).to.equal(true);
    });
  });

  describe("property specification mapping", () => {
    const run = async (spec: PresentationRules.PropertySpecification) => {
      const field = propertyField({
        sourceClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const descriptor = createDescriptor([field]);
      const transformer = createDescriptorTransformerFromContentModifierRule({ rule: { propertyOverrides: [spec] } });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      return descriptor.fields[field.id] as PropertyField;
    };

    it("maps labelOverride", async () => {
      expect((await run({ name: "Height", labelOverride: "New" })).label).to.equal("New");
    });

    it("maps a string categoryId", async () => {
      expect((await run({ name: "Height", categoryId: "Cat" })).categoryId).to.equal("Cat");
    });

    it("maps an Id categoryId", async () => {
      expect((await run({ name: "Height", categoryId: { type: "Id", categoryId: "Cat" } })).categoryId).to.equal("Cat");
    });

    it("ignores a categoryId that cannot be mapped", async () => {
      expect((await run({ name: "Height", categoryId: { type: "None" } })).categoryId).to.be.undefined;
    });

    it("maps isReadOnly", async () => {
      expect((await run({ name: "Height", isReadOnly: true })).readOnly).to.equal(true);
    });

    it("applies to all candidates with a wildcard name", async () => {
      const a = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "A", valueClassNames: ["Stuff.Door"] });
      const b = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "B", valueClassNames: ["Stuff.Door"] });
      const descriptor = createDescriptor([a, b]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: { propertyOverrides: [{ name: "*", labelOverride: "W" }] },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(descriptor.fields[a.id].label).to.equal("W");
      expect(descriptor.fields[b.id].label).to.equal("W");
    });

    it("skips fields whose property name does not match", async () => {
      const a = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "A", valueClassNames: ["Stuff.Door"] });
      const b = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "B", valueClassNames: ["Stuff.Door"] });
      const descriptor = createDescriptor([a, b]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: { propertyOverrides: [{ name: "A", labelOverride: "X" }] },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(descriptor.fields[a.id].label).to.equal("X");
      expect(descriptor.fields[b.id].label).to.equal("Label");
    });

    describe("isDisplayed", () => {
      it("hides on isDisplayed false", async () => {
        expect((await run({ name: "Height", isDisplayed: false })).hidden).to.equal(true);
      });

      it("shows on isDisplayed true", async () => {
        const field = propertyField({
          sourceClassName: "Stuff.Thing",
          propertyName: "Height",
          valueClassNames: ["Stuff.Door"],
          label: "L",
          hidden: true,
        });
        const descriptor = createDescriptor([field]);
        const transformer = createDescriptorTransformerFromContentModifierRule({
          rule: { propertyOverrides: [{ name: "Height", isDisplayed: true }] },
        });
        await transformer.transform({
          descriptor: createTransformableDescriptor(descriptor),
          imodelAccess: createImodelAccess(),
        });
        expect(descriptor.fields[field.id].hidden).to.equal(false);
      });

      it("ignores a string ECExpression isDisplayed", async () => {
        expect((await run({ name: "Height", isDisplayed: "someExpr" })).hidden).to.be.undefined;
      });

      it("hides other candidates when a property is displayed", async () => {
        const a = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "A", valueClassNames: ["Stuff.Door"] });
        const b = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "B", valueClassNames: ["Stuff.Door"] });
        const descriptor = createDescriptor([a, b]);
        const transformer = createDescriptorTransformerFromContentModifierRule({
          rule: { propertyOverrides: [{ name: "A", isDisplayed: true }] },
        });
        await transformer.transform({
          descriptor: createTransformableDescriptor(descriptor),
          imodelAccess: createImodelAccess(),
        });
        expect(descriptor.fields[a.id].hidden).to.equal(false);
        expect(descriptor.fields[b.id].hidden).to.equal(true);
      });

      it("keeps both properties visible when two overrides each set isDisplayed true", async () => {
        const a = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "A", valueClassNames: ["Stuff.Door"] });
        const b = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "B", valueClassNames: ["Stuff.Door"] });
        const c = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "C", valueClassNames: ["Stuff.Door"] });
        const descriptor = createDescriptor([a, b, c]);
        const transformer = createDescriptorTransformerFromContentModifierRule({
          rule: {
            propertyOverrides: [
              { name: "A", isDisplayed: true },
              { name: "B", isDisplayed: true },
            ],
          },
        });
        await transformer.transform({
          descriptor: createTransformableDescriptor(descriptor),
          imodelAccess: createImodelAccess(),
        });
        // Both explicitly-displayed properties stay visible; only the non-targeted `C` is hidden.
        expect(descriptor.fields[a.id].hidden).to.equal(false);
        expect(descriptor.fields[b.id].hidden).to.equal(false);
        expect(descriptor.fields[c.id].hidden).to.equal(true);
      });

      it("hides nothing when a wildcard override sets isDisplayed true", async () => {
        const a = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "A", valueClassNames: ["Stuff.Door"] });
        const b = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "B", valueClassNames: ["Stuff.Door"] });
        const descriptor = createDescriptor([a, b]);
        const transformer = createDescriptorTransformerFromContentModifierRule({
          rule: { propertyOverrides: [{ name: "*", isDisplayed: true }] },
        });
        await transformer.transform({
          descriptor: createTransformableDescriptor(descriptor),
          imodelAccess: createImodelAccess(),
        });
        expect(descriptor.fields[a.id].hidden).to.equal(false);
        expect(descriptor.fields[b.id].hidden).to.equal(false);
      });

      it("does not hide other candidates when doNotHideOtherPropertiesOnDisplayOverride is set", async () => {
        const a = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "A", valueClassNames: ["Stuff.Door"] });
        const b = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "B", valueClassNames: ["Stuff.Door"] });
        const descriptor = createDescriptor([a, b]);
        const transformer = createDescriptorTransformerFromContentModifierRule({
          rule: {
            propertyOverrides: [{ name: "A", isDisplayed: true, doNotHideOtherPropertiesOnDisplayOverride: true }],
          },
        });
        await transformer.transform({
          descriptor: createTransformableDescriptor(descriptor),
          imodelAccess: createImodelAccess(),
        });
        expect(descriptor.fields[b.id].hidden).to.be.undefined;
      });

      it("does not hide a sibling for a class the rule does not target", async () => {
        // `A` is displayed for Window only; sibling `B` supplies only Door, which the rule doesn't target.
        const a = propertyField({
          sourceClassName: "Stuff.Thing",
          propertyName: "A",
          valueClassNames: ["Stuff.Door", "Stuff.Window"],
        });
        const b = propertyField({ sourceClassName: "Stuff.Thing", propertyName: "B", valueClassNames: ["Stuff.Door"] });
        const descriptor = createDescriptor([a, b]);
        const transformer = createDescriptorTransformerFromContentModifierRule({
          rule: {
            class: { schemaName: "Stuff", className: "Window" },
            propertyOverrides: [{ name: "A", isDisplayed: true }],
          },
        });
        await transformer.transform({
          descriptor: createTransformableDescriptor(descriptor),
          imodelAccess: createImodelAccess({
            derivesFrom: { "Stuff.Door": ["Stuff.Thing"], "Stuff.Window": ["Stuff.Thing"] },
          }),
        });
        // `B` (Door only) is never hidden because Door doesn't match the Window-scoped rule.
        expect(descriptor.fields[b.id].hidden).to.be.undefined;
      });
    });
  });

  describe("candidate selection", () => {
    it("ignores non-property (calculated) fields", async () => {
      const calc = calculatedField("calc_0");
      const descriptor = createDescriptor([calc]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: { propertyOverrides: [{ name: "*", labelOverride: "X" }] },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(descriptor.fields.calc_0.label).to.equal("Calc");
    });

    it("skips related fields when applyOnNestedContent is not set", async () => {
      const related = propertyField({
        sourceClassName: "Stuff.Related",
        propertyName: "Name",
        valueClassNames: ["Stuff.Related"],
        pathFromTarget: [
          {
            sourceClassName: "Stuff.Thing",
            relationshipName: "Stuff.ThingHasRelated",
            targetClassName: "Stuff.Related",
            relationshipReverse: false,
          },
        ],
      });
      const descriptor = createDescriptor([related]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: { propertyOverrides: [{ name: "Name", labelOverride: "X" }] },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(descriptor.fields[related.id].label).to.equal("Label");
    });

    it("includes related fields when applyOnNestedContent is true", async () => {
      const path: PropertyField["pathFromTarget"] = [
        {
          sourceClassName: "Stuff.Thing",
          relationshipName: "Stuff.ThingHasRelated",
          targetClassName: "Stuff.Related",
          relationshipReverse: false,
        },
      ];
      const related = propertyField({
        sourceClassName: "Stuff.Related",
        propertyName: "Name",
        valueClassNames: ["Stuff.Related"],
        pathFromTarget: path,
      });
      const descriptor = createDescriptor([related]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: { applyOnNestedContent: true, propertyOverrides: [{ name: "Name", labelOverride: "X" }] },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(descriptor.fields[related.id].label).to.equal("X");
    });
  });

  describe("categories", () => {
    it("merges referenced property categories into the descriptor", async () => {
      const field = propertyField({
        sourceClassName: "Stuff.Thing",
        propertyName: "Height",
        valueClassNames: ["Stuff.Door"],
      });
      const descriptor = createDescriptor([field]);
      const transformer = createDescriptorTransformerFromContentModifierRule({
        rule: {
          propertyCategories: [{ id: "Cat", label: "Category" }],
          propertyOverrides: [{ name: "Height", categoryId: "Cat" }],
        },
      });
      await transformer.transform({
        descriptor: createTransformableDescriptor(descriptor),
        imodelAccess: createImodelAccess(),
      });
      expect(descriptor.categories.Cat).to.deep.include({ id: "Cat", label: "Category" });
      expect(descriptor.fields[field.id].categoryId).to.equal("Cat");
    });
  });
});
