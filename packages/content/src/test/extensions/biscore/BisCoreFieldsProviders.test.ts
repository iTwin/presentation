/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  createBisCoreAspectsFieldsProvider,
  createBisCoreFieldsProvider,
  DOCUMENT_LINK_CATEGORY_ID,
  MODEL_SOURCE_CATEGORY_ID,
  SECONDARY_SOURCES_CATEGORY_ID,
  SOURCE_INFORMATION_CATEGORY_ID,
} from "../../../content/extensions/biscore/BisCoreFieldsProviders.js";
import { DEFAULT_BIS_CORE_LOCALIZED_STRINGS } from "../../../content/extensions/biscore/BisCoreLocalizedStrings.js";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentTarget } from "../../../content/ContentTarget.js";
import type { FieldsProviderContribution } from "../../../content/extensions/IModelFieldsProvider.js";

const BASE_ELEMENT_PATHS = [
  ["BisCore.ElementHasLinks"],
  ["BisCore.ModelContainsElements", "BisCore.ModelModelsElement", "BisCore.ElementHasLinks"],
  ["BisCore.ElementGroupsMembers"],
  ["BisCore.ElementGroupsMembers", "BisCore.ElementHasLinks"],
];

/** Type-definition and represented-element declarations, contributed after every other declaration. */
const TYPE_DEFINITION_AND_REPRESENTED_ELEMENT_STEPS = [
  ["BisCore.GeometricElement3dHasTypeDefinition", "BisCore.GeometricElement3d"],
  ["BisCore.GraphicalElement3dRepresentsElement", "BisCore.GraphicalElement3d"],
  ["BisCore.GeometricElement2dHasTypeDefinition", "BisCore.GeometricElement2d"],
  ["BisCore.DrawingGraphicRepresentsElement", "BisCore.DrawingGraphic"],
];
const TYPE_DEFINITION_AND_REPRESENTED_ELEMENT_PATHS = TYPE_DEFINITION_AND_REPRESENTED_ELEMENT_STEPS.map(
  ([relationshipName]) => [relationshipName],
);

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
    getHiddenClassesTree: async () => [],
  };
}

function createTarget(primaryClass: EC.FullClassNameDotNotation): ContentTarget {
  return { primaryClass };
}

function getRelationshipPaths(contribution: FieldsProviderContribution) {
  return contribution.relatedProperties?.map((declaration) => declaration.path.map((step) => step.relationshipName));
}

function expectBaseElementPaths(contribution: FieldsProviderContribution): void {
  expect(getRelationshipPaths(contribution)).to.deep.equal([
    ...BASE_ELEMENT_PATHS,
    ...TYPE_DEFINITION_AND_REPRESENTED_ELEMENT_PATHS,
  ]);
}

describe("bisCoreFieldsProvider", () => {
  const bisCoreFieldsProvider = createBisCoreFieldsProvider(DEFAULT_BIS_CORE_LOCALIZED_STRINGS);

  async function getContribution(
    imodelAccess: ECSchemaProvider,
    primaryClass: EC.FullClassNameDotNotation,
  ): Promise<FieldsProviderContribution | undefined> {
    return bisCoreFieldsProvider.getContribution({ imodelAccess, target: createTarget(primaryClass) });
  }

  it("is not applied recursively, so its fields don't surface on nested content", () => {
    // The split from `bisCoreAspectsFieldsProvider` exists precisely so that links, external-source
    // information and type-definition fields stay on the direct content target. Opting this provider
    // into recursion would expand every descriptor containing a nested element (an element's link
    // would gain its own links, and so on) without failing any other assertion in this suite.
    expect(bisCoreFieldsProvider.applyRecursively).not.toBe(true);
  });

  it("does not contribute fields for a class unrelated to BisCore.Element", async () => {
    const contribution = await getContribution(createImodelAccess(), "TestSchema.NotAnElement");
    expect(contribution).toBeUndefined();
  });

  it("contributes all BisCore.Element fields", async () => {
    const contribution = await getContribution(createImodelAccess(), "BisCore.Element");
    expect(contribution).toBeDefined();
    expectBaseElementPaths(contribution!);
    expect(Object.keys(contribution!.categories ?? {})).to.have.members([
      SOURCE_INFORMATION_CATEGORY_ID,
      MODEL_SOURCE_CATEGORY_ID,
    ]);
  });

  it.each<EC.FullClassNameDotNotation>([
    "BisCore.Element",
    "TestSchema.MyGeometricElement3d",
    "TestSchema.MyDrawingGraphic",
  ])(
    "contributes type-definition and represented-element declarations starting at their classes for %s",
    async (primaryClass) => {
      // Source resolution skips declarations unrelated to the target and limits those declared for its
      // subclasses to their instances.
      const contribution = await getContribution(
        createImodelAccess({ derivesFrom: { [primaryClass]: ["BisCore.Element"] } }),
        primaryClass,
      );
      const declarations = contribution!.relatedProperties!.slice(BASE_ELEMENT_PATHS.length);
      expect(
        declarations.map((declaration) => [declaration.path[0].relationshipName, declaration.path[0].sourceClassName]),
      ).to.deep.equal(TYPE_DEFINITION_AND_REPRESENTED_ELEMENT_STEPS);
    },
  );

  it("adds source identifier fields at BisCore 1.0.2", async () => {
    const contribution = await getContribution(
      createImodelAccess({ bisCoreVersion: { read: 1, write: 0, minor: 2 } }),
      "BisCore.Element",
    );
    expect(contribution).toBeDefined();
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ...BASE_ELEMENT_PATHS,
      ["BisCore.ElementOwnsMultiAspects"],
      ...TYPE_DEFINITION_AND_REPRESENTED_ELEMENT_PATHS,
    ]);

    // The `Kind <> 'Relationship'` filter excludes synchronization-only aspects from the identifier
    // declaration — a behavioral detail worth its own assertion, unlike the label/category metadata
    // below, which full-stack tests already verify end-to-end.
    const identifier = contribution!.relatedProperties![BASE_ELEMENT_PATHS.length];
    expect(identifier.path[0].instanceFilter).to.deep.equal({ expression: "this.Kind <> 'Relationship'" });
  });

  it("adds document and secondary-source fields at BisCore 1.0.13", async () => {
    const contribution = await getContribution(
      createImodelAccess({ bisCoreVersion: { read: 1, write: 0, minor: 13 } }),
      "BisCore.Element",
    );
    expect(contribution).toBeDefined();
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
      ...TYPE_DEFINITION_AND_REPRESENTED_ELEMENT_PATHS,
    ]);
    expect(Object.keys(contribution!.categories ?? {})).to.have.members([
      SOURCE_INFORMATION_CATEGORY_ID,
      MODEL_SOURCE_CATEGORY_ID,
      DOCUMENT_LINK_CATEGORY_ID,
      SECONDARY_SOURCES_CATEGORY_ID,
    ]);
  });
});

describe("bisCoreAspectsFieldsProvider", () => {
  const bisCoreAspectsFieldsProvider = createBisCoreAspectsFieldsProvider();

  async function getAspectsContribution(
    imodelAccess: ECSchemaProvider,
    primaryClass: EC.FullClassNameDotNotation,
  ): Promise<FieldsProviderContribution | undefined> {
    return bisCoreAspectsFieldsProvider.getContribution({ imodelAccess, target: createTarget(primaryClass) });
  }

  it("is applied recursively, so owned aspects also surface on nested content", () => {
    expect(bisCoreAspectsFieldsProvider.applyRecursively).toBe(true);
  });

  it("does not contribute fields for a class unrelated to BisCore.Element", async () => {
    const contribution = await getAspectsContribution(createImodelAccess(), "TestSchema.NotAnElement");
    expect(contribution).toBeUndefined();
  });

  it("contributes owned unique- and multi-aspect fields", async () => {
    const contribution = await getAspectsContribution(createImodelAccess(), "BisCore.Element");
    expect(contribution).toBeDefined();
    expect(getRelationshipPaths(contribution!)).to.deep.equal([
      ["BisCore.ElementOwnsUniqueAspect"],
      ["BisCore.ElementOwnsMultiAspects"],
    ]);
    expect(contribution!.categories).toBeUndefined();
  });

  it("excludes BisCore.ExternalSourceAspect from the generic owned-multi-aspect declaration at BisCore 1.0.2", async () => {
    // The `Identifier` property of `BisCore.ExternalSourceAspect` is contributed with its own label/category
    // override by the external-source-specific declaration of `bisCoreFieldsProvider`. Without excluding
    // `ExternalSourceAspect` from the generic "all owned multi-aspects" declaration, the differing path
    // filters would give the generic and specialized fields separate identities and surface the property
    // twice with different presentation metadata.
    const contribution = await getAspectsContribution(
      createImodelAccess({ bisCoreVersion: { read: 1, write: 0, minor: 2 } }),
      "BisCore.Element",
    );
    expect(contribution).toBeDefined();

    const genericMultiAspects = contribution!.relatedProperties![1];
    expect(genericMultiAspects.path[0].relationshipName).to.eq("BisCore.ElementOwnsMultiAspects");
    expect(genericMultiAspects.path[0].instanceFilter).to.deep.equal({
      expression: "this.ECClassId IS NOT (BisCore.ExternalSourceAspect)",
    });
  });

  it("does not exclude BisCore.ExternalSourceAspect from the generic owned-multi-aspect declaration below BisCore 1.0.2", async () => {
    const contribution = await getAspectsContribution(createImodelAccess(), "BisCore.Element");
    expect(contribution).toBeDefined();

    const genericMultiAspects = contribution!.relatedProperties![1];
    expect(genericMultiAspects.path[0].relationshipName).to.eq("BisCore.ElementOwnsMultiAspects");
    expect(genericMultiAspects.path[0].instanceFilter).toBeUndefined();
  });
});
