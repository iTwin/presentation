/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { describe, expect, it } from "vitest";
import { createContributionMemoizer } from "../../content/descriptor-building/ContributionMemoizer.js";
import { collectRelatedPropertyFields } from "../../content/descriptor-building/RelatedFields.js";
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
  relationshipName: "TestSchema.AToB",
};
const bToC: RelationshipPath[number] = {
  sourceClassName: "TestSchema.B",
  targetClassName: "TestSchema.C",
  relationshipName: "TestSchema.BToC",
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

/** Wires a set of providers into the `(imodelFieldsProvidersById, getContribution, getAnchorContribution)` shape the enumerator expects. */
function wireProviders(providers: IModelFieldsProvider[]) {
  const imodelFieldsProvidersById = new Map(providers.map((provider) => [provider.id, provider]));
  const getContribution: Parameters<typeof collectRelatedPropertyFields>[0]["getContribution"] = async ({
    provider,
    target,
  }) => provider.getContribution({ imodelAccess: createSchemaAccess([]), target });
  const getAnchorContribution: Parameters<typeof collectRelatedPropertyFields>[0]["getAnchorContribution"] = async ({
    provider,
    anchorClassName,
  }) => provider.getContribution({ imodelAccess: createSchemaAccess([]), target: { primaryClass: anchorClassName } });
  return { imodelFieldsProvidersById, getContribution, getAnchorContribution };
}

function createSource(resolvedDeclarations: ContentSource["resolvedDeclarations"]): ContentSource {
  return { target: { primaryClass: "TestSchema.A" }, resolvedPrimaryClasses: ["TestSchema.A"], resolvedDeclarations };
}

function resolvedPath(path: RelationshipPath, targetClassNames: EC.FullClassNameDotNotation[]): ResolvedPath {
  return { path, targetClassNames };
}

/** Calls the enumerator and unwraps the candidates to their fields. */
async function enumerate(props: Parameters<typeof collectRelatedPropertyFields>[0]): Promise<PropertyField[]> {
  return (await collectRelatedPropertyFields(props)).map(({ field }) => field);
}

describe("collectRelatedPropertyFields", () => {
  it("returns no fields when the source has no resolved declarations", async () => {
    const imodelAccess = createSchemaAccess([]);
    const fields = await enumerate({ imodelAccess, source: createSource([]), ...wireProviders([]) });
    expect(fields).to.deep.equal([]);
  });

  it("pairs each enumerated field with the contributing provider", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.B" })],
      }),
    ]);
    const provider = createProvider("p1_v1", [{ path: [aToB] }]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    const candidates = await collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) });
    expect(candidates).to.have.lengthOf(1);
    expect(candidates[0].provider).to.equal(provider);
  });

  it("loads all properties of the final step's target class when the declaration omits `properties`", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.B" })],
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

  it("attributes the field's primaryClassNames to the resolved path's concrete source classes", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.B" })],
      }),
    ]);
    const provider = createProvider("p1_v1", [{ path: [aToB] }]);
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([aToB], ["TestSchema.A1", "TestSchema.A2"])],
      },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields).to.have.lengthOf(1);
    expect(fields[0].primaryClassNames).to.deep.equal(["TestSchema.A1", "TestSchema.A2"]);
    expect(fields[0].valueClassNames).to.deep.equal(["TestSchema.B"]);
  });

  it("loads only the target class opted in by a step spec", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.C",
        properties: [
          createPrimitiveProperty({ name: "Keep", declaringClass: "TestSchema.C" }),
          createPrimitiveProperty({ name: "Drop", declaringClass: "TestSchema.C" }),
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
        fullName: "TestSchema.AToB",
        properties: [createPrimitiveProperty({ name: "Weight", declaringClass: "TestSchema.AToB" })],
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
    expect(fields[0].propertyClassName).to.equal("TestSchema.AToB");
    expect(fields[0].propertyName).to.equal("Weight");
    expect(fields[0].pathFromTarget).to.deep.equal([aToB]);
    expect(fields[0].valueClassNames).to.deep.equal(["TestSchema.AToB"]);
  });

  it("reports each related field's category facts with a `targetClass` anchor", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [
          createPrimitiveProperty({
            name: "Prop",
            declaringClass: "TestSchema.B",
            category: { fullName: "TestSchema.Geometry", label: "Geometry" },
          }),
          createPrimitiveProperty({ name: "Uncategorized", declaringClass: "TestSchema.B" }),
        ],
      }),
    ]);
    const declaration: RelatedPropertiesDeclaration = {
      path: [aToB],
      properties: [{ stepIndex: 0, target: { select: "all" } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.B"])] },
    ]);

    const candidates = await collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) });

    expect(candidates.map((candidate) => candidate.categorization)).to.deep.equal([
      { anchor: "targetClass", category: { source: "schema", id: "TestSchema.Geometry", label: "Geometry" } },
      { anchor: "targetClass" },
    ]);
  });

  it("loads both target and relationship class properties for a step spec", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "TargetProp", declaringClass: "TestSchema.B" })],
      }),
      createEntityClass({
        fullName: "TestSchema.AToB",
        properties: [createPrimitiveProperty({ name: "RelProp", declaringClass: "TestSchema.AToB" })],
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

  it("reports a relationship field's spec override as a categorization fact", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.AToB",
        label: "A to B",
        properties: [createPrimitiveProperty({ name: "relProp", declaringClass: "TestSchema.AToB" })],
      }),
    ]);
    const declaration: RelatedPropertiesDeclaration = {
      path: [aToB],
      properties: [{ stepIndex: 0, relationship: { select: "all", overrides: { relProp: { categoryId: "custom" } } } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    const candidates = await collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) });

    const candidate = candidates.find(({ field }) => field.propertyName === "relProp");
    expect(candidate?.categorization).to.deep.equal({
      anchor: "relationshipClass",
      category: { source: "override", id: "custom" },
    });
  });

  it("enumerates every resolved path of a declaration", async () => {
    const bDoor: RelationshipPath[number] = { ...aToB, targetClassName: "TestSchema.BDoor" };
    const bWindow: RelationshipPath[number] = { ...aToB, targetClassName: "TestSchema.BWindow" };
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.BDoor",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.BDoor" })],
      }),
      createEntityClass({
        fullName: "TestSchema.BWindow",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.BWindow" })],
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

  it("returns candidates in declaration order regardless of async resolution order", async () => {
    const aToC: RelationshipPath[number] = {
      sourceClassName: "TestSchema.A",
      targetClassName: "TestSchema.C",
      relationshipName: "TestSchema.aToC",
    };
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "BProp", declaringClass: "TestSchema.B" })],
      }),
      createEntityClass({
        fullName: "TestSchema.C",
        properties: [createPrimitiveProperty({ name: "CProp", declaringClass: "TestSchema.C" })],
      }),
    ]);
    // Both providers are gated so we can force the second declaration's provider to fully resolve
    // before the first — if candidates were appended in completion order, the second provider's field
    // would come first.
    const firstGate = new ResolvablePromise<void>();
    const secondGate = new ResolvablePromise<void>();
    const firstProvider: IModelFieldsProvider = {
      id: "first_v1",
      async getContribution() {
        await firstGate;
        return { relatedProperties: [{ path: [aToB] }] };
      },
    };
    const secondProvider: IModelFieldsProvider = {
      id: "second_v1",
      async getContribution() {
        await secondGate;
        return { relatedProperties: [{ path: [aToC] }] };
      },
    };
    const source = createSource([
      { providerId: firstProvider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
      { providerId: secondProvider.id, declarationIndex: 0, paths: [resolvedPath([aToC], ["TestSchema.A"])] },
    ]);

    const resultPromise = collectRelatedPropertyFields({
      imodelAccess,
      source,
      ...wireProviders([firstProvider, secondProvider]),
    });
    // Let the second declaration's provider fully resolve before the first one.
    await secondGate.resolve();
    await firstGate.resolve();
    const fields = (await resultPromise).map(({ field }) => field);
    expect(fields.map((f) => f.propertyName)).to.deep.equal(["BProp", "CProp"]);
  });

  it("throws when a step spec references an out-of-bounds step index", async () => {
    const imodelAccess = createSchemaAccess([]);
    const declaration: RelatedPropertiesDeclaration = {
      path: [aToB],
      properties: [{ stepIndex: 1, target: { select: "all" } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    await expect(collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) })).rejects.toThrow(
      /references step index 1, but the resolved path only has 1 step/,
    );
  });

  it("throws when the configuration is missing the provider that resolved a declaration", async () => {
    const imodelAccess = createSchemaAccess([]);
    const source = createSource([
      { providerId: "missing_v1", declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    await expect(collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([]) })).rejects.toThrow(
      /missing the iModel fields provider "missing_v1"/,
    );
  });

  it("throws when the provider no longer returns the resolved declaration", async () => {
    const imodelAccess = createSchemaAccess([]);
    const provider = createProvider("p1_v1", []);
    const source = createSource([
      { providerId: provider.id, declarationIndex: 0, paths: [resolvedPath([aToB], ["TestSchema.A"])] },
    ]);

    await expect(collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) })).rejects.toThrow(
      /no longer returns the related-properties declaration at index 0/,
    );
  });
});

describe("collectRelatedPropertyFields — nested groups", () => {
  const bToC1: RelationshipPath[number] = {
    sourceClassName: "TestSchema.B",
    targetClassName: "TestSchema.C1",
    relationshipName: "TestSchema.BToC",
  };

  it("recovers a nested group's declaration via the synthesized anchor target, not the source's target", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.C",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.C" })],
      }),
    ]);
    const targetsSeen: EC.FullClassNameDotNotation[] = [];
    const provider: IModelFieldsProvider = {
      id: "p1_v1",
      applyRecursively: true,
      async getContribution({ target }) {
        targetsSeen.push(target.primaryClass);
        // Only applies at the "TestSchema.B" anchor — never at the source's own "TestSchema.A" target.
        return target.primaryClass === "TestSchema.B" ? { relatedProperties: [{ path: [bToC] }] } : undefined;
      },
    };
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([aToB, bToC], ["TestSchema.A"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields).to.have.lengthOf(1);
    expect(fields[0].propertyClassName).to.equal("TestSchema.C");
    expect(fields[0].pathFromTarget).to.deep.equal([aToB, bToC]);
    expect(targetsSeen).to.deep.equal(["TestSchema.B"]);
  });

  it("offsets a nested declaration's StepPropertySpec.stepIndex by nested.prefixStepCount", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.C",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.C" })],
      }),
    ]);
    // `stepIndex: 0` is relative to the nested declaration's own (suffix) path `[bToC]` — with a
    // `prefixStepCount` of 1, it must resolve to `path[1]` of the full path `[aToB, bToC]`, not `path[0]`.
    const declaration: RelatedPropertiesDeclaration = {
      path: [bToC],
      properties: [{ stepIndex: 0, target: { select: "all" } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([aToB, bToC], ["TestSchema.A"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields).to.have.lengthOf(1);
    expect(fields[0].propertyName).to.equal("Prop");
    expect(fields[0].pathFromTarget).to.deep.equal([aToB, bToC]);
    expect(fields[0].valueClassNames).to.deep.equal(["TestSchema.C"]);
  });

  it("`primaryClassNames` of a nested field remain the true (near-end) primary classes", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.C",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.C" })],
      }),
    ]);
    const provider = createProvider("p1_v1", [{ path: [bToC] }]);
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([aToB, bToC], ["TestSchema.A1", "TestSchema.A2"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
    ]);

    const fields = await enumerate({ imodelAccess, source, ...wireProviders([provider]) });

    expect(fields[0].primaryClassNames).to.deep.equal(["TestSchema.A1", "TestSchema.A2"]);
  });

  it("throws with the nested suffix length when a nested step spec is out of bounds", async () => {
    const imodelAccess = createSchemaAccess([]);
    const declaration: RelatedPropertiesDeclaration = {
      path: [bToC],
      properties: [{ stepIndex: 1, target: { select: "all" } }],
    };
    const provider = createProvider("p1_v1", [declaration]);
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([aToB, bToC], ["TestSchema.A"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
    ]);

    await expect(collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) })).rejects.toThrow(
      /references step index 1, but the resolved nested suffix only has 1 step/,
    );
  });

  it("includes the nested anchor class in the missing-provider error", async () => {
    const imodelAccess = createSchemaAccess([]);
    const source = createSource([
      {
        providerId: "missing_v1",
        declarationIndex: 0,
        paths: [resolvedPath([aToB, bToC], ["TestSchema.A"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
    ]);

    await expect(collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([]) })).rejects.toThrow(
      /missing the iModel fields provider "missing_v1".*\(nested anchor "TestSchema\.B"\)/,
    );
  });

  it("includes the nested anchor class in the missing-declaration error", async () => {
    const imodelAccess = createSchemaAccess([]);
    const provider = createProvider("p1_v1", []);
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([aToB, bToC], ["TestSchema.A"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
    ]);

    await expect(collectRelatedPropertyFields({ imodelAccess, source, ...wireProviders([provider]) })).rejects.toThrow(
      /no longer returns the related-properties declaration at index 0.*\(nested anchor "TestSchema\.B"\)/,
    );
  });

  it("recovers two nested groups sharing an anchor with a single memoized getContribution call", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.C",
        properties: [createPrimitiveProperty({ name: "Prop1", declaringClass: "TestSchema.C" })],
      }),
      createEntityClass({
        fullName: "TestSchema.C1",
        properties: [createPrimitiveProperty({ name: "Prop2", declaringClass: "TestSchema.C1" })],
      }),
    ]);
    let callCount = 0;
    const provider: IModelFieldsProvider = {
      id: "p1_v1",
      applyRecursively: true,
      async getContribution() {
        callCount++;
        return { relatedProperties: [{ path: [bToC] }, { path: [bToC1] }] };
      },
    };
    const source = createSource([
      {
        providerId: provider.id,
        declarationIndex: 0,
        paths: [resolvedPath([aToB, bToC], ["TestSchema.A"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
      {
        providerId: provider.id,
        declarationIndex: 1,
        paths: [resolvedPath([aToB, bToC1], ["TestSchema.A"])],
        nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
      },
    ]);

    const { getContribution, getAnchorContribution } = createContributionMemoizer({
      imodelAccess: createSchemaAccess([]),
    });
    const imodelFieldsProvidersById = new Map([[provider.id, provider]]);

    const fields = await enumerate({
      imodelAccess,
      source,
      getContribution,
      getAnchorContribution,
      imodelFieldsProvidersById,
    });

    expect(fields.map((f) => f.propertyName)).to.deep.equal(["Prop1", "Prop2"]);
    expect(callCount).to.equal(1);
  });
});
