/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectCalculatedFields } from "../../content/descriptor-building/CalculatedFields.js";
import { createSchemaAccess } from "../MetadataStubs.js";

import type { ContentSource } from "../../content/ContentTarget.js";
import type { IModelFieldsProvider } from "../../content/extensions/IModelFieldsProvider.js";

type Contribution = Awaited<ReturnType<IModelFieldsProvider["getContribution"]>>;

function createSource(): ContentSource {
  return {
    target: { primaryClass: "TestSchema.A" },
    resolvedPrimaryClasses: ["TestSchema.A"],
    resolvedDeclarations: [],
  };
}

function createProvider(id: IModelFieldsProvider["id"], contribution: Contribution): IModelFieldsProvider {
  return {
    id,
    async getContribution() {
      return contribution;
    },
  };
}

const getContribution: Parameters<typeof collectCalculatedFields>[0]["getContribution"] = async (provider, target) =>
  provider.getContribution({ imodelAccess: createSchemaAccess([]), target });

describe("collectCalculatedFields", () => {
  it("returns no fields when providers declare none", async () => {
    const provider = createProvider("p_v1", { calculatedFields: [] });
    const fields = await collectCalculatedFields({
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields).to.deep.equal({});
  });

  it("skips providers that are not applicable to the target", async () => {
    const provider = createProvider("p_v1", undefined);
    const fields = await collectCalculatedFields({
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields).to.deep.equal({});
  });

  it("maps a calculated field declaration, prefixing the id with the provider id", async () => {
    const provider = createProvider("p_v1", {
      calculatedFields: [
        { id: "flow", label: "Flow", expression: "this.FlowRate * 2", type: { kind: "primitive", type: "Double" } },
      ],
    });
    const fields = await collectCalculatedFields({
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields).to.deep.equal({
      "p_v1:flow": {
        kind: "calculated",
        id: "p_v1:flow",
        selectorId: "p_v1:flow",
        label: "Flow",
        expression: "this.FlowRate * 2",
        type: { kind: "primitive", type: "Double" },
      },
    });
  });

  it("carries optional target alias, bindings, and category", async () => {
    const provider = createProvider("p_v1", {
      calculatedFields: [
        {
          id: "calc",
          label: "Calc",
          expression: "e.X",
          targetAlias: "e",
          bindings: { p: { type: "string", value: "v" } },
          type: { kind: "primitive", type: "String" },
          categoryId: "cat",
        },
      ],
    });
    const fields = await collectCalculatedFields({
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    const field = fields["p_v1:calc"];
    expect(field.targetAlias).to.equal("e");
    expect(field.bindings).to.deep.equal({ p: { type: "string", value: "v" } });
    expect(field.categoryId).to.equal("cat");
  });

  it("deduplicates the same provider's calculated fields across sources", async () => {
    const provider = createProvider("p_v1", {
      calculatedFields: [{ id: "calc", label: "Calc", expression: "1", type: { kind: "primitive", type: "Integer" } }],
    });
    const fields = await collectCalculatedFields({
      sources: [createSource(), createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(Object.keys(fields)).to.deep.equal(["p_v1:calc"]);
  });

  it("throws when a provider declares divergent calculated fields for one id across targets", async () => {
    const provider: IModelFieldsProvider = {
      id: "p_v1",
      async getContribution({ target }) {
        return {
          calculatedFields: [
            {
              id: "calc",
              label: "Calc",
              expression: target.primaryClass === "TestSchema.A" ? "1" : "2",
              type: {
                kind: "struct",
                members: [{ name: "m", label: "M", type: { kind: "primitive", type: "Integer" } }],
              },
            },
          ],
        };
      },
    };
    await expect(
      collectCalculatedFields({
        sources: [
          {
            target: { primaryClass: "TestSchema.A" },
            resolvedPrimaryClasses: ["TestSchema.A"],
            resolvedDeclarations: [],
          },
          {
            target: { primaryClass: "TestSchema.B" },
            resolvedPrimaryClasses: ["TestSchema.B"],
            resolvedDeclarations: [],
          },
        ],
        imodelFieldsProviders: [provider],
        getContribution,
      }),
    ).rejects.toThrow(/Cannot merge calculated field "p_v1:calc"/);
  });
});
