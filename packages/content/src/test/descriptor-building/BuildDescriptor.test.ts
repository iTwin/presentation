/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { buildContentDescriptor } from "../../content/descriptor-building/BuildDescriptor.js";
import { createEntityClass, createPrimitiveProperty, createSchemaAccess } from "../MetadataStubs.js";

import type { EC } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { PropertyField } from "../../content/model/Field.js";

function createSource(
  primaryClass: EC.FullClassName,
  resolvedPrimaryClasses: EC.FullClassName[] = [primaryClass],
): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses, resolvedDeclarations: [] };
}

describe("buildContentDescriptor", () => {
  it("carries the sources and enumerates direct property fields", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.A" })],
      }),
    ]);
    const sources = [createSource("TestSchema.A")];

    const descriptor = await buildContentDescriptor({ imodelAccess, sources });

    expect(descriptor.sources).to.equal(sources);
    expect(Object.keys(descriptor.fields)).to.deep.equal(["TestSchema.A.Prop"]);
  });

  it("merges the same direct property across sources, unioning value classes", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Door",
        properties: [createPrimitiveProperty({ name: "UserLabel", declaringClassName: "BisCore.Element" })],
      }),
      createEntityClass({
        fullName: "TestSchema.Window",
        properties: [createPrimitiveProperty({ name: "UserLabel", declaringClassName: "BisCore.Element" })],
      }),
    ]);
    const sources = [createSource("TestSchema.Door"), createSource("TestSchema.Window")];

    const descriptor = await buildContentDescriptor({ imodelAccess, sources });

    expect(Object.keys(descriptor.fields)).to.deep.equal(["BisCore.Element.UserLabel"]);
    const field = descriptor.fields["BisCore.Element.UserLabel"] as PropertyField;
    expect(field.valueClassNames).to.deep.equal(["TestSchema.Door", "TestSchema.Window"]);
  });

  it("returns no fields when the primary class has no properties", async () => {
    const imodelAccess = createSchemaAccess([createEntityClass({ fullName: "TestSchema.Empty" })]);
    const descriptor = await buildContentDescriptor({ imodelAccess, sources: [createSource("TestSchema.Empty")] });
    expect(descriptor.fields).to.deep.equal({});
  });
});
