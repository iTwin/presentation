/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectDirectPropertyFields } from "../../content/descriptor-building/DirectFields.js";
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
  };
}

/** Calls the enumerator and unwraps the candidates to their fields. */
async function enumerate(props: Parameters<typeof collectDirectPropertyFields>[0]): Promise<PropertyField[]> {
  return (await collectDirectPropertyFields(props)).map(({ field }) => field);
}

describe("collectDirectPropertyFields", () => {
  it("enumerates the primary class properties as direct fields (empty path)", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Element",
        properties: [createPrimitiveProperty({ name: "CodeValue", declaringClassName: "TestSchema.Element" })],
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
        selectorId: "TestSchema.Element.CodeValue",
        label: "CodeValue",
        type: { kind: "primitive", type: "String" },
        propertyClassName: "TestSchema.Element",
        propertyName: "CodeValue",
        pathFromTarget: [],
        valueClassNames: ["TestSchema.Element"],
      },
    ]);
  });

  it("uses the source's resolved primary classes as value classes", async () => {
    const element = createEntityClass({
      fullName: "TestSchema.Element",
      properties: [createPrimitiveProperty({ name: "CodeValue", declaringClassName: "TestSchema.Element" })],
      ownProperties: [createPrimitiveProperty({ name: "CodeValue", declaringClassName: "TestSchema.Element" })],
    });
    const imodelAccess = createSchemaAccess([
      element,
      createEntityClass({ fullName: "TestSchema.Door", baseClass: element }),
      createEntityClass({ fullName: "TestSchema.Window", baseClass: element }),
    ]);

    const [field] = await enumerate({
      imodelAccess,
      source: createSource({
        primaryClass: "TestSchema.Element",
        resolvedPrimaryClasses: ["TestSchema.Door", "TestSchema.Window"],
      }),
    });

    expect(field.valueClassNames).to.deep.equal(["TestSchema.Door", "TestSchema.Window"]);
  });

  it("falls back to the normalized primary class when no primary classes were resolved", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Element",
        properties: [createPrimitiveProperty({ name: "CodeValue", declaringClassName: "TestSchema.Element" })],
      }),
    ]);

    const [field] = await enumerate({
      imodelAccess,
      source: createSource({ primaryClass: "TestSchema.Element", resolvedPrimaryClasses: [] }),
    });

    expect(field.valueClassNames).to.deep.equal(["TestSchema.Element"]);
  });

  it("enumerates subclass-specific properties for a polymorphic target", async () => {
    const element = createEntityClass({
      fullName: "TestSchema.Element",
      ownProperties: [createPrimitiveProperty({ name: "CodeValue", declaringClassName: "TestSchema.Element" })],
    });
    const pump = createEntityClass({
      fullName: "TestSchema.Pump",
      baseClass: element,
      ownProperties: [createPrimitiveProperty({ name: "FlowRate", declaringClassName: "TestSchema.Pump" })],
    });
    const valve = createEntityClass({
      fullName: "TestSchema.Valve",
      baseClass: element,
      ownProperties: [createPrimitiveProperty({ name: "Diameter", declaringClassName: "TestSchema.Valve" })],
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

  it("enumerates properties from a mixin applied to a leaf class", async () => {
    const mixin = createMixinClass({
      fullName: "TestSchema.HasCode",
      ownProperties: [createPrimitiveProperty({ name: "Code", declaringClassName: "TestSchema.HasCode" })],
    });
    const element = createEntityClass({
      fullName: "TestSchema.Element",
      ownProperties: [createPrimitiveProperty({ name: "Label", declaringClassName: "TestSchema.Element" })],
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
      ownProperties: [createPrimitiveProperty({ name: "Code", declaringClassName: "TestSchema.HasCode" })],
    });
    const pumpMixin = createMixinClass({
      fullName: "TestSchema.HasFlowRate",
      ownProperties: [createPrimitiveProperty({ name: "FlowRate", declaringClassName: "TestSchema.HasFlowRate" })],
      baseClass: sharedMixin,
    });
    const element = createEntityClass({ fullName: "TestSchema.Element", mixins: [sharedMixin] });
    const pump = createEntityClass({ fullName: "TestSchema.Pump", baseClass: element, mixins: [pumpMixin] });
    const valve = createEntityClass({ fullName: "TestSchema.Valve", baseClass: element });

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
        ownProperties: [
          createPrimitiveProperty({
            name: "CodeValue",
            declaringClassName: "TestSchema.Element",
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
