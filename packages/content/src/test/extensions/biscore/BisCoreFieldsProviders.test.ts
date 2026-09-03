/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from "vitest";
import {
  bisCoreAspectsFieldsProvider,
  bisCoreFieldsProvider,
  createBisCoreFieldsProviders,
} from "../../../content/extensions/biscore/BisCoreFieldsProviders.js";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentTarget } from "../../../content/ContentTarget.js";

type Contribution = NonNullable<Awaited<ReturnType<typeof bisCoreFieldsProvider.getContribution>>>;

const BASE_ELEMENT_PATHS = [
  ["BisCore.ElementHasLinks"],
  ["BisCore.ElementGroupsMembers", "BisCore.ElementHasLinks"],
  ["BisCore.ModelContainsElements", "BisCore.ModelModelsElement", "BisCore.ElementHasLinks"],
];

/** Builds an `ECSchemaProvider` stub whose `classDerivesFrom` reflects the given class hierarchy. */
function createImodelAccess(props?: {
  derivesFrom?: Record<string, string[]>;
  bisCoreVersion?: EC.SchemaVersion;
}): ECSchemaProvider {
  const derivesFrom = props?.derivesFrom ?? {};
  return {
    getSchema: async (name: string) => {
      if (name !== "BisCore" || !props?.bisCoreVersion) {
        return undefined;
      }
      return {
        name,
        version: props.bisCoreVersion,
        isHidden: false,
        getClass: () => undefined,
        getEnumeration: () => undefined,
        getKindOfQuantity: () => undefined,
        getPropertyCategory: () => undefined,
      };
    },
    classDerivesFrom: async (derived: string, base: string) =>
      derived === base || (derivesFrom[derived] ?? []).includes(base),
  };
}

function createTarget(primaryClass: EC.FullClassNameDotNotation): ContentTarget {
  return { primaryClass };
}

async function getContribution(
  imodelAccess: ECSchemaProvider,
  primaryClass: EC.FullClassNameDotNotation,
): Promise<Contribution | undefined> {
  return bisCoreFieldsProvider.getContribution({ imodelAccess, target: createTarget(primaryClass) });
}

async function getAspectsContribution(
  imodelAccess: ECSchemaProvider,
  primaryClass: EC.FullClassNameDotNotation,
): Promise<Contribution | undefined> {
  return bisCoreAspectsFieldsProvider.getContribution({ imodelAccess, target: createTarget(primaryClass) });
}

function getRelationshipPaths(contribution: Contribution) {
  return contribution.relatedProperties?.map((declaration) => declaration.path.map((step) => step.relationshipName));
}

function expectBaseElementPaths(contribution: Contribution): void {
  expect(getRelationshipPaths(contribution)).to.deep.equal(BASE_ELEMENT_PATHS);
}

describe("bisCoreFieldsProvider", () => {
  it("is not applied recursively, so its fields don't surface on nested content", () => {
    // The split from `bisCoreAspectsFieldsProvider` exists precisely so that links, external-source
    // information and type-definition fields stay on the direct content target. Opting this provider
    // into recursion would expand every descriptor containing a nested element (an element's link
    // would gain its own links, and so on) without failing any other assertion in this suite.
    expect(bisCoreFieldsProvider.applyRecursively).to.not.be.true;
  });

  it("does not contribute fields for a class unrelated to BisCore.Element", async () => {
    const contribution = await getContribution(createImodelAccess(), "TestSchema.NotAnElement");
    expect(contribution).to.be.undefined;
  });

  it("contributes all BisCore.Element fields", async () => {
    const contribution = await getContribution(createImodelAccess(), "BisCore.Element");
    expect(contribution).to.not.be.undefined;
    expectBaseElementPaths(contribution!);
    expect(contribution!.categories).to.deep.equal({
      source_information: { id: "source_information", label: "Source Information" },
      model_source: { id: "model_source", label: "Model Source", parentId: "source_information" },
    });

    const modelSourceLink = contribution!.relatedProperties![2];
    expect(modelSourceLink.properties).to.deep.equal([
      {
        stepIndex: 2,
        target: {
          select: { include: ["Url", "UserLabel"] },
          overrides: {
            Url: { label: "Path", categoryId: "model_source" },
            UserLabel: { label: "Name", categoryId: "model_source" },
          },
        },
      },
    ]);
  });

  it("contributes all BisCore.GeometricElement3d fields", async () => {
    const primaryClass = "TestSchema.MyGeometricElement3d";
    const contribution = await getContribution(
      createImodelAccess({ derivesFrom: { [primaryClass]: ["BisCore.Element", "BisCore.GeometricElement3d"] } }),
      primaryClass,
    );
    expect(contribution).to.not.be.undefined;
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ...BASE_ELEMENT_PATHS,
      ["BisCore.GeometricElement3dHasTypeDefinition"],
    ]);
  });

  it("contributes all BisCore.GeometricElement2d fields", async () => {
    const primaryClass = "TestSchema.MyGeometricElement2d";
    const contribution = await getContribution(
      createImodelAccess({ derivesFrom: { [primaryClass]: ["BisCore.Element", "BisCore.GeometricElement2d"] } }),
      primaryClass,
    );
    expect(contribution).to.not.be.undefined;
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ...BASE_ELEMENT_PATHS,
      ["BisCore.GeometricElement2dHasTypeDefinition"],
    ]);
  });

  it("contributes all BisCore.DrawingGraphic fields", async () => {
    const primaryClass = "TestSchema.MyDrawingGraphic";
    const contribution = await getContribution(
      createImodelAccess({
        derivesFrom: { [primaryClass]: ["BisCore.Element", "BisCore.GeometricElement2d", "BisCore.DrawingGraphic"] },
      }),
      primaryClass,
    );
    expect(contribution).to.not.be.undefined;
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ...BASE_ELEMENT_PATHS,
      ["BisCore.GeometricElement2dHasTypeDefinition"],
      ["BisCore.DrawingGraphicRepresentsElement"],
    ]);
  });

  it("contributes all BisCore.GraphicalElement3d fields", async () => {
    const primaryClass = "TestSchema.MyGraphicalElement3d";
    const contribution = await getContribution(
      createImodelAccess({
        derivesFrom: {
          [primaryClass]: ["BisCore.Element", "BisCore.GeometricElement3d", "BisCore.GraphicalElement3d"],
        },
      }),
      primaryClass,
    );
    expect(contribution).to.not.be.undefined;
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ...BASE_ELEMENT_PATHS,
      ["BisCore.GeometricElement3dHasTypeDefinition"],
      ["BisCore.GraphicalElement3dRepresentsElement"],
    ]);
  });

  it("adds source identifier fields at BisCore 1.0.2", async () => {
    const contribution = await getContribution(
      createImodelAccess({ bisCoreVersion: { read: 1, write: 0, minor: 2 } }),
      "BisCore.Element",
    );
    expect(contribution).to.not.be.undefined;
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ...BASE_ELEMENT_PATHS,
      ["BisCore.ElementOwnsMultiAspects"],
    ]);

    const identifier = contribution!.relatedProperties![3];
    expect(identifier.path[0].instanceFilter).to.deep.equal({ expression: "this.Kind <> 'Relationship'" });
    expect(identifier.properties).to.deep.equal([
      {
        stepIndex: 0,
        target: {
          select: { include: ["Identifier"] },
          overrides: { Identifier: { label: "Source Element ID", categoryId: "source_information" } },
        },
      },
    ]);
  });

  it("adds document and secondary-source fields at BisCore 1.0.13", async () => {
    const contribution = await getContribution(
      createImodelAccess({ bisCoreVersion: { read: 1, write: 0, minor: 13 } }),
      "BisCore.Element",
    );
    expect(contribution).to.not.be.undefined;
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ...BASE_ELEMENT_PATHS,
      ["BisCore.ElementOwnsMultiAspects"],
      ["BisCore.ElementOwnsMultiAspects", "BisCore.ElementIsFromSource", "BisCore.ExternalSourceIsInRepository"],
      [
        "BisCore.ElementOwnsMultiAspects",
        "BisCore.ElementIsFromSource",
        "BisCore.ExternalSourceGroupGroupsSources",
        "BisCore.ExternalSourceIsInRepository",
      ],
    ]);
    expect(contribution!.categories).to.deep.equal({
      source_information: { id: "source_information", label: "Source Information" },
      model_source: { id: "model_source", label: "Model Source", parentId: "source_information" },
      document_link: { id: "document_link", label: "Document Link", parentId: "source_information" },
      secondary_sources: { id: "secondary_sources", label: "Secondary Sources", parentId: "source_information" },
    });

    const documentLink = contribution!.relatedProperties![4];
    expect(documentLink.properties).to.deep.equal([
      {
        stepIndex: 2,
        target: {
          select: "all",
          defaultOverrides: { categoryId: "document_link" },
          overrides: { UserLabel: { label: "Name" }, Url: { label: "Path" }, Model: { hidden: true } },
        },
      },
    ]);
  });
});

describe("bisCoreAspectsFieldsProvider", () => {
  it("is applied recursively, so owned aspects also surface on nested content", () => {
    expect(bisCoreAspectsFieldsProvider.applyRecursively).to.be.true;
  });

  it("does not contribute fields for a class unrelated to BisCore.Element", async () => {
    const contribution = await getAspectsContribution(createImodelAccess(), "TestSchema.NotAnElement");
    expect(contribution).to.be.undefined;
  });

  it("contributes owned unique- and multi-aspect fields", async () => {
    const contribution = await getAspectsContribution(createImodelAccess(), "BisCore.Element");
    expect(contribution).to.not.be.undefined;
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ["BisCore.ElementOwnsUniqueAspect"],
      ["BisCore.ElementOwnsMultiAspects"],
    ]);
    expect(contribution!.relatedProperties!.map((declaration) => declaration.properties)).to.deep.equal([
      [{ stepIndex: 0, target: { select: "all" } }],
      [{ stepIndex: 0, target: { select: "all" } }],
    ]);
    expect(contribution!.categories).to.be.undefined;
  });

  it("excludes BisCore.ExternalSourceAspect from the generic owned-multi-aspect declaration at BisCore 1.0.2", async () => {
    // The `Identifier` property of `BisCore.ExternalSourceAspect` is contributed with its own label/category
    // override by the external-source-specific declaration of `bisCoreFieldsProvider`. Both declarations
    // resolve to the same `Element` -> `ExternalSourceAspect` path (instance filters don't participate in
    // field identity), so without excluding `ExternalSourceAspect` from the generic "all owned
    // multi-aspects" declaration, the two providers would produce one field with divergent metadata and
    // the label/category would be decided by provider priority rather than by intent.
    const contribution = await getAspectsContribution(
      createImodelAccess({ bisCoreVersion: { read: 1, write: 0, minor: 2 } }),
      "BisCore.Element",
    );
    expect(contribution).to.not.be.undefined;

    const genericMultiAspects = contribution!.relatedProperties![1];
    expect(genericMultiAspects.path[0].relationshipName).to.eq("BisCore.ElementOwnsMultiAspects");
    expect(genericMultiAspects.path[0].instanceFilter).to.deep.equal({
      expression: "this.ECClassId IS NOT (BisCore.ExternalSourceAspect)",
    });
  });

  it("does not exclude BisCore.ExternalSourceAspect from the generic owned-multi-aspect declaration below BisCore 1.0.2", async () => {
    const contribution = await getAspectsContribution(createImodelAccess(), "BisCore.Element");
    expect(contribution).to.not.be.undefined;

    const genericMultiAspects = contribution!.relatedProperties![1];
    expect(genericMultiAspects.path[0].relationshipName).to.eq("BisCore.ElementOwnsMultiAspects");
    expect(genericMultiAspects.path[0].instanceFilter).to.be.undefined;
  });
});

describe("createBisCoreFieldsProviders", () => {
  it("returns the aspects and the merged BisCore providers", () => {
    expect(createBisCoreFieldsProviders().map((provider) => provider.id)).to.deep.equal([
      "biscore-aspects_v1",
      "biscore-fields_v1",
    ]);
  });
});
