/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineIModelFieldsProvider } from "@itwin/presentation-content";

import type { ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";

const elementClassName = "BisCore.Element";

interface PropertyOverrides {
  label?: string;
  categoryId?: string;
  hidden?: boolean;
}

interface RelatedPropertiesDeclaration {
  path: RelationshipPath;
  properties?: Array<{
    stepIndex: number;
    target?: {
      select: "all" | { include: string[] };
      defaultOverrides?: PropertyOverrides;
      overrides?: Record<string, PropertyOverrides>;
    };
  }>;
}

/**
 * Translates the Element-related content modifiers from presentation-backend's supplemental
 * `BisCore` ruleset into a presentation-content fields provider.
 */
export const bisCoreContentCustomization = defineIModelFieldsProvider({
  id: "biscore-content-customization_v1",
  async getContribution({ imodelAccess, target }) {
    if (target.primaryClass !== elementClassName) {
      return undefined;
    }

    const bisCoreSchema = await imodelAccess.getSchema("BisCore");
    return {
      relatedProperties: [
        ...bisCoreElementRelatedProperties,
        ...(isBisCoreVersionAtLeast(bisCoreSchema, { read: 1, write: 0, minor: 2 })
          ? externalSourceAspectIdentifierProperties
          : []),
        ...(isBisCoreVersionAtLeast(bisCoreSchema, { read: 1, write: 0, minor: 13 })
          ? externalSourceAspectRepositoryProperties
          : []),
      ],
      categories: {
        source_information: { id: "source_information", label: "Source Information" },
        model_source: { id: "model_source", label: "Model Source", parentId: "source_information" },
        secondary_sources: { id: "secondary_sources", label: "Secondary Sources", parentId: "source_information" },
        document_link: { id: "document_link", label: "Document Link", parentId: "source_information" },
      },
    };
  },
});

const bisCoreElementRelatedProperties: RelatedPropertiesDeclaration[] = [
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ElementOwnsUniqueAspect",
        targetClassName: "BisCore.ElementAspect",
      },
    ],
  },
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ElementOwnsMultiAspects",
        targetClassName: "BisCore.ElementAspect",
      },
    ],
  },
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ElementHasLinks",
        targetClassName: "BisCore.LinkElement",
      },
    ],
  },
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ElementGroupsMembers",
        targetClassName: "BisCore.GroupInformationElement",
        relationshipReverse: true,
      },
      {
        sourceClassName: "BisCore.GroupInformationElement",
        relationshipName: "BisCore.ElementHasLinks",
        targetClassName: "BisCore.LinkElement",
      },
    ],
  },
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ModelContainsElements",
        targetClassName: "BisCore.Model",
        relationshipReverse: true,
      },
      {
        sourceClassName: "BisCore.Model",
        relationshipName: "BisCore.ModelModelsElement",
        targetClassName: "BisCore.ISubModeledElement",
      },
      {
        sourceClassName: "BisCore.ISubModeledElement",
        relationshipName: "BisCore.ElementHasLinks",
        targetClassName: "BisCore.RepositoryLink",
      },
    ],
    properties: [
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
    ],
  },
];

const externalSourceAspectIdentifierProperties: RelatedPropertiesDeclaration[] = [
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ElementOwnsMultiAspects",
        targetClassName: "BisCore.ExternalSourceAspect",
        instanceFilter: { expression: 'this.Kind <> "Relationship"' },
      },
    ],
    properties: [
      {
        stepIndex: 0,
        target: {
          select: { include: ["Identifier"] },
          overrides: { Identifier: { label: "Source Element ID", categoryId: "source_information" } },
        },
      },
    ],
  },
];

const externalSourceAspectRepositoryProperties: RelatedPropertiesDeclaration[] = [
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ElementOwnsMultiAspects",
        targetClassName: "BisCore.ExternalSourceAspect",
        instanceFilter: { expression: 'this.Kind <> "Relationship"' },
      },
      {
        sourceClassName: "BisCore.ExternalSourceAspect",
        relationshipName: "BisCore.ElementIsFromSource",
        targetClassName: "BisCore.ExternalSource",
      },
      {
        sourceClassName: "BisCore.ExternalSource",
        relationshipName: "BisCore.ExternalSourceIsInRepository",
        targetClassName: "BisCore.RepositoryLink",
      },
    ],
    properties: [
      {
        stepIndex: 2,
        target: {
          select: "all",
          defaultOverrides: { categoryId: "document_link" },
          overrides: { UserLabel: { label: "Name" }, Url: { label: "Path" }, Model: { hidden: true } },
        },
      },
    ],
  },
  {
    path: [
      {
        sourceClassName: elementClassName,
        relationshipName: "BisCore.ElementOwnsMultiAspects",
        targetClassName: "BisCore.ExternalSourceAspect",
        instanceFilter: { expression: 'this.Kind <> "Relationship"' },
      },
      {
        sourceClassName: "BisCore.ExternalSourceAspect",
        relationshipName: "BisCore.ElementIsFromSource",
        targetClassName: "BisCore.ExternalSourceGroup",
      },
      {
        sourceClassName: "BisCore.ExternalSourceGroup",
        relationshipName: "BisCore.ExternalSourceGroupGroupsSources",
        targetClassName: "BisCore.ExternalSource",
      },
      {
        sourceClassName: "BisCore.ExternalSource",
        relationshipName: "BisCore.ExternalSourceIsInRepository",
        targetClassName: "BisCore.RepositoryLink",
      },
    ],
    properties: [
      {
        stepIndex: 3,
        target: {
          select: { include: ["UserLabel", "Url"] },
          overrides: {
            UserLabel: { label: "Name", categoryId: "secondary_sources" },
            Url: { label: "Path", categoryId: "secondary_sources" },
          },
        },
      },
    ],
  },
];

function isBisCoreVersionAtLeast(
  schema: Awaited<ReturnType<ECSchemaProvider["getSchema"]>>,
  minimum: { read: number; write: number; minor: number },
): boolean {
  if (!schema) {
    return false;
  }

  if (schema.version.write !== minimum.write) {
    return schema.version.write > minimum.write;
  }
  if (schema.version.read !== minimum.read) {
    return schema.version.read > minimum.read;
  }
  return schema.version.minor >= minimum.minor;
}
