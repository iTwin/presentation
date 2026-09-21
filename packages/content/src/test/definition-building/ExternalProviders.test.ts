/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { describe, expect, it } from "vitest";
import { collectExternalFields } from "../../content/definition-building/ExternalFields.js";
import { prepareExternalProviders } from "../../content/definition-building/ExternalProviders.js";
import { computePropertySelectorId } from "../../content/definition-building/ValueSelector.js";
import { serializeRelationshipPath } from "../../content/model/Utils.js";
import { createPathCardinalityClassifier } from "../../content/PathCardinality.js";
import { createRelationshipClass, createSchemaAccess } from "../MetadataStubs.js";

import type { RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type {
  ExternalFieldsProvider,
  InputPropertyDeclaration,
} from "../../content/extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { PathCardinalityClassifier } from "../../content/PathCardinality.js";

const declaredPath: RelationshipPath = [
  { sourceClassName: "Schema.A", relationshipName: "Schema.Rel", targetClassName: "Schema.B" },
];
const firstPath: RelationshipPath = [
  { sourceClassName: "Schema.A1", relationshipName: "Schema.Rel1", targetClassName: "Schema.B1" },
];
const secondPath: RelationshipPath = [
  { sourceClassName: "Schema.A2", relationshipName: "Schema.Rel2", targetClassName: "Schema.B2" },
];
const input: InputPropertyDeclaration = {
  propertyClassName: "Schema.B",
  propertyName: "Name",
  related: { path: declaredPath, cardinalityHint: "one" },
};

function createProvider(
  inputs: Record<string, InputPropertyDeclaration> = { name: input },
  id: ExternalFieldsProvider["id"] = "ext_v1",
): ExternalFieldsProvider {
  return {
    id,
    inputs,
    fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
    async getValues() {
      return [];
    },
  };
}

function createSource(resolvedExternalInputs: ContentSource["resolvedExternalInputs"]): ContentSource {
  return {
    target: { primaryClass: "Schema.A" },
    resolvedPrimaryClasses: ["Schema.A"],
    resolvedDeclarations: [],
    resolvedExternalInputs,
  };
}

function createGroup(
  paths: RelationshipPath[],
  inputKey = "name",
  providerId: ExternalFieldsProvider["id"] = "ext_v1",
): ContentSource["resolvedExternalInputs"][number] {
  return { providerId, inputKey, paths: paths.map((path) => ({ path, targetClassNames: ["Schema.A"] })) };
}

async function prepare(props: {
  providers: ExternalFieldsProvider[];
  sources: ContentSource[];
  fields?: ContentDescriptor["fields"];
  classifier?: PathCardinalityClassifier;
}) {
  return prepareExternalProviders({
    ...props,
    fields: props.fields ?? collectExternalFields(props.providers),
    classifier:
      props.classifier ??
      createPathCardinalityClassifier(
        createSchemaAccess([
          createRelationshipClass({ fullName: "Schema.Rel", cardinality: "many" }),
          createRelationshipClass({ fullName: "Schema.Rel1", cardinality: "one" }),
          createRelationshipClass({ fullName: "Schema.Rel2", cardinality: "one" }),
        ]),
      ),
  });
}

function selector(
  path: RelationshipPath,
  propertyClassName: InputPropertyDeclaration["propertyClassName"] = "Schema.B",
) {
  return {
    selectorId: computePropertySelectorId({ propertyClassName, propertyName: "Name", pathFromTarget: path }),
    pathKey: serializeRelationshipPath({ path }),
  };
}

describe("prepareExternalProviders", () => {
  it("returns empty requirements and plans when there are no providers", async () => {
    expect(await prepare({ providers: [], sources: [] })).to.deep.equal({ inputs: [], plans: [] });
  });

  it("prepares a provider with no input declarations", async () => {
    const provider = createProvider({});
    delete provider.inputs;

    expect(await prepare({ providers: [provider], sources: [] })).to.deep.equal({
      inputs: [],
      plans: [{ provider, inputs: [], outputs: [{ localId: "status", fieldId: "ext_v1:status" }] }],
    });
  });

  it("keeps provider, input, and path order when classification finishes out of order", async () => {
    const otherPath: RelationshipPath = [{ ...declaredPath[0], relationshipName: "Schema.OtherRel" }];
    const providers = [
      createProvider({ name: input, code: { propertyClassName: "Schema.A", propertyName: "Code" } }),
      createProvider({ name: { ...input, related: { path: otherPath, cardinalityHint: "one" } } }, "other_v1"),
    ];
    const slowGate = new ResolvablePromise<void>();
    const completed: string[] = [];

    const result = await prepare({
      providers,
      sources: [createSource([createGroup([firstPath, secondPath])])],
      classifier: {
        async classify({ path }) {
          const relationship = path[0].relationshipName;
          if (relationship === "Schema.Rel1") {
            await slowGate;
          }
          if (relationship === "Schema.OtherRel") {
            slowGate.resolveSync();
          }
          completed.push(relationship);
          return "one";
        },
      },
    });

    expect(completed.indexOf("Schema.Rel1")).to.be.greaterThan(completed.indexOf("Schema.Rel2"));
    expect(completed.indexOf("Schema.Rel1")).to.be.greaterThan(completed.indexOf("Schema.OtherRel"));
    expect(result.inputs.map(({ pathFromTarget }) => pathFromTarget)).to.deep.equal([
      firstPath,
      secondPath,
      undefined,
      otherPath,
    ]);
    expect(result.plans.map(({ provider }) => provider.id)).to.deep.equal(["ext_v1", "other_v1"]);
    expect(result.plans[0].inputs.map(({ key }) => key)).to.deep.equal(["name", "code"]);
    expect(result.plans[0].inputs[0].selectors).to.deep.equal([selector(firstPath), selector(secondPath)]);
  });

  it.each([
    { description: "resolved query path", failingRelationship: "Schema.Rel1" },
    { description: "declared input path", failingRelationship: "Schema.Rel" },
  ])("propagates cardinality classification errors for the $description", async ({ failingRelationship }) => {
    const error = new Error("Schema lookup failed");
    await expect(
      prepare({
        providers: [createProvider()],
        sources: [createSource([createGroup([firstPath])])],
        classifier: {
          async classify({ path }) {
            if (path[0].relationshipName === failingRelationship) {
              throw error;
            }
            return "one";
          },
        },
      }),
    ).rejects.toBe(error);
  });

  it("maps a provider input to all concrete paths and deduplicates paths shared by sources", async () => {
    const provider = createProvider();
    const result = await prepare({
      providers: [provider],
      sources: [createSource([createGroup([firstPath])]), createSource([createGroup([firstPath, secondPath])])],
    });

    expect(result.inputs).to.deep.equal(
      [firstPath, secondPath].map((pathFromTarget) => ({
        propertyClassName: "Schema.B",
        propertyName: "Name",
        cardinality: "one",
        pathFromTarget,
      })),
    );
    expect(result.plans).to.deep.equal([
      {
        provider,
        inputs: [{ key: "name", cardinality: "one", selectors: [selector(firstPath), selector(secondPath)] }],
        outputs: [{ localId: "status", fieldId: "ext_v1:status" }],
      },
    ]);
  });

  it("keeps filtered multi-step paths associated with their input keys", async () => {
    const filteredPath = (value: string): RelationshipPath => [
      declaredPath[0],
      {
        sourceClassName: "Schema.B",
        relationshipName: "Schema.BackRel",
        targetClassName: "Schema.C",
        relationshipReverse: true,
        instanceFilter: { expression: "this.Name = :name", bindings: { name: { type: "string", value } } },
      },
    ];
    const firstDeclared = filteredPath("first");
    const secondDeclared = filteredPath("second");
    const concrete = (path: RelationshipPath): RelationshipPath => [
      { ...path[0], targetClassName: "Schema.B1" },
      { ...path[1], sourceClassName: "Schema.B1", relationshipName: "Schema.BackRel1", targetClassName: "Schema.C1" },
    ];
    const result = await prepare({
      providers: [
        createProvider({
          first: { ...input, propertyClassName: "Schema.C", related: { path: firstDeclared, cardinalityHint: "one" } },
          second: {
            ...input,
            propertyClassName: "Schema.C",
            related: { path: secondDeclared, cardinalityHint: "one" },
          },
        }),
      ],
      sources: [
        createSource([
          createGroup([concrete(secondDeclared)], "second"),
          createGroup([concrete(firstDeclared)], "first"),
        ]),
      ],
    });

    expect(result.inputs.map(({ pathFromTarget }) => pathFromTarget)).to.deep.equal([
      concrete(firstDeclared),
      concrete(secondDeclared),
    ]);
    expect(result.plans[0].inputs).to.deep.equal([
      { key: "first", cardinality: "one", selectors: [selector(concrete(firstDeclared), "Schema.C")] },
      { key: "second", cardinality: "one", selectors: [selector(concrete(secondDeclared), "Schema.C")] },
    ]);
  });

  it("keeps input keys and cardinalities independent when providers share selector coordinates", async () => {
    const result = await prepare({
      providers: [
        createProvider({
          scalar: input,
          array: { ...input, related: { path: declaredPath, cardinalityHint: "many" } },
        }),
        createProvider({ scalar: { ...input, related: { path: declaredPath, cardinalityHint: "many" } } }, "other_v1"),
      ],
      sources: [
        createSource([
          createGroup([firstPath], "scalar"),
          createGroup([firstPath], "array"),
          createGroup([firstPath], "scalar", "other_v1"),
        ]),
      ],
    });

    expect(result.inputs.map(({ cardinality }) => cardinality)).to.deep.equal(["one", "many", "many"]);
    expect(result.inputs.map(({ pathFromTarget }) => pathFromTarget)).to.deep.equal([firstPath, firstPath, firstPath]);
    expect(result.plans.map(({ inputs }) => inputs)).to.deep.equal([
      [
        { key: "scalar", cardinality: "one", selectors: [selector(firstPath)] },
        { key: "array", cardinality: "many", selectors: [selector(firstPath)] },
      ],
      [{ key: "scalar", cardinality: "many", selectors: [selector(firstPath)] }],
    ]);
  });

  it("uses each provider's own resolved group even when declarations have identical coordinates", async () => {
    const result = await prepare({
      providers: [createProvider(), createProvider({ name: input }, "other_v1")],
      sources: [createSource([createGroup([firstPath]), createGroup([secondPath], "name", "other_v1")])],
    });

    expect(result.plans.map(({ inputs }) => inputs[0].selectors)).to.deep.equal([
      [selector(firstPath)],
      [selector(secondPath)],
    ]);
  });

  it("infers query cardinality from each concrete path and input cardinality from the declared path", async () => {
    const result = await prepare({
      providers: [
        createProvider({
          name: { propertyClassName: "Schema.B", propertyName: "Name", related: { path: declaredPath } },
        }),
      ],
      sources: [createSource([createGroup([firstPath, secondPath])])],
    });

    expect(result.inputs.map(({ cardinality }) => cardinality)).to.deep.equal(["one", "one"]);
    expect(result.plans[0].inputs[0]).to.deep.equal({
      key: "name",
      cardinality: "many",
      selectors: [selector(firstPath), selector(secondPath)],
    });
  });

  it("retains direct inputs and empty resolved groups for schema validation", async () => {
    const direct: InputPropertyDeclaration = { propertyClassName: "Schema.A", propertyName: "Code" };
    const result = await prepare({
      providers: [createProvider({ direct, name: input })],
      sources: [createSource([createGroup([])])],
    });

    expect(result.inputs).to.deep.equal([
      { propertyClassName: "Schema.A", propertyName: "Code", cardinality: "one" },
      { propertyClassName: "Schema.B", propertyName: "Name", pathFromTarget: declaredPath, cardinality: "one" },
    ]);
    expect(result.plans[0].inputs).to.deep.equal([
      { key: "direct", cardinality: "one", selectors: [{ selectorId: "Schema.A.Code" }] },
      { key: "name", cardinality: "one", selectors: [selector(declaredPath)] },
    ]);
  });

  it("retains unhinted declaration coordinates when no source resolved the input", async () => {
    const result = await prepare({
      providers: [
        createProvider({
          name: { propertyClassName: "Schema.B", propertyName: "Name", related: { path: declaredPath } },
        }),
      ],
      sources: [],
    });

    expect(result.inputs).to.deep.equal([
      { propertyClassName: "Schema.B", propertyName: "Name", pathFromTarget: declaredPath, cardinality: "many" },
    ]);
    expect(result.plans[0].inputs[0].cardinality).to.equal("many");
  });

  it("keeps input requirements but omits providers whose output fields were removed", async () => {
    const result = await prepare({
      providers: [createProvider()],
      sources: [createSource([createGroup([firstPath])])],
      fields: {},
    });

    expect(result.inputs).to.deep.equal([
      { propertyClassName: "Schema.B", propertyName: "Name", pathFromTarget: firstPath, cardinality: "one" },
    ]);
    expect(result.plans).to.deep.equal([]);
  });

  it.each([undefined, "one", "many"] as const)(
    "rejects an empty related path with cardinality hint %s",
    async (cardinalityHint) => {
      const provider = createProvider({ name: { ...input, related: { path: [], cardinalityHint } } });
      await expect(prepare({ providers: [provider], sources: [] })).rejects.toThrow(
        'External fields provider "ext_v1" input "name" declares an empty related path. Omit "related" for a direct property input.',
      );
    },
  );

  it("rejects an empty related path even when cached paths exist and output fields were removed", async () => {
    const provider = createProvider({ name: { ...input, related: { path: [], cardinalityHint: "many" } } });
    await expect(
      prepare({ providers: [provider], sources: [createSource([createGroup([firstPath])])], fields: {} }),
    ).rejects.toThrow(/provider "ext_v1" input "name" declares an empty related path/);
  });

  it("does not classify the logical input when all provider outputs were removed", async () => {
    const classified: RelationshipPath[] = [];
    const result = await prepare({
      providers: [createProvider()],
      sources: [createSource([createGroup([firstPath])])],
      fields: {},
      classifier: {
        async classify({ path }) {
          classified.push(path);
          return "one";
        },
      },
    });

    expect(classified).to.deep.equal([firstPath]);
    expect(result.inputs).to.have.lengthOf(1);
    expect(result.plans).to.deep.equal([]);
  });

  it("binds only surviving outputs", async () => {
    const provider = createProvider({});
    provider.fields = [
      ...provider.fields,
      { id: "removed", label: "Removed", type: { kind: "primitive", type: "String" } },
    ];
    const fields = collectExternalFields([provider]);
    delete fields["ext_v1:removed"];

    const result = await prepare({ providers: [provider], sources: [], fields });

    expect(result.plans).to.deep.equal([
      { provider, inputs: [], outputs: [{ localId: "status", fieldId: "ext_v1:status" }] },
    ]);
  });

  it("rejects a group referencing a missing provider", async () => {
    await expect(prepare({ providers: [], sources: [createSource([createGroup([declaredPath])])] })).rejects.toThrow(
      /missing the external fields provider "ext_v1".*input "name".*target "Schema.A"/,
    );
  });

  it("rejects a group referencing a removed input", async () => {
    await expect(
      prepare({ providers: [createProvider({})], sources: [createSource([createGroup([declaredPath])])] }),
    ).rejects.toThrow(/no longer declares related input "name".*target "Schema.A"/);
  });

  it("rejects a resolved input group when its provider no longer declares any inputs", async () => {
    const provider = createProvider();
    delete provider.inputs;

    await expect(
      prepare({ providers: [provider], sources: [createSource([createGroup([declaredPath])])] }),
    ).rejects.toThrow(/External fields provider "ext_v1" no longer declares related input "name".*target "Schema.A"/);
  });

  it("rejects a group whose input was changed to a direct property", async () => {
    await expect(
      prepare({
        providers: [createProvider({ name: { propertyClassName: "Schema.A", propertyName: "Name" } })],
        sources: [createSource([createGroup([declaredPath])])],
      }),
    ).rejects.toThrow(/no longer declares related input "name".*target "Schema.A"/);
  });
});
