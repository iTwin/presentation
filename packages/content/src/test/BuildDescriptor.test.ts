/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { buildContentDescriptor } from "../content/BuildDescriptor.js";

import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentSource } from "../content/ContentTarget.js";

const schemaAccess = {} as ECSchemaProvider & ECClassHierarchyInspector;

function createSource(primaryClass: ContentSource["target"]["primaryClass"]): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses: [primaryClass], resolvedDeclarations: [] };
}

describe("buildContentDescriptor", () => {
  it("returns a descriptor carrying the given sources", async () => {
    const sources = [createSource("Schema.A"), createSource("Schema.B")];
    const descriptor = await buildContentDescriptor({ imodelAccess: schemaAccess, sources });
    expect(descriptor.sources).to.equal(sources);
  });
});
