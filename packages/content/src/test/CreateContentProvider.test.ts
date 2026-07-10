/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createContentProvider } from "../content/Content.js";

import type { ECClassHierarchyInspector, ECSchemaProvider, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { ContentSource } from "../content/ContentTarget.js";

const imodelAccess = {} as ECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector;

function createSource(primaryClass: ContentSource["target"]["primaryClass"]): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses: [primaryClass], resolvedDeclarations: [] };
}

describe("createContentProvider", () => {
  it("builds the descriptor from the configured sources", async () => {
    const sources = [createSource("Schema.A")];
    const provider = createContentProvider({ imodelAccess, sources });
    const descriptor = await provider.getContentDescriptor();
    expect(descriptor.sources).to.equal(sources);
  });

  it("builds the descriptor lazily and caches it across calls", async () => {
    const provider = createContentProvider({ imodelAccess, sources: [createSource("Schema.A")] });
    const first = await provider.getContentDescriptor();
    const second = await provider.getContentDescriptor();
    expect(first).to.equal(second);
  });
});
