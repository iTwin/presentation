/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createContentProvider, resolveContentSources } from "../content/Content.js";
import { createEntityClass, createPrimitiveProperty, createSchemaAccess } from "./MetadataStubs.js";

import type { EC, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { ContentSource } from "../content/ContentTarget.js";
import type { PropertyField } from "../content/model/Field.js";

const imodelAccess = { ...createSchemaAccess([createEntityClass({ fullName: "Schema.A" })]) } as ReturnType<
  typeof createSchemaAccess
> &
  ECSqlQueryExecutor;

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

  it("includes subclass fields for a provider-free polymorphic target", async () => {
    const derivedClasses: EC.Class[] = [];
    const element = createEntityClass({ fullName: "Schema.Element", derivedClasses });
    const pump = createEntityClass({
      fullName: "Schema.Pump",
      baseClass: element,
      ownProperties: [createPrimitiveProperty({ name: "FlowRate", declaringClass: "Schema.Pump" })],
    });
    derivedClasses.push(pump);
    const polymorphicIModelAccess = {
      ...createSchemaAccess([element, pump]),
      createQueryReader: () =>
        (async function* () {
          yield { 0: "Schema.Pump" };
        })(),
    };

    const sources = await resolveContentSources({
      imodelAccess: polymorphicIModelAccess,
      targets: [{ primaryClass: element.fullName }],
    });
    const descriptor = await createContentProvider({
      imodelAccess: polymorphicIModelAccess,
      sources,
    }).getContentDescriptor();

    expect(sources[0].resolvedPrimaryClasses).to.deep.equal(["Schema.Pump"]);
    expect((descriptor.fields["Schema.Pump.FlowRate"] as PropertyField).valueClassNames).to.deep.equal(["Schema.Pump"]);
  });
});
