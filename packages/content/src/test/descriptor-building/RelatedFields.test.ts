/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createRelatedPropertyFields } from "../../content/descriptor-building/RelatedFields.js";
import { PropertyField } from "../../content/model/Field.js";
import { createEntityClass, createPrimitiveProperty, createSchemaAccess } from "../MetadataStubs.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource, ResolvedPath } from "../../content/ContentTarget.js";
import type {
  IModelFieldsProvider,
  RelatedPropertiesDeclaration,
} from "../../content/extensions/IModelFieldsProvider.js";

const aToB: RelationshipPath[number] = {
  sourceClassName: "TestSchema.A",
  targetClassName: "TestSchema.B",
  relationshipName: "TestSchema.aToB",
};
const bToC: RelationshipPath[number] = {
  sourceClassName: "TestSchema.B",
  targetClassName: "TestSchema.C",
  relationshipName: "TestSchema.bToC",
};

/** Builds a provider whose id is fixed and whose contribution is the given related-properties declarations. */
function createProvider(
  id: IModelFieldsProvider["id"],
  relatedProperties: RelatedPropertiesDeclaration[],
): IModelFieldsProvider {
  return {
    id,
    async getContribution() {
      return { relatedProperties };
    },
  };
}

/** Wires a set of providers into the `(providersById, getContribution)` pair the enumerator expects. */
function wireProviders(providers: IModelFieldsProvider[]) {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const getContribution: Parameters<typeof createRelatedPropertyFields>[0]["getContribution"] = async (
    provider,
    target,
  ) => provider.getContribution({ imodelAccess: createSchemaAccess([]), target });
  return { providersById, getContribution };
}

function createSource(resolvedDeclarations: ContentSource["resolvedDeclarations"]): ContentSource {
  return { target: { primaryClass: "TestSchema.A" }, resolvedPrimaryClasses: ["TestSchema.A"], resolvedDeclarations };
}

function resolvedPath(path: RelationshipPath, targetClassNames: EC.FullClassName[]): ResolvedPath {
  return { path, targetClassNames };
}

/** Calls the enumerator and unwraps the merge candidates to their fields. */
async function enumerate(props: Parameters<typeof createRelatedPropertyFields>[0]): Promise<PropertyField[]> {
  return (await createRelatedPropertyFields(props)).map((candidate) => candidate.field);
}

describe("createRelatedPropertyFields", () => {
  it("returns no fields when the source has no resolved declarations", async () => {
    const imodelAccess = createSchemaAccess([]);
    const fields = await enumerate({ imodelAccess, source: createSource([]), ...wireProviders([]) });
    expect(fields).to.deep.equal([]);
  });

  it("pairs each enumerated field with the contributing provider", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.B" })],
      }),
    ]);
    const provider = createProvider("p1_v1", [{ path: [aToB] }]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    const candidates = await createRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) });

    expect(candidates).to.have.lengthOf(1);
    expect(candidates[0].provider).to.equal(provider);
  });

  it("loads all properties of the final step's target class when the declaration omits `properties`", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.B" })],
      }),
    ]);
    const provider = createProvider("p1_v1", [{ path: [aToB] }]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields).to.have.lengthOf(1);
    expect(fields[0].propertyClassName).to.equal("TestSchema.B");
    expect(fields[0].propertyName).to.equal("Prop");
    expect(fields[0].pathFromTarget).to.deep.equal([aToB]);
    expect(fields[0].valueClassNames).to.deep.equal(["TestSchema.B"]);
    expect(fields[0].id).to.equal(
      PropertyField.computeId({ propertyClassName: "TestSchema.B", propertyName: "Prop", pathFromTarget: [aToB] }),
    );
  });

  it("loads only the target class opted in by a step spec", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.C",
        properties: [
          createPrimitiveProperty({ name: "Keep", declaringClassName: "TestSchema.C" }),
          createPrimitiveProperty({ name: "Drop", declaringClassName: "TestSchema.C" }),
        ],
      }),
    ]);
    const declaration: RelatedPropertiesDeclaration = {
      path: [aToB, bToC],
      properties: [{ stepIndex: 1, target: { select: { include: ["Keep"] } } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB, bToC], ["TestSchema.A"])] },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields.map((f) => f.propertyName)).to.deep.equal(["Keep"]);
    expect(fields[0].pathFromTarget).to.deep.equal([aToB, bToC]);
    expect(fields[0].valueClassNames).to.deep.equal(["TestSchema.C"]);
  });

  it("loads relationship class properties opted in by a step spec", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.aToB",
        properties: [createPrimitiveProperty({ name: "Weight", declaringClassName: "TestSchema.aToB" })],
      }),
    ]);
    const declaration: RelatedPropertiesDeclaration = {
      path: [aToB],
      properties: [{ stepIndex: 0, relationship: { select: "all" } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields).to.have.lengthOf(1);
    expect(fields[0].propertyClassName).to.equal("TestSchema.aToB");
    expect(fields[0].propertyName).to.equal("Weight");
    expect(fields[0].pathFromTarget).to.deep.equal([aToB]);
    expect(fields[0].valueClassNames).to.deep.equal(["TestSchema.aToB"]);
  });

  it("loads both target and relationship class properties for a step spec", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "TargetProp", declaringClassName: "TestSchema.B" })],
      }),
      createEntityClass({
        fullName: "TestSchema.aToB",
        properties: [createPrimitiveProperty({ name: "RelProp", declaringClassName: "TestSchema.aToB" })],
      }),
    ]);
    const declaration: RelatedPropertiesDeclaration = {
      path: [aToB],
      properties: [{ stepIndex: 0, target: { select: "all" }, relationship: { select: "all" } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields.map((f) => f.propertyName)).to.deep.equal(["TargetProp", "RelProp"]);
  });

  it("enumerates every resolved path of a declaration", async () => {
    const bDoor: RelationshipPath[number] = { ...aToB, targetClassName: "TestSchema.BDoor" };
    const bWindow: RelationshipPath[number] = { ...aToB, targetClassName: "TestSchema.BWindow" };
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.BDoor",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.BDoor" })],
      }),
      createEntityClass({
        fullName: "TestSchema.BWindow",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.BWindow" })],
      }),
    ]);
    const provider = createProvider("p1_v1", [{ path: [aToB] }]);
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([bDoor], ["TestSchema.A"]), resolvedPath([bWindow], ["TestSchema.A"])],
      },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields.map((f) => f.valueClassNames[0])).to.deep.equal(["TestSchema.BDoor", "TestSchema.BWindow"]);
  });

  it("throws when the configuration is missing the provider that resolved a declaration", async () => {
    const imodelAccess = createSchemaAccess([]);
    const source = createSource([
      { providerId: "missing_v1", declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    await expect(createRelatedPropertyFields({ imodelAccess, source, ...wireProviders([]) })).rejects.toThrow(
      /missing the iModel fields provider "missing_v1"/,
    );
  });

  it("throws when the provider no longer returns the resolved declaration", async () => {
    const imodelAccess = createSchemaAccess([]);
    const provider = createProvider("p1_v1", []);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    await expect(createRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) })).rejects.toThrow(
      /no longer returns the related-properties declaration at index 0/,
    );
  });
});
