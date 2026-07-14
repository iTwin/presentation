/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectDirectPropertyFields } from "../../content/descriptor-building/DirectFields.js";
import { createEntityClass, createPrimitiveProperty, createSchemaAccess } from "../MetadataStubs.js";

import type { EC } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { PropertyField } from "../../content/model/Field.js";

function createSource(props: {
  primaryClass: EC.FullClassName;
  resolvedPrimaryClasses?: EC.FullClassName[];
}): ContentSource {
  return {
    target: { primaryClass: props.primaryClass },
    resolvedPrimaryClasses: props.resolvedPrimaryClasses ?? [props.primaryClass],
    resolvedDeclarations: [],
  };
}

/** Calls the enumerator and unwraps the merge candidates to their fields. */
async function enumerate(props: Parameters<typeof collectDirectPropertyFields>[0]): Promise<PropertyField[]> {
  return (await collectDirectPropertyFields(props)).map((candidate) => candidate.field);
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
      source: createSource({ primaryClass: "TestSchema:Element", resolvedPrimaryClasses: [] }),
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
});
