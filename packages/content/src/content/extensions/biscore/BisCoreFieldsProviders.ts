/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineIModelFieldsProvider } from "../IModelFieldsProvider.js";
import { isBisCoreSchemaAtLeast } from "./BisCoreUtils.js";

import type { ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentTarget } from "../../ContentTarget.js";
import type { CategoryDefinition } from "../../model/Category.js";
import type { IModelFieldsProvider, RelatedPropertiesDeclaration } from "../IModelFieldsProvider.js";

/** A single step of a `RelationshipPath` (not separately exported by `@itwin/presentation-shared`). */
type RelationshipPathStep = RelationshipPath[number];

/** Category id/label constants shared by contributions that nest fields under "Source Information". */
const SOURCE_INFORMATION_CATEGORY_ID = "source_information";
const MODEL_SOURCE_CATEGORY_ID = "model_source";
const SECONDARY_SOURCES_CATEGORY_ID = "secondary_sources";
const DOCUMENT_LINK_CATEGORY_ID = "document_link";

function createSourceInformationCategory(): CategoryDefinition {
  return { id: SOURCE_INFORMATION_CATEGORY_ID, label: "Source Information" };
}
function createModelSourceCategory(): CategoryDefinition {
  return { id: MODEL_SOURCE_CATEGORY_ID, label: "Model Source", parentId: SOURCE_INFORMATION_CATEGORY_ID };
}
function createSecondarySourcesCategory(): CategoryDefinition {
  return { id: SECONDARY_SOURCES_CATEGORY_ID, label: "Secondary Sources", parentId: SOURCE_INFORMATION_CATEGORY_ID };
}
function createDocumentLinkCategory(): CategoryDefinition {
  return { id: DOCUMENT_LINK_CATEGORY_ID, label: "Document Link", parentId: SOURCE_INFORMATION_CATEGORY_ID };
}

/**
 * Builds `BisCore:Element`'s owned aspects (`ElementOwnsUniqueAspect` and `ElementOwnsMultiAspects`)
 * related properties declarations.
 *
 * The generic `ElementOwnsMultiAspects` → `ElementMultiAspect` declaration excludes
 * `BisCore.ExternalSourceAspect` instances (`BisCore` ≥ 1.0.2) — that aspect's `Identifier` property
 * is contributed with its own label/category override by `createExternalSourceContribution`, and both
 * declarations resolve to the same `Element` → `ExternalSourceAspect` path (instance filters don't
 * participate in field identity). Without the exclusion, the two would produce one field with
 * divergent metadata whenever an element owns an `ExternalSourceAspect`, leaving the label and
 * category to be picked by fields-provider priority rather than by intent.
 *
 * The exclusion is intentionally polymorphic, with two deliberate consequences:
 * - `ExternalSourceAspect` instances with `Kind = 'Relationship'` surface no fields at all — they
 *   describe a synchronization relationship rather than the element itself, so their properties are
 *   not meaningful element content.
 * - Properties declared by `ExternalSourceAspect` subclasses don't surface either — a non-polymorphic
 *   exclusion would reintroduce the `Identifier` metadata collision for those subclasses, since the
 *   external-source declaration resolves its `ExternalSourceAspect` target polymorphically.
 *
 * The exclusion applies on nested content too, even though the external-source declarations don't
 * reach there: a provider's contribution shape can't depend on whether it's being applied to the
 * direct target or to a nested anchor, and suppressing this internal synchronization aspect
 * everywhere is preferable to surfacing it in some places only.
 */
async function createAspectRelatedProperties(
  imodelAccess: ECSchemaProvider,
  target: ContentTarget,
): Promise<RelatedPropertiesDeclaration[]> {
  const excludeExternalSourceAspect = await isBisCoreSchemaAtLeast(imodelAccess, "1.0.2");
  return [
    {
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.ElementUniqueAspect",
          relationshipName: "BisCore.ElementOwnsUniqueAspect",
        },
      ],
      cardinalityHint: "one",
      properties: [{ stepIndex: 0, target: { select: "all" } }],
    },
    {
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.ElementMultiAspect",
          relationshipName: "BisCore.ElementOwnsMultiAspects",
          ...(excludeExternalSourceAspect
            ? { instanceFilter: { expression: "this.ECClassId IS NOT (BisCore.ExternalSourceAspect)" } }
            : undefined),
        },
      ],
      cardinalityHint: "many",
      properties: [{ stepIndex: 0, target: { select: "all" } }],
    },
  ];
}

/**
 * Builds `BisCore:Element` links (`ElementHasLinks`), group-member links (`ElementGroupsMembers` →
 * `ElementHasLinks`), and the model-source repository link (`ModelContainsElements` →
 * `ModelModelsElement` → `ElementHasLinks`, renamed into the "Model Source" category) related
 * properties declarations and their categories.
 */
function createLinksContribution(target: ContentTarget): {
  relatedProperties: RelatedPropertiesDeclaration[];
  categories: Record<CategoryDefinition["id"], CategoryDefinition>;
} {
  const relatedProperties: RelatedPropertiesDeclaration[] = [
    // Links directly associated with the element.
    {
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.LinkElement",
          relationshipName: "BisCore.ElementHasLinks",
        },
      ],
      cardinalityHint: "many",
    },
    // Links of the information-reference elements that group this element as a member.
    {
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.GroupInformationElement",
          relationshipName: "BisCore.ElementGroupsMembers",
          relationshipReverse: true,
        },
        {
          sourceClassName: "BisCore.GroupInformationElement",
          targetClassName: "BisCore.LinkElement",
          relationshipName: "BisCore.ElementHasLinks",
        },
      ],
      cardinalityHint: "many",
    },
    // The repository link of the model the element resides in — surfaced as "Model Source".
    {
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.Model",
          relationshipName: "BisCore.ModelContainsElements",
          relationshipReverse: true,
        },
        {
          sourceClassName: "BisCore.Model",
          targetClassName: "BisCore.Element",
          relationshipName: "BisCore.ModelModelsElement",
        },
        {
          sourceClassName: "BisCore.Element",
          targetClassName: "BisCore.RepositoryLink",
          relationshipName: "BisCore.ElementHasLinks",
        },
      ],
      // The element's model and its modeled element are 1:1, but the final `ElementHasLinks` step
      // may reach multiple repository links.
      cardinalityHint: "many",
      properties: [
        {
          stepIndex: 2,
          target: {
            select: { include: ["Url", "UserLabel"] },
            // EC property names are PascalCase; disable the naming-convention rule for these keys.
            /* eslint-disable @typescript-eslint/naming-convention */
            overrides: {
              Url: { label: "Path", categoryId: MODEL_SOURCE_CATEGORY_ID },
              UserLabel: { label: "Name", categoryId: MODEL_SOURCE_CATEGORY_ID },
            },
            /* eslint-enable @typescript-eslint/naming-convention */
          },
        },
      ],
    },
  ];
  return {
    relatedProperties,
    categories: {
      [SOURCE_INFORMATION_CATEGORY_ID]: createSourceInformationCategory(),
      [MODEL_SOURCE_CATEGORY_ID]: createModelSourceCategory(),
    },
  };
}

/**
 * Builds `BisCore:Element`'s external-source information related properties declarations and
 * categories: the owning `ExternalSourceAspect`'s source identifier (`BisCore` ≥ 1.0.2), and the
 * source's document link and, for group sources, its secondary sources' document links (`BisCore` ≥
 * 1.0.13). All fields nest under "Source Information".
 */
async function createExternalSourceContribution(
  imodelAccess: ECSchemaProvider,
  target: ContentTarget,
): Promise<{
  relatedProperties: RelatedPropertiesDeclaration[];
  categories: Record<CategoryDefinition["id"], CategoryDefinition>;
}> {
  const relatedProperties: RelatedPropertiesDeclaration[] = [];
  const categories: Record<CategoryDefinition["id"], CategoryDefinition> = {};

  const externalSourceAspectStep: RelationshipPathStep = {
    sourceClassName: target.primaryClass,
    targetClassName: "BisCore.ExternalSourceAspect",
    relationshipName: "BisCore.ElementOwnsMultiAspects",
    instanceFilter: { expression: "this.Kind <> 'Relationship'" },
  };

  if (await isBisCoreSchemaAtLeast(imodelAccess, "1.0.2")) {
    categories[SOURCE_INFORMATION_CATEGORY_ID] = createSourceInformationCategory();
    relatedProperties.push({
      path: [externalSourceAspectStep],
      cardinalityHint: "many",
      properties: [
        {
          stepIndex: 0,
          target: {
            select: { include: ["Identifier"] },
            // EC property names are PascalCase; disable the naming-convention rule for this key.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            overrides: { Identifier: { label: "Source Element ID", categoryId: SOURCE_INFORMATION_CATEGORY_ID } },
          },
        },
      ],
    });
  }

  if (await isBisCoreSchemaAtLeast(imodelAccess, "1.0.13")) {
    categories[SOURCE_INFORMATION_CATEGORY_ID] = createSourceInformationCategory();
    categories[DOCUMENT_LINK_CATEGORY_ID] = createDocumentLinkCategory();
    categories[SECONDARY_SOURCES_CATEGORY_ID] = createSecondarySourcesCategory();

    // The source's own document link (repository link).
    relatedProperties.push({
      path: [
        externalSourceAspectStep,
        {
          sourceClassName: "BisCore.ExternalSourceAspect",
          targetClassName: "BisCore.ExternalSource",
          relationshipName: "BisCore.ElementIsFromSource",
        },
        {
          sourceClassName: "BisCore.ExternalSource",
          targetClassName: "BisCore.RepositoryLink",
          relationshipName: "BisCore.ExternalSourceIsInRepository",
        },
      ],
      // Each aspect reaches at most one source/repository, but an element may own multiple
      // `ExternalSourceAspect`s (the first step is 0..*), same as the identifier declaration above.
      cardinalityHint: "many",
      properties: [
        {
          stepIndex: 2,
          target: {
            select: "all",
            defaultOverrides: { categoryId: DOCUMENT_LINK_CATEGORY_ID },
            // EC property names are PascalCase; disable the naming-convention rule for these keys.
            /* eslint-disable @typescript-eslint/naming-convention */
            overrides: { UserLabel: { label: "Name" }, Url: { label: "Path" }, Model: { hidden: true } },
            /* eslint-enable @typescript-eslint/naming-convention */
          },
        },
      ],
    });

    // When the source is a group, the document links of every source in the group.
    relatedProperties.push({
      path: [
        externalSourceAspectStep,
        {
          sourceClassName: "BisCore.ExternalSourceAspect",
          targetClassName: "BisCore.ExternalSourceGroup",
          relationshipName: "BisCore.ElementIsFromSource",
        },
        {
          sourceClassName: "BisCore.ExternalSourceGroup",
          targetClassName: "BisCore.ExternalSource",
          relationshipName: "BisCore.ExternalSourceGroupGroupsSources",
        },
        {
          sourceClassName: "BisCore.ExternalSource",
          targetClassName: "BisCore.RepositoryLink",
          relationshipName: "BisCore.ExternalSourceIsInRepository",
        },
      ],
      cardinalityHint: "many",
      properties: [
        {
          stepIndex: 3,
          target: {
            select: { include: ["UserLabel", "Url"] },
            // EC property names are PascalCase; disable the naming-convention rule for these keys.
            /* eslint-disable @typescript-eslint/naming-convention */
            overrides: {
              UserLabel: { label: "Name", categoryId: SECONDARY_SOURCES_CATEGORY_ID },
              Url: { label: "Path", categoryId: SECONDARY_SOURCES_CATEGORY_ID },
            },
            /* eslint-enable @typescript-eslint/naming-convention */
          },
        },
      ],
    });
  }

  return { relatedProperties, categories };
}

/**
 * Builds 2d/3d type-definition related properties declarations (`GeometricElement3dHasTypeDefinition`
 * / `GeometricElement2dHasTypeDefinition`) and represented-element declarations
 * (`DrawingGraphicRepresentsElement` / `GraphicalElement3dRepresentsElement`).
 */
async function createTypeDefinitionAndRepresentedElementRelatedProperties(
  imodelAccess: ECSchemaProvider,
  target: ContentTarget,
): Promise<RelatedPropertiesDeclaration[]> {
  const relatedProperties: RelatedPropertiesDeclaration[] = [];

  if (await imodelAccess.classDerivesFrom(target.primaryClass, "BisCore.GeometricElement3d")) {
    relatedProperties.push({
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.TypeDefinitionElement",
          relationshipName: "BisCore.GeometricElement3dHasTypeDefinition",
        },
      ],
      cardinalityHint: "one",
    });
  }
  if (await imodelAccess.classDerivesFrom(target.primaryClass, "BisCore.GeometricElement2d")) {
    relatedProperties.push({
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.TypeDefinitionElement",
          relationshipName: "BisCore.GeometricElement2dHasTypeDefinition",
        },
      ],
      cardinalityHint: "one",
    });
  }
  if (await imodelAccess.classDerivesFrom(target.primaryClass, "BisCore.DrawingGraphic")) {
    relatedProperties.push({
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.Element",
          relationshipName: "BisCore.DrawingGraphicRepresentsElement",
        },
      ],
      cardinalityHint: "many",
    });
  }
  if (await imodelAccess.classDerivesFrom(target.primaryClass, "BisCore.GraphicalElement3d")) {
    relatedProperties.push({
      path: [
        {
          sourceClassName: target.primaryClass,
          targetClassName: "BisCore.Element",
          relationshipName: "BisCore.GraphicalElement3dRepresentsElement",
        },
      ],
      cardinalityHint: "many",
    });
  }

  return relatedProperties;
}

/**
 * The iModel fields provider contributing `BisCore:Element`'s owned aspect fields
 * (`ElementOwnsUniqueAspect` and `ElementOwnsMultiAspects`).
 *
 * Kept separate from `bisCoreFieldsProvider` because owned aspects are the only BisCore contribution
 * that applies on nested content, and `applyRecursively` is a provider-level (not
 * declaration-level) opt-in. Owned aspects therefore surface on the content target itself and on
 * every nested anchor — the related instances whose full property set some declaration surfaces,
 * e.g. an element's link, its type definition, an element it represents or its external source's
 * document link. Declarations picking only a few named properties of their target (the model-source
 * and secondary-source links) don't anchor nested content, so those elements surface no aspect
 * fields.
 *
 * @internal
 */
export const bisCoreAspectsFieldsProvider: IModelFieldsProvider = defineIModelFieldsProvider({
  id: "biscore-aspects_v1",
  applyRecursively: true,
  async getContribution({ imodelAccess, target }) {
    if (!(await imodelAccess.classDerivesFrom(target.primaryClass, "BisCore.Element"))) {
      return undefined;
    }
    return { relatedProperties: await createAspectRelatedProperties(imodelAccess, target) };
  },
});

/**
 * The iModel fields provider contributing BisCore-specific fields for any target deriving from
 * `BisCore.Element`: element and group-member links plus the model-source repository link,
 * external-source information (source identifier and, on newer `BisCore` versions, document links
 * and secondary sources), and 2d/3d type-definition and represented-element fields.
 *
 * None of these contributions apply on nested content — they're only contributed for the direct
 * content target. Owned aspect fields, which do apply on nested content, are contributed by
 * `bisCoreAspectsFieldsProvider` instead.
 *
 * @internal
 */
export const bisCoreFieldsProvider: IModelFieldsProvider = defineIModelFieldsProvider({
  id: "biscore-fields_v1",
  async getContribution({ imodelAccess, target }) {
    if (!(await imodelAccess.classDerivesFrom(target.primaryClass, "BisCore.Element"))) {
      return undefined;
    }

    const linksContribution = createLinksContribution(target);
    const externalSourceContribution = await createExternalSourceContribution(imodelAccess, target);

    const relatedProperties: RelatedPropertiesDeclaration[] = [
      ...linksContribution.relatedProperties,
      ...externalSourceContribution.relatedProperties,
      ...(await createTypeDefinitionAndRepresentedElementRelatedProperties(imodelAccess, target)),
    ];

    return {
      relatedProperties,
      categories: { ...linksContribution.categories, ...externalSourceContribution.categories },
    };
  },
});

/**
 * Creates the set of `IModelFieldsProvider` implementations contributing BisCore-specific fields.
 *
 * @internal
 */
export function createBisCoreFieldsProviders(): IModelFieldsProvider[] {
  return [bisCoreAspectsFieldsProvider, bisCoreFieldsProvider];
}
