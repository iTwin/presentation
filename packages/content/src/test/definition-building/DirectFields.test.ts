/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectDirectPropertyFields } from "../../content/definition-building/DirectFields.js";
import { mergePropertyFieldsByIdentity } from "../../content/definition-building/PropertyFieldMerge.js";
import { createEntityClass, createMixinClass, createPrimitiveProperty, createSchemaAccess } from "../MetadataStubs.js";

import type { EC } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { PropertyField } from "../../content/model/Field.js";

function createSource(props: {
  primaryClass: EC.FullClassNameDotNotation;
  resolvedPrimaryClasses?: EC.FullClassNameDotNotation[];
}): ContentSource {
  return {
    target: { primaryClass: props.primaryClass },
    resolvedPrimaryClasses: props.resolvedPrimaryClasses ?? [props.primaryClass],
    resolvedDeclarations: [],
    resolvedExternalInputs: [],
  };
}

/** Calls the enumerator, merges the candidates like the content pipeline does, and unwraps them to fields. */
async function enumerate(props: Parameters<typeof collectDirectPropertyFields>[0]): Promise<PropertyField[]> {
  return mergePropertyFieldsByIdentity(await collectDirectPropertyFields(props)).map(({ field }) => field);
}

describe("collectDirectPropertyFields", () => {
  it("enumerates the primary class properties as direct fields (empty path)", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Element",
        properties: [createPrimitiveProperty({ name: "CodeValue", declaringClass: "TestSchema.Element" })],
      }),
    ]);

    const fields = await enumerate({
      imodelAccess,
      source: createSource({ primaryClass: "TestSchema.Element", resolvedPrimaryClasses: ["TestSchema.Element"] }),
    });

    expect(fields).to.deep.equal([
      {
        kind: "property",
        id: "TestSchema.Element.CodeValue",
        label: "CodeValue",
        type: { kind: "primitive", type: "String" },
        propertyClassName: "TestSchema.Element",
        propertyName: "CodeValue",
        pathFromTarget: [],
        valueClassNames: ["TestSchema.Element"],
        primaryClassNames: ["TestSchema.Element"],
        pathCardinality: "one",
      },
    ]);
  });

  it("uses the source's resolved primary classes as value classes", async () => {
    const codeValue = createPrimitiveProperty({ name: "CodeValue", declaringClass: "TestSchema.Element" });
    const element = createEntityClass({ fullName: "TestSchema.Element", properties: [codeValue] });
    const imodelAccess = createSchemaAccess([
      element,
      createEntityClass({ fullName: "TestSchema.Door", baseClass: element, properties: [codeValue] }),
      createEntityClass({ fullName: "TestSchema.Window", baseClass: element, properties: [codeValue] }),
    ]);

    const [field] = await enumerate({
      imodelAccess,
      source: createSource({
        primaryClass: "TestSchema.Element",
        resolvedPrimaryClasses: ["TestSchema.Door", "TestSchema.Window"],
      }),
    });

    expect(field.valueClassNames).to.deep.equal(["TestSchema.Door", "TestSchema.Window"]);
    expect(field.primaryClassNames).to.deep.equal(field.valueClassNames);
  });

  it("falls back to the normalized primary class when no primary classes were resolved", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Element",
        properties: [createPrimitiveProperty({ name: "CodeValue", declaringClass: "TestSchema.Element" })],
      }),
    ]);

    const [field] = await enumerate({
      imodelAccess,
      source: createSource({ primaryClass: "TestSchema.Element", resolvedPrimaryClasses: [] }),
    });

    expect(field.valueClassNames).to.deep.equal(["TestSchema.Element"]);
  });

  it("enumerates subclass-specific properties for a polymorphic target", async () => {
    const codeValue = createPrimitiveProperty({ name: "CodeValue", declaringClass: "TestSchema.Element" });
    const element = createEntityClass({ fullName: "TestSchema.Element", properties: [codeValue] });
    const pump = createEntityClass({
      fullName: "TestSchema.Pump",
      baseClass: element,
      properties: [codeValue, createPrimitiveProperty({ name: "FlowRate", declaringClass: "TestSchema.Pump" })],
    });
    const valve = createEntityClass({
      fullName: "TestSchema.Valve",
      baseClass: element,
      properties: [codeValue, createPrimitiveProperty({ name: "Diameter", declaringClass: "TestSchema.Valve" })],
    });
    const imodelAccess = createSchemaAccess([element, pump, valve]);

    const fields = await enumerate({
      imodelAccess,
      source: createSource({
        primaryClass: "TestSchema.Element",
        resolvedPrimaryClasses: ["TestSchema.Pump", "TestSchema.Valve"],
      }),
    });

    const byName = new Map(fields.map((field) => [field.propertyName, field]));
    // The inherited property is attributed to its declaring class and carries all concretes.
    expect(byName.get("CodeValue")?.propertyClassName).to.equal("TestSchema.Element");
    expect(byName.get("CodeValue")?.valueClassNames).to.deep.equal(["TestSchema.Pump", "TestSchema.Valve"]);
    // Each subclass-declared property is attributed to just its own concrete class.
    expect(byName.get("FlowRate")?.valueClassNames).to.deep.equal(["TestSchema.Pump"]);
    expect(byName.get("Diameter")?.valueClassNames).to.deep.equal(["TestSchema.Valve"]);
  });

  it("attributes a redeclared property to the most derived declaration only", async () => {
    const baseDescription = createPrimitiveProperty({ name: "Description", declaringClass: "TestSchema.Base" });
    const midDescription = createPrimitiveProperty({ name: "Description", declaringClass: "TestSchema.Mid" });
    const base = createEntityClass({ fullName: "TestSchema.Base", properties: [baseDescription] });
    const mid = createEntityClass({ fullName: "TestSchema.Mid", baseClass: base, properties: [midDescription] });
    const leaf = createEntityClass({ fullName: "TestSchema.Leaf", baseClass: mid, properties: [midDescription] });

    const fields = await enumerate({
      imodelAccess: createSchemaAccess([base, mid, leaf]),
      source: createSource({ primaryClass: leaf.fullName, resolvedPrimaryClasses: [leaf.fullName] }),
    });

    expect(fields.map((field) => field.id)).to.deep.equal(["TestSchema.Mid.Description"]);
  });

  it("keeps a base declaration only for concretes that do not redeclare the property", async () => {
    const baseDescription = createPrimitiveProperty({ name: "Description", declaringClass: "TestSchema.Base" });
    const pumpDescription = createPrimitiveProperty({ name: "Description", declaringClass: "TestSchema.Pump" });
    const base = createEntityClass({ fullName: "TestSchema.Base", properties: [baseDescription] });
    const pump = createEntityClass({ fullName: "TestSchema.Pump", baseClass: base, properties: [pumpDescription] });
    const valve = createEntityClass({ fullName: "TestSchema.Valve", baseClass: base, properties: [baseDescription] });

    const fields = await enumerate({
      imodelAccess: createSchemaAccess([base, pump, valve]),
      source: createSource({ primaryClass: base.fullName, resolvedPrimaryClasses: [pump.fullName, valve.fullName] }),
    });

    const byId = new Map(fields.map((field) => [field.id, field]));
    expect([...byId.keys()]).to.have.members(["TestSchema.Base.Description", "TestSchema.Pump.Description"]);
    expect(byId.get("TestSchema.Base.Description")?.valueClassNames).to.deep.equal(["TestSchema.Valve"]);
    expect(byId.get("TestSchema.Pump.Description")?.valueClassNames).to.deep.equal(["TestSchema.Pump"]);
  });

  it("enumerates properties from a mixin applied to a leaf class", async () => {
    const mixin = createMixinClass({
      fullName: "TestSchema.HasCode",
      properties: [createPrimitiveProperty({ name: "Code", declaringClass: "TestSchema.HasCode" })],
    });
    const element = createEntityClass({
      fullName: "TestSchema.Element",
      properties: [
        createPrimitiveProperty({ name: "Code", declaringClass: mixin }),
        createPrimitiveProperty({ name: "Label", declaringClass: "TestSchema.Element" }),
      ],
      mixins: [mixin],
    });

    const fields = await enumerate({
      imodelAccess: createSchemaAccess([element, mixin]),
      source: createSource({ primaryClass: element.fullName, resolvedPrimaryClasses: [element.fullName] }),
    });

    expect(fields.map((field) => field.propertyName)).to.have.members(["Label", "Code"]);
    expect(fields.find((field) => field.propertyName === "Code")).to.include({
      propertyClassName: "TestSchema.HasCode",
    });
    expect(fields.find((field) => field.propertyName === "Code")?.valueClassNames).to.deep.equal([
      "TestSchema.Element",
    ]);
  });

  it("attributes shared and concrete-specific mixin properties to the applicable concrete classes", async () => {
    const sharedMixin = createMixinClass({
      fullName: "TestSchema.HasCode",
      properties: [createPrimitiveProperty({ name: "Code", declaringClass: "TestSchema.HasCode" })],
    });
    const pumpMixin = createMixinClass({
      fullName: "TestSchema.HasFlowRate",
      properties: [createPrimitiveProperty({ name: "FlowRate", declaringClass: "TestSchema.HasFlowRate" })],
      baseClass: sharedMixin,
    });
    const code = createPrimitiveProperty({ name: "Code", declaringClass: sharedMixin });
    const flowRate = createPrimitiveProperty({ name: "FlowRate", declaringClass: pumpMixin });
    const element = createEntityClass({ fullName: "TestSchema.Element", mixins: [sharedMixin], properties: [code] });
    const pump = createEntityClass({
      fullName: "TestSchema.Pump",
      baseClass: element,
      mixins: [pumpMixin],
      properties: [code, flowRate],
    });
    const valve = createEntityClass({ fullName: "TestSchema.Valve", baseClass: element, properties: [code] });

    const fields = await enumerate({
      imodelAccess: createSchemaAccess([element, pump, valve, sharedMixin, pumpMixin]),
      source: createSource({ primaryClass: element.fullName, resolvedPrimaryClasses: [pump.fullName, valve.fullName] }),
    });

    const byName = new Map(fields.map((field) => [field.propertyName, field]));
    expect(byName.get("Code")?.valueClassNames).to.deep.equal(["TestSchema.Pump", "TestSchema.Valve"]);
    expect(byName.get("FlowRate")?.valueClassNames).to.deep.equal(["TestSchema.Pump"]);
  });

  it("reports each direct field's category facts with a `none` anchor", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Element",
        properties: [
          createPrimitiveProperty({
            name: "CodeValue",
            declaringClass: "TestSchema.Element",
            category: { fullName: "TestSchema.Identity", label: "Identity" },
          }),
        ],
      }),
    ]);

    const [{ categorization }] = await collectDirectPropertyFields({
      imodelAccess,
      source: createSource({ primaryClass: "TestSchema.Element", resolvedPrimaryClasses: ["TestSchema.Element"] }),
    });

    expect(categorization).to.deep.equal({
      anchor: "none",
      category: { source: "schema", id: "TestSchema.Identity", label: "Identity" },
    });
  });
});
