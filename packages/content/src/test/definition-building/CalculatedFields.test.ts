/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectCalculatedFields } from "../../content/definition-building/CalculatedFields.js";
import { createEntityClass, createSchemaAccess } from "../MetadataStubs.js";

import type { ContentSource } from "../../content/ContentTarget.js";
import type { IModelFieldsProvider } from "../../content/extensions/IModelFieldsProvider.js";

type Contribution = Awaited<ReturnType<IModelFieldsProvider["getContribution"]>>;
type Declaration = NonNullable<NonNullable<Contribution>["calculatedFields"]>[number];

// Base <- A <- A1, A2;  Base <- B <- B1;  Unrelated
const base = createEntityClass({ fullName: "TestSchema.Base" });
const classA = createEntityClass({ fullName: "TestSchema.A", baseClass: base });
const classA1 = createEntityClass({ fullName: "TestSchema.A1", baseClass: classA });
const classA2 = createEntityClass({ fullName: "TestSchema.A2", baseClass: classA });
const classB = createEntityClass({ fullName: "TestSchema.B", baseClass: base });
const classB1 = createEntityClass({ fullName: "TestSchema.B1", baseClass: classB });
const unrelated = createEntityClass({ fullName: "TestSchema.Unrelated" });
const imodelAccess = createSchemaAccess([base, classA, classA1, classA2, classB, classB1, unrelated]);

function createSource(props?: Partial<Pick<ContentSource, "target" | "resolvedPrimaryClasses">>): ContentSource {
  return {
    target: props?.target ?? { primaryClass: "TestSchema.A" },
    resolvedPrimaryClasses: props?.resolvedPrimaryClasses ?? ["TestSchema.A"],
    resolvedDeclarations: [],
    resolvedExternalInputs: [],
  };
}

function createDeclaration(overrides?: Partial<Declaration>): Declaration {
  return {
    id: "calc",
    label: "Calc",
    sourceClassName: "TestSchema.A",
    expression: "1",
    type: { kind: "primitive", type: "Double" },
    ...overrides,
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

const getContribution: Parameters<typeof collectCalculatedFields>[0]["getContribution"] = async ({
  provider,
  target,
}) => provider.getContribution({ imodelAccess, target });

describe("collectCalculatedFields", () => {
  it("returns no fields when providers declare none", async () => {
    const provider = createProvider("p_v1", { calculatedFields: [] });
    const fields = await collectCalculatedFields({
      imodelAccess,
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields).to.deep.equal({});
  });

  it("skips providers that are not applicable to the target", async () => {
    const provider = createProvider("p_v1", undefined);
    const fields = await collectCalculatedFields({
      imodelAccess,
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields).to.deep.equal({});
  });

  it("maps a calculated field declaration, prefixing the id with the provider id", async () => {
    const provider = createProvider("p_v1", {
      calculatedFields: [createDeclaration({ id: "flow", label: "Flow", expression: "this.FlowRate * 2" })],
    });
    const fields = await collectCalculatedFields({
      imodelAccess,
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields).to.deep.equal({
      "p_v1:flow": {
        kind: "calculated",
        id: "p_v1:flow",
        label: "Flow",
        sourceClassName: "TestSchema.A",
        expression: "this.FlowRate * 2",
        type: { kind: "primitive", type: "Double" },
        primaryClassNames: ["TestSchema.A"],
      },
    });
  });

  it("carries optional target alias, bindings, and category", async () => {
    const provider = createProvider("p_v1", {
      calculatedFields: [
        createDeclaration({
          expression: "e.X",
          targetAlias: "e",
          bindings: { p: { type: "string", value: "v" } },
          categoryId: "cat",
        }),
      ],
    });
    const fields = await collectCalculatedFields({
      imodelAccess,
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
    const provider = createProvider("p_v1", { calculatedFields: [createDeclaration()] });
    const fields = await collectCalculatedFields({
      imodelAccess,
      sources: [createSource(), createSource()],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(Object.keys(fields)).to.deep.equal(["p_v1:calc"]);
  });

  it("unions primaryClassNames across sources the same declaration was contributed for", async () => {
    const provider = createProvider("p_v1", {
      calculatedFields: [createDeclaration({ sourceClassName: "TestSchema.Base" })],
    });
    const fields = await collectCalculatedFields({
      imodelAccess,
      sources: [
        createSource({
          target: { primaryClass: "TestSchema.A" },
          resolvedPrimaryClasses: ["TestSchema.A1", "TestSchema.A2"],
        }),
        createSource({ target: { primaryClass: "TestSchema.B" }, resolvedPrimaryClasses: ["TestSchema.B1"] }),
      ],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields["p_v1:calc"].primaryClassNames).to.deep.equal(["TestSchema.A1", "TestSchema.A2", "TestSchema.B1"]);
  });

  it("falls back to the target's primary class when no concrete classes were resolved", async () => {
    const provider = createProvider("p_v1", { calculatedFields: [createDeclaration()] });
    const fields = await collectCalculatedFields({
      imodelAccess,
      sources: [createSource({ target: { primaryClass: "TestSchema.A" }, resolvedPrimaryClasses: [] })],
      imodelFieldsProviders: [provider],
      getContribution,
    });
    expect(fields["p_v1:calc"].primaryClassNames).to.deep.equal(["TestSchema.A"]);
  });

  describe("source class applicability", () => {
    it("applies a base-class declaration to every resolved class", async () => {
      const provider = createProvider("p_v1", {
        calculatedFields: [createDeclaration({ sourceClassName: "TestSchema.Base" })],
      });
      const fields = await collectCalculatedFields({
        imodelAccess,
        sources: [
          createSource({
            target: { primaryClass: "TestSchema.A" },
            resolvedPrimaryClasses: ["TestSchema.A1", "TestSchema.A2"],
          }),
        ],
        imodelFieldsProviders: [provider],
        getContribution,
      });
      expect(fields["p_v1:calc"].primaryClassNames).to.deep.equal(["TestSchema.A1", "TestSchema.A2"]);
    });

    it("applies a narrower declaration only to the resolved classes deriving from it", async () => {
      const provider = createProvider("p_v1", {
        calculatedFields: [createDeclaration({ sourceClassName: "TestSchema.A" })],
      });
      const fields = await collectCalculatedFields({
        imodelAccess,
        sources: [
          createSource({
            target: { primaryClass: "TestSchema.Base" },
            resolvedPrimaryClasses: ["TestSchema.A1", "TestSchema.A2", "TestSchema.B1"],
          }),
        ],
        imodelFieldsProviders: [provider],
        getContribution,
      });
      expect(fields["p_v1:calc"].sourceClassName).to.equal("TestSchema.A");
      expect(fields["p_v1:calc"].primaryClassNames).to.deep.equal(["TestSchema.A1", "TestSchema.A2"]);
    });

    it("drops a narrower declaration when none of the resolved classes derive from it", async () => {
      const provider = createProvider("p_v1", {
        calculatedFields: [createDeclaration({ sourceClassName: "TestSchema.A" })],
      });
      const fields = await collectCalculatedFields({
        imodelAccess,
        sources: [
          createSource({ target: { primaryClass: "TestSchema.Base" }, resolvedPrimaryClasses: ["TestSchema.B1"] }),
        ],
        imodelFieldsProviders: [provider],
        getContribution,
      });
      expect(fields).to.deep.equal({});
    });

    it("drops a declaration whose source class is unrelated to the target", async () => {
      const provider = createProvider("p_v1", {
        calculatedFields: [createDeclaration({ sourceClassName: "TestSchema.Unrelated" })],
      });
      const fields = await collectCalculatedFields({
        imodelAccess,
        sources: [createSource()],
        imodelFieldsProviders: [provider],
        getContribution,
      });
      expect(fields).to.deep.equal({});
    });

    it("keeps a field for the sources it applies to when another source has no applicable class", async () => {
      const provider = createProvider("p_v1", {
        calculatedFields: [createDeclaration({ sourceClassName: "TestSchema.A" })],
      });
      const fields = await collectCalculatedFields({
        imodelAccess,
        sources: [
          createSource({ target: { primaryClass: "TestSchema.Base" }, resolvedPrimaryClasses: ["TestSchema.B1"] }),
          createSource({ target: { primaryClass: "TestSchema.A" }, resolvedPrimaryClasses: ["TestSchema.A1"] }),
        ],
        imodelFieldsProviders: [provider],
        getContribution,
      });
      expect(fields["p_v1:calc"].primaryClassNames).to.deep.equal(["TestSchema.A1"]);
    });
  });

  it("throws when a provider declares divergent calculated fields for one id across targets", async () => {
    const provider: IModelFieldsProvider = {
      id: "p_v1",
      async getContribution({ target }) {
        return {
          calculatedFields: [
            createDeclaration({
              sourceClassName: "TestSchema.Base",
              expression: target.primaryClass === "TestSchema.A" ? "1" : "2",
              type: {
                kind: "struct",
                members: [{ name: "m", label: "M", type: { kind: "primitive", type: "Integer" } }],
              },
            }),
          ],
        };
      },
    };
    await expect(
      collectCalculatedFields({
        imodelAccess,
        sources: [
          createSource({ target: { primaryClass: "TestSchema.A" }, resolvedPrimaryClasses: ["TestSchema.A"] }),
          createSource({ target: { primaryClass: "TestSchema.B" }, resolvedPrimaryClasses: ["TestSchema.B"] }),
        ],
        imodelFieldsProviders: [provider],
        getContribution,
      }),
    ).rejects.toThrow(/Cannot merge calculated field "p_v1:calc"/);
  });

  it("throws when a provider declares one id against different source classes", async () => {
    const provider: IModelFieldsProvider = {
      id: "p_v1",
      async getContribution({ target }) {
        return { calculatedFields: [createDeclaration({ sourceClassName: target.primaryClass })] };
      },
    };
    await expect(
      collectCalculatedFields({
        imodelAccess,
        sources: [
          createSource({ target: { primaryClass: "TestSchema.A" }, resolvedPrimaryClasses: ["TestSchema.A"] }),
          createSource({ target: { primaryClass: "TestSchema.B" }, resolvedPrimaryClasses: ["TestSchema.B"] }),
        ],
        imodelFieldsProviders: [provider],
        getContribution,
      }),
    ).rejects.toThrow(/Cannot merge calculated field "p_v1:calc"/);
  });
});
