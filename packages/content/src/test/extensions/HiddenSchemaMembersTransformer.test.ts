/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createTransformableDescriptor } from "../../content/extensions/DescriptorTransformer.js";
import {
  createHiddenSchemaMembersDescriptorTransformer,
  DEFAULT_HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY,
} from "../../content/extensions/HiddenSchemaMembersTransformer.js";
import { PropertyField } from "../../content/model/Field.js";
import { toSortedUniqueClassNames } from "../../content/model/Utils.js";
import { createEntityClass, createMixinClass, createPrimitiveProperty, createSchemaAccess } from "../MetadataStubs.js";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { CalculatedField, ExternalField, Field } from "../../content/model/Field.js";

function propertyField(props: {
  sourceClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  valueClassNames: EC.FullClassNameDotNotation[];
  pathFromTarget?: PropertyField["pathFromTarget"];
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
    label: "Label",
    type: { kind: "primitive", type: "String" },
    propertyClassName: props.sourceClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: toSortedUniqueClassNames(props.valueClassNames),
    primaryClassNames: props.pathFromTarget
      ? [props.pathFromTarget[0].sourceClassName]
      : toSortedUniqueClassNames(props.valueClassNames),
    hidden: props.hidden,
  };
}

function calculatedField(id: string): CalculatedField {
  return {
    kind: "calculated",
    id,
    selectorId: id,
    label: "Calc",
    type: { kind: "primitive", type: "String" },
    expression: "1+1",
  };
}

function externalField(id: string): ExternalField {
  return {
    kind: "external",
    id,
    label: "External",
    type: { kind: "primitive", type: "String" },
    providerId: "provider_v1",
  };
}

function createDescriptor(fields: Field[]): ContentDescriptor {
  return { sources: [], categories: {}, selectors: {}, fields: Object.fromEntries(fields.map((f) => [f.id, f])) };
}

describe("createHiddenSchemaMembersDescriptorTransformer", () => {
  it("defaults to DEFAULT_HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY", () => {
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    expect(transformer.priority).to.equal(DEFAULT_HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY);
    expect(DEFAULT_HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY).to.equal(500);
  });

  it("accepts a priority override", () => {
    const transformer = createHiddenSchemaMembersDescriptorTransformer({ priority: 42 });
    expect(transformer.priority).to.equal(42);
  });

  it("hides a field whose property itself is hidden", async () => {
    const imodelAccess: ECSchemaProvider = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Thing",
        properties: [createPrimitiveProperty({ name: "Height", declaringClass: "TestSchema.Thing", isHidden: true })],
      }),
    ]);
    const field = propertyField({
      sourceClassName: "TestSchema.Thing",
      propertyName: "Height",
      valueClassNames: ["TestSchema.Thing"],
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[field.id].hidden).to.equal(true);
  });

  it("hides a field whose property is declared by a hidden class", async () => {
    const thingProperties: EC.Property[] = [];
    const thing = createEntityClass({ fullName: "TestSchema.Thing", isHidden: true, properties: thingProperties });
    thingProperties.push(createPrimitiveProperty({ name: "Height", declaringClass: thing }));
    const imodelAccess: ECSchemaProvider = createSchemaAccess([thing]);
    const field = propertyField({
      sourceClassName: "TestSchema.Thing",
      propertyName: "Height",
      valueClassNames: ["TestSchema.Thing"],
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[field.id].hidden).to.equal(true);
  });

  it("hides a field whose property's declaring class has a hidden base class", async () => {
    const base = createEntityClass({ fullName: "TestSchema.Base", isHidden: true, properties: [] });
    const derivedProperties: EC.Property[] = [];
    const derived = createEntityClass({
      fullName: "TestSchema.Derived",
      baseClass: base,
      properties: derivedProperties,
    });
    derivedProperties.push(createPrimitiveProperty({ name: "Height", declaringClass: derived }));
    const imodelAccess: ECSchemaProvider = createSchemaAccess([base, derived]);
    const field = propertyField({
      sourceClassName: "TestSchema.Derived",
      propertyName: "Height",
      valueClassNames: ["TestSchema.Derived"],
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[field.id].hidden).to.equal(true);
  });

  it("keeps a field visible when no class in its declaring hierarchy is hidden", async () => {
    const base = createEntityClass({ fullName: "TestSchema.Base", properties: [] });
    const middle = createEntityClass({ fullName: "TestSchema.Middle", baseClass: base, properties: [] });
    const derivedProperties: EC.Property[] = [];
    const derived = createEntityClass({
      fullName: "TestSchema.Derived",
      baseClass: middle,
      properties: derivedProperties,
    });
    derivedProperties.push(createPrimitiveProperty({ name: "Height", declaringClass: derived }));
    const imodelAccess: ECSchemaProvider = createSchemaAccess([base, middle, derived]);
    const field = propertyField({
      sourceClassName: "TestSchema.Derived",
      propertyName: "Height",
      valueClassNames: ["TestSchema.Derived"],
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();

    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });

    expect(descriptor.fields[field.id].hidden).to.be.undefined;
  });

  it("stops the base-class walk at the first explicit isHidden===false, leaving the field visible", async () => {
    // Base (hidden) <- Middle (explicitly visible) <- Derived (undefined visibility, own property).
    // The walk must stop at Middle's explicit `false` and never reach Base's `true`.
    const base = createEntityClass({ fullName: "TestSchema.Base", isHidden: true, properties: [] });
    const middle = createEntityClass({
      fullName: "TestSchema.Middle",
      isHidden: false,
      baseClass: base,
      properties: [],
    });
    const derivedProperties: EC.Property[] = [];
    const derived = createEntityClass({
      fullName: "TestSchema.Derived",
      baseClass: middle,
      properties: derivedProperties,
    });
    derivedProperties.push(createPrimitiveProperty({ name: "Height", declaringClass: derived }));
    const imodelAccess: ECSchemaProvider = createSchemaAccess([base, middle, derived]);
    const field = propertyField({
      sourceClassName: "TestSchema.Derived",
      propertyName: "Height",
      valueClassNames: ["TestSchema.Derived"],
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[field.id].hidden).to.be.undefined;
  });

  it("keeps a property inherited from a visible base class visible even when the field's valueClassNames contains a hidden subclass", async () => {
    const baseProperties: EC.Property[] = [];
    const base = createEntityClass({ fullName: "TestSchema.Base", isHidden: false, properties: baseProperties });
    baseProperties.push(createPrimitiveProperty({ name: "Height", declaringClass: base }));
    // Sub is hidden, and is the field's value-supplier class — but that must not be inspected.
    const sub = createEntityClass({ fullName: "TestSchema.Sub", isHidden: true, baseClass: base, properties: [] });
    const imodelAccess: ECSchemaProvider = createSchemaAccess([base, sub]);
    const field = propertyField({
      sourceClassName: "TestSchema.Base",
      propertyName: "Height",
      valueClassNames: ["TestSchema.Sub"],
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[field.id].hidden).to.be.undefined;
    expect(field.valueClassNames).to.deep.equal(["TestSchema.Sub"]);
  });

  it("hides a field whose property is declared by a hidden mixin", async () => {
    const mixinProperties: EC.Property[] = [];
    const mixin = createMixinClass({
      fullName: "TestSchema.HiddenMixin",
      isHidden: true,
      ownProperties: mixinProperties,
    });
    mixinProperties.push(createPrimitiveProperty({ name: "MixinProp", declaringClass: mixin }));
    // Widget implements the mixin, but is itself visible — the implementing class's own visibility
    // and the mixins applied to it are not consulted; only the mixin (the property's declaring
    // class) matters.
    const widget = createEntityClass({
      fullName: "TestSchema.Widget",
      isHidden: false,
      mixins: [mixin],
      properties: [],
    });
    const imodelAccess: ECSchemaProvider = createSchemaAccess([mixin, widget]);
    const field = propertyField({
      sourceClassName: "TestSchema.HiddenMixin",
      propertyName: "MixinProp",
      valueClassNames: ["TestSchema.Widget"],
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[field.id].hidden).to.equal(true);
  });

  it("applies the identical property-origin rule to direct and related property fields", async () => {
    const imodelAccess: ECSchemaProvider = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Aspect",
        properties: [
          createPrimitiveProperty({ name: "Identifier", declaringClass: "TestSchema.Aspect", isHidden: true }),
        ],
      }),
    ]);
    const directField = propertyField({
      sourceClassName: "TestSchema.Aspect",
      propertyName: "Identifier",
      valueClassNames: ["TestSchema.Aspect"],
    });
    const relatedField = propertyField({
      sourceClassName: "TestSchema.Aspect",
      propertyName: "Identifier",
      valueClassNames: ["TestSchema.Aspect"],
      pathFromTarget: [
        {
          sourceClassName: "TestSchema.Element",
          targetClassName: "TestSchema.Aspect",
          relationshipName: "TestSchema.ElementOwnsAspect",
        },
      ],
    });
    const descriptor = createDescriptor([directField, relatedField]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[directField.id].hidden).to.equal(true);
    expect(descriptor.fields[relatedField.id].hidden).to.equal(true);
  });

  it("does not touch calculated or external fields", async () => {
    const imodelAccess: ECSchemaProvider = createSchemaAccess([]);
    const calc = calculatedField("calc");
    const ext = externalField("ext");
    const descriptor = createDescriptor([calc, ext]);
    const before = structuredClone(descriptor);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor).to.deep.equal(before);
  });

  it("hides a matching field even when an earlier transformer set hidden === false", async () => {
    const imodelAccess: ECSchemaProvider = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Thing",
        properties: [createPrimitiveProperty({ name: "Height", declaringClass: "TestSchema.Thing", isHidden: true })],
      }),
    ]);
    const field = propertyField({
      sourceClassName: "TestSchema.Thing",
      propertyName: "Height",
      valueClassNames: ["TestSchema.Thing"],
      hidden: false,
    });
    const descriptor = createDescriptor([field]);
    const transformer = createHiddenSchemaMembersDescriptorTransformer();
    await transformer.transform({ descriptor: createTransformableDescriptor(descriptor), imodelAccess });
    expect(descriptor.fields[field.id].hidden).to.equal(true);
  });
});
