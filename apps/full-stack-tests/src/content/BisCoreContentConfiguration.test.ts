/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertDrawingCategory,
  insertDrawingGraphic,
  insertDrawingModelWithPartition,
  insertGroupInformationElement,
  insertGroupInformationModelWithPartition,
  insertPhysicalElement,
  insertPhysicalMaterial,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertPhysicalType,
  insertRepositoryLink,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { Code, IModel } from "@itwin/core-common";
import {
  createBisCoreContentConfiguration,
  createHiddenSchemaMembersDescriptorTransformer,
} from "@itwin/presentation-content";
import { buildTestIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { PropertyFieldValidators, validateVisibleFieldsAtPath } from "./DescriptorValidation.js";
import { buildDescriptor, createContentIModelAccess } from "./Utils.js";

import type { ElementAspectProps, ExternalSourceProps } from "@itwin/core-common";
import type { ContentConfiguration } from "@itwin/presentation-content";
import type { RelationshipPath } from "@itwin/presentation-shared";

/**
 * Composes the BisCore content configuration under test with the schema
 * hidden-properties transformer.
 */
function createConfig(): ContentConfiguration {
  const bisCore = createBisCoreContentConfiguration();
  return {
    imodelFieldsProviders: bisCore.imodelFieldsProviders,
    descriptorTransformers: [
      ...(bisCore.descriptorTransformers ?? []),
      createHiddenSchemaMembersDescriptorTransformer(),
    ],
  };
}

/**
 * `BisCore.RepositoryLink`'s *visible* property-field surface.
 */
function repositoryLinkFieldValidators(props: {
  category: string[];
  modelHidden?: boolean;
  userLabel?: string;
  url?: string;
}) {
  const { category, modelHidden = false, userLabel = "User Label", url = "URL" } = props;
  return [
    ...(modelHidden
      ? []
      : [
          PropertyFieldValidators.create({
            propertyClassName: "BisCore.Element",
            propertyName: "Model",
            label: "Model",
            category,
          }),
        ]),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.Element",
      propertyName: "CodeValue",
      label: "Code",
      category,
    }),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.Element",
      propertyName: "UserLabel",
      label: userLabel,
      category,
    }),
    PropertyFieldValidators.create({ propertyClassName: "BisCore.UrlLink", propertyName: "Url", label: url, category }),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.UrlLink",
      propertyName: "Description",
      label: "Description",
      category,
    }),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.RepositoryLink",
      propertyName: "Format",
      label: "Format",
      category,
    }),
  ];
}

/**
 * Some relationship roles (the model-source and secondary-source contributions) don't surface
 * `BisCore.RepositoryLink`'s full visible field set (see `repositoryLinkFieldValidators`) — only
 * `UserLabel` and `Url`, relabeled "Name"/"Path".
 */
function repositoryLinkNameAndPathValidators({ category }: { category: string[] }) {
  return [
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.Element",
      propertyName: "UserLabel",
      label: "Name",
      category,
    }),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.UrlLink",
      propertyName: "Url",
      label: "Path",
      category,
    }),
  ];
}

/**
 * `Generic.PhysicalType`'s *visible* property-field surface, categorized under "Physical Type".
 */
function physicalTypeFieldValidators() {
  const category = ["Physical Type"];
  return [
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.Element",
      propertyName: "Model",
      label: "Model",
      category,
    }),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.Element",
      propertyName: "CodeValue",
      label: "Code",
      category,
    }),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.Element",
      propertyName: "UserLabel",
      label: "User Label",
      category,
    }),
    PropertyFieldValidators.create({
      propertyClassName: "BisCore.PhysicalType",
      propertyName: "PhysicalMaterial",
      label: "Physical Material",
      category,
    }),
  ];
}

describe("Content", () => {
  describe("BisCore content configuration", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("adds owned unique- and multi-aspect fields, an element link, and the model-source repository link", async () => {
      const { imodelConnection, elementClassName, uniqueAspectClassName, multiAspectClassName } = await buildTestIModel(
        "OwnedAspectsAndLinks",
        async (imodel, testName) => {
          const schema = await importSchema(
            testName,
            imodel,
            `
            <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
            <ECEntityClass typeName="MyUniqueAspect">
              <BaseClass>bis:ElementUniqueAspect</BaseClass>
              <ECProperty propertyName="DesignedBy" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="MyMultiAspect">
              <BaseClass>bis:ElementMultiAspect</BaseClass>
              <ECProperty propertyName="Note" typeName="string" />
            </ECEntityClass>
          `,
          );

          return withEditTxn(imodel, (txn) => {
            const categoryKey = insertSpatialCategory({ txn, codeValue: "Category" });
            const partitionKey = insertPhysicalPartition({ txn, codeValue: "Model", parentId: IModel.rootSubjectId });
            const modelKey = insertPhysicalSubModel({ txn, modeledElementId: partitionKey.id });
            const elementKey = insertPhysicalElement({
              txn,
              userLabel: "Element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });

            txn.insertAspect({
              classFullName: schema.items.MyUniqueAspect.fullName,
              element: { id: elementKey.id },
              designedBy: "Jane Doe",
            } as ElementAspectProps);
            txn.insertAspect({
              classFullName: schema.items.MyMultiAspect.fullName,
              element: { id: elementKey.id },
              note: "First note",
            } as ElementAspectProps);

            // Direct element link (`BisCore.ElementHasLinks`).
            const elementLinkKey = insertRepositoryLink({
              txn,
              repositoryUrl: "https://example.com/element-link",
              repositoryLabel: "Element Link",
            });
            txn.insertRelationship({
              classFullName: "BisCore.ElementHasLinks",
              sourceId: elementKey.id,
              targetId: elementLinkKey.id,
            });

            // Model-source repository link: the model's modeled element (the partition) has a link.
            const modelSourceLinkKey = insertRepositoryLink({
              txn,
              repositoryUrl: "https://example.com/repo",
              repositoryLabel: "Repository",
            });
            txn.insertRelationship({
              classFullName: "BisCore.ElementHasLinks",
              sourceId: partitionKey.id,
              targetId: modelSourceLinkKey.id,
            });

            return {
              elementClassName: elementKey.className,
              uniqueAspectClassName: schema.items.MyUniqueAspect.fullName,
              multiAspectClassName: schema.items.MyMultiAspect.fullName,
            };
          });
        },
      );

      const imodelAccess = createContentIModelAccess(imodelConnection);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: elementClassName }],
        config: createConfig(),
      });

      const uniqueAspectPath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: uniqueAspectClassName,
          relationshipName: "BisCore.ElementOwnsUniqueAspect",
        },
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: uniqueAspectPath,
        expect: [
          PropertyFieldValidators.create({
            propertyClassName: uniqueAspectClassName,
            propertyName: "DesignedBy",
            label: "DesignedBy",
            category: ["MyUniqueAspect"],
          }),
        ],
      });

      const multiAspectPath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: multiAspectClassName,
          relationshipName: "BisCore.ElementOwnsMultiAspects",
        },
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: multiAspectPath,
        expect: [
          PropertyFieldValidators.create({
            propertyClassName: multiAspectClassName,
            propertyName: "Note",
            label: "Note",
            category: ["MyMultiAspect"],
          }),
        ],
      });

      const linkPath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: "BisCore.RepositoryLink",
          relationshipName: "BisCore.ElementHasLinks",
        },
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: linkPath,
        expect: repositoryLinkFieldValidators({ category: ["Repository Link"] }),
      });

      const modelSourcePath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: "BisCore.PhysicalModel",
          relationshipName: "BisCore.ModelContainsElements",
          relationshipReverse: true,
        },
        {
          sourceClassName: "BisCore.PhysicalModel",
          targetClassName: "BisCore.PhysicalPartition",
          relationshipName: "BisCore.ModelModelsElement",
        },
        {
          sourceClassName: "BisCore.PhysicalPartition",
          targetClassName: "BisCore.RepositoryLink",
          relationshipName: "BisCore.ElementHasLinks",
        },
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: modelSourcePath,
        expect: repositoryLinkNameAndPathValidators({ category: ["Source Information", "Model Source"] }),
      });
    });

    it("adds group-member link fields for elements referenced via ElementGroupsMembers", async () => {
      const { imodelConnection, elementClassName } = await buildTestIModel(async (imodel) => {
        return withEditTxn(imodel, (txn) => {
          const categoryKey = insertSpatialCategory({ txn, codeValue: "Category" });
          const partitionKey = insertPhysicalPartition({ txn, codeValue: "Model", parentId: IModel.rootSubjectId });
          const modelKey = insertPhysicalSubModel({ txn, modeledElementId: partitionKey.id });
          const elementKey = insertPhysicalElement({
            txn,
            userLabel: "Grouped Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });

          const groupModelKey = insertGroupInformationModelWithPartition({ txn, codeValue: "Groups" });
          const groupKey = insertGroupInformationElement({ txn, modelId: groupModelKey.id, userLabel: "Group" });
          txn.insertRelationship({
            classFullName: "BisCore.ElementGroupsMembers",
            sourceId: groupKey.id,
            targetId: elementKey.id,
          });

          const groupLinkKey = insertRepositoryLink({
            txn,
            repositoryUrl: "https://example.com/group-link",
            repositoryLabel: "Group Link",
          });
          txn.insertRelationship({
            classFullName: "BisCore.ElementHasLinks",
            sourceId: groupKey.id,
            targetId: groupLinkKey.id,
          });

          return { elementClassName: elementKey.className };
        });
      });

      const imodelAccess = createContentIModelAccess(imodelConnection);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: elementClassName }],
        config: createConfig(),
      });

      const groupLinkPath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: "Generic.Group",
          relationshipName: "BisCore.ElementGroupsMembers",
          relationshipReverse: true,
        },
        {
          sourceClassName: "Generic.Group",
          targetClassName: "BisCore.RepositoryLink",
          relationshipName: "BisCore.ElementHasLinks",
        },
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: groupLinkPath,
        expect: repositoryLinkFieldValidators({ category: ["Repository Link"] }),
      });
    });

    it("adds external-source identifier, document-link, and secondary-source fields under Source Information", async () => {
      const { imodelConnection, elementClassName } = await buildTestIModel(async (imodel) => {
        return withEditTxn(imodel, (txn) => {
          const categoryKey = insertSpatialCategory({ txn, codeValue: "Category" });
          const partitionKey = insertPhysicalPartition({ txn, codeValue: "Model", parentId: IModel.rootSubjectId });
          const modelKey = insertPhysicalSubModel({ txn, modeledElementId: partitionKey.id });
          const elementKey = insertPhysicalElement({
            txn,
            userLabel: "Sourced Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });

          // The aspect's direct source is a group of two external sources — this exercises both the
          // document-link (of the direct source) and secondary-sources (of every source in the group)
          // contributions in a single scenario.
          const groupRepositoryLink = insertRepositoryLink({
            txn,
            repositoryUrl: "https://example.com/group",
            repositoryLabel: "Group Source",
          });
          const groupSourceId = txn.insertElement({
            classFullName: "BisCore.ExternalSourceGroup",
            model: IModel.dictionaryId,
            code: Code.createEmpty(),
            repository: { id: groupRepositoryLink.id },
          } as ExternalSourceProps);

          const source1RepositoryLink = insertRepositoryLink({
            txn,
            repositoryUrl: "https://example.com/source1",
            repositoryLabel: "Source One",
          });
          const source1Id = txn.insertElement({
            classFullName: "BisCore.ExternalSource",
            model: IModel.dictionaryId,
            code: Code.createEmpty(),
            repository: { id: source1RepositoryLink.id },
          } as ExternalSourceProps);

          const source2RepositoryLink = insertRepositoryLink({
            txn,
            repositoryUrl: "https://example.com/source2",
            repositoryLabel: "Source Two",
          });
          const source2Id = txn.insertElement({
            classFullName: "BisCore.ExternalSource",
            model: IModel.dictionaryId,
            code: Code.createEmpty(),
            repository: { id: source2RepositoryLink.id },
          } as ExternalSourceProps);

          txn.insertRelationship({
            classFullName: "BisCore.ExternalSourceGroupGroupsSources",
            sourceId: groupSourceId,
            targetId: source1Id,
          });
          txn.insertRelationship({
            classFullName: "BisCore.ExternalSourceGroupGroupsSources",
            sourceId: groupSourceId,
            targetId: source2Id,
          });

          txn.insertAspect({
            classFullName: "BisCore.ExternalSourceAspect",
            kind: "ExternalSource",
            element: { id: elementKey.id },
            source: { id: groupSourceId },
            scope: { id: elementKey.id },
            identifier: "main-identifier",
          } as ElementAspectProps);

          return { elementClassName: elementKey.className };
        });
      });

      const imodelAccess = createContentIModelAccess(imodelConnection);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: elementClassName }],
        config: createConfig(),
      });

      const externalSourceAspectPath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: "BisCore.ExternalSourceAspect",
          relationshipName: "BisCore.ElementOwnsMultiAspects",
        },
      ];
      validateVisibleFieldsAtPath({ descriptor, path: externalSourceAspectPath, expect: [] });

      const documentLinkPath: RelationshipPath = [
        ...externalSourceAspectPath,
        {
          sourceClassName: "BisCore.ExternalSourceAspect",
          targetClassName: "BisCore.ExternalSourceGroup",
          relationshipName: "BisCore.ElementIsFromSource",
        },
        {
          sourceClassName: "BisCore.ExternalSourceGroup",
          targetClassName: "BisCore.RepositoryLink",
          relationshipName: "BisCore.ExternalSourceIsInRepository",
        },
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: documentLinkPath,
        expect: repositoryLinkFieldValidators({
          category: ["Source Information", "Document Link"],
          modelHidden: true,
          userLabel: "Name",
          url: "Path",
        }),
      });

      const secondarySourcesPath: RelationshipPath = [
        ...externalSourceAspectPath,
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
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: secondarySourcesPath,
        expect: repositoryLinkNameAndPathValidators({ category: ["Source Information", "Secondary Sources"] }),
      });
    });

    it("adds 3d type-definition fields, keeps the schema-provided PhysicalMaterial label, and hides internal DefinitionElement/TypeDefinitionElement properties", async () => {
      const { imodelConnection, elementClassName } = await buildTestIModel(async (imodel) => {
        return withEditTxn(imodel, (txn) => {
          const categoryKey = insertSpatialCategory({ txn, codeValue: "Category" });
          const partitionKey = insertPhysicalPartition({ txn, codeValue: "Model", parentId: IModel.rootSubjectId });
          const modelKey = insertPhysicalSubModel({ txn, modeledElementId: partitionKey.id });
          const materialKey = insertPhysicalMaterial({ txn, userLabel: "Material" });
          const typeKey = insertPhysicalType<{ physicalMaterial: { id: string } }>({
            txn,
            userLabel: "Type",
            physicalMaterial: { id: materialKey.id },
          });
          const elementKey = insertPhysicalElement({
            txn,
            userLabel: "Typed Element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
            typeDefinitionId: typeKey.id,
          });

          return { elementClassName: elementKey.className };
        });
      });

      const imodelAccess = createContentIModelAccess(imodelConnection);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: elementClassName }],
        config: createConfig(),
      });

      const typeDefinitionPath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: "Generic.PhysicalType",
          relationshipName: "BisCore.PhysicalElementIsOfType",
        },
      ];
      validateVisibleFieldsAtPath({ descriptor, path: typeDefinitionPath, expect: physicalTypeFieldValidators() });
    });

    it("adds owned aspect fields on nested content", async () => {
      const { imodelConnection, elementClassName, uniqueAspectClassName } = await buildTestIModel(
        "NestedOwnedAspects",
        async (imodel, testName) => {
          const schema = await importSchema(
            testName,
            imodel,
            `
            <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
            <ECEntityClass typeName="MyUniqueAspect">
              <BaseClass>bis:ElementUniqueAspect</BaseClass>
              <ECProperty propertyName="DesignedBy" typeName="string" />
            </ECEntityClass>
          `,
          );

          return withEditTxn(imodel, (txn) => {
            const categoryKey = insertSpatialCategory({ txn, codeValue: "Category" });
            const partitionKey = insertPhysicalPartition({ txn, codeValue: "Model", parentId: IModel.rootSubjectId });
            const modelKey = insertPhysicalSubModel({ txn, modeledElementId: partitionKey.id });
            const typeKey = insertPhysicalType({ txn, userLabel: "Type" });
            const elementKey = insertPhysicalElement({
              txn,
              userLabel: "Typed Element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              typeDefinitionId: typeKey.id,
            });

            // The aspect is owned by the element's *type definition*, which only enters content as a
            // related instance of the content target.
            txn.insertAspect({
              classFullName: schema.items.MyUniqueAspect.fullName,
              element: { id: typeKey.id },
              designedBy: "Jane Doe",
            } as ElementAspectProps);

            return {
              elementClassName: elementKey.className,
              uniqueAspectClassName: schema.items.MyUniqueAspect.fullName,
            };
          });
        },
      );

      const imodelAccess = createContentIModelAccess(imodelConnection);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: elementClassName }],
        config: createConfig(),
      });

      const nestedAspectPath: RelationshipPath = [
        {
          sourceClassName: elementClassName,
          targetClassName: "Generic.PhysicalType",
          relationshipName: "BisCore.PhysicalElementIsOfType",
        },
        {
          sourceClassName: "Generic.PhysicalType",
          targetClassName: uniqueAspectClassName,
          relationshipName: "BisCore.ElementOwnsUniqueAspect",
        },
      ];
      validateVisibleFieldsAtPath({
        descriptor,
        path: nestedAspectPath,
        expect: [
          PropertyFieldValidators.create({
            propertyClassName: uniqueAspectClassName,
            propertyName: "DesignedBy",
            label: "DesignedBy",
            category: ["Physical Type", "MyUniqueAspect"],
          }),
        ],
      });
    });

    it("adds 2d type-definition and DrawingGraphicRepresentsElement fields for a DrawingGraphic target", async () => {
      const { imodelConnection, drawingGraphicClassName } = await buildTestIModel(async (imodel) => {
        return withEditTxn(imodel, (txn) => {
          const spatialCategoryKey = insertSpatialCategory({ txn, codeValue: "Category" });
          const drawingCategoryKey = insertDrawingCategory({ txn, codeValue: "Drawing Category" });
          const partitionKey = insertPhysicalPartition({ txn, codeValue: "Model", parentId: IModel.rootSubjectId });
          const physicalModelKey = insertPhysicalSubModel({ txn, modeledElementId: partitionKey.id });
          const representedElementKey = insertPhysicalElement({
            txn,
            userLabel: "Represented Element",
            modelId: physicalModelKey.id,
            categoryId: spatialCategoryKey.id,
          });

          const typeKey = insertPhysicalType({ txn, userLabel: "Drawing Type" });
          const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "Drawing" });
          const drawingGraphicKey = insertDrawingGraphic<{ typeDefinition: { id: string; relClassName: string } }>({
            txn,
            userLabel: "Drawing Graphic",
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            typeDefinition: { id: typeKey.id, relClassName: "BisCore.GeometricElement2dHasTypeDefinition" },
          });
          txn.insertRelationship({
            classFullName: "BisCore.DrawingGraphicRepresentsElement",
            sourceId: drawingGraphicKey.id,
            targetId: representedElementKey.id,
          });

          return { drawingGraphicClassName: drawingGraphicKey.className };
        });
      });

      const imodelAccess = createContentIModelAccess(imodelConnection);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: drawingGraphicClassName }],
        config: createConfig(),
      });

      const typeDefinitionPath: RelationshipPath = [
        {
          sourceClassName: drawingGraphicClassName,
          targetClassName: "Generic.PhysicalType",
          relationshipName: "BisCore.GeometricElement2dHasTypeDefinition",
        },
      ];
      validateVisibleFieldsAtPath({ descriptor, path: typeDefinitionPath, expect: physicalTypeFieldValidators() });

      const representedElementPath: RelationshipPath = [
        {
          sourceClassName: drawingGraphicClassName,
          targetClassName: "Generic.PhysicalObject",
          relationshipName: "BisCore.DrawingGraphicRepresentsElement",
        },
      ];
      const category = ["Physical Object"];
      validateVisibleFieldsAtPath({
        descriptor,
        path: representedElementPath,
        expect: [
          PropertyFieldValidators.create({
            propertyClassName: "BisCore.Element",
            propertyName: "Model",
            label: "Model",
            category,
          }),
          PropertyFieldValidators.create({
            propertyClassName: "BisCore.Element",
            propertyName: "CodeValue",
            label: "Code",
            category,
          }),
          PropertyFieldValidators.create({
            propertyClassName: "BisCore.Element",
            propertyName: "UserLabel",
            label: "User Label",
            category,
          }),
          PropertyFieldValidators.create({
            propertyClassName: "BisCore.GeometricElement3d",
            propertyName: "Category",
            label: "Category",
            category,
          }),
          PropertyFieldValidators.create({
            propertyClassName: "BisCore.PhysicalElement",
            propertyName: "PhysicalMaterial",
            label: "Physical Material",
            category,
          }),
        ],
      });
    });
  });
});
