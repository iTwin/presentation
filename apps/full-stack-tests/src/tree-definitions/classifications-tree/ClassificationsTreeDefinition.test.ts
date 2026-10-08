/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createClassificationsTree } from "@itwin/presentation-tree-definitions";
import { initialize, terminate } from "../../IntegrationTests.js";
import { collect, createIModelAccess } from "../Common.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { buildIModel, importHiddenElementClasses, insertGeometricModelWithPartition } from "../IModelUtils.js";
import {
  CATEGORY_SYMBOLIZES_CLASSIFICATION_RELATIONSHIP_SCHEMA,
  importCategorySymbolizesClassificationSchema,
  importClassificationSchema,
  insertCategorySymbolizesClassificationRelationship,
  insertClassification,
  insertClassificationIsSymbolizedByCategoryRelationship,
  insertClassificationSystem,
  insertClassificationTable,
  insertElementHasClassificationsRelationship,
} from "./Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { ClassificationsTreeHierarchyConfiguration } from "@itwin/presentation-tree-definitions/internal";

const rootClassificationSystemCode = "TestClassificationSystem";

describe("Classifications tree", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  describe.each(["cold", "warm"] as const)("Hierarchy definition (%s cache)", (cacheState) => {
    async function createProvider(
      imodel: IModelConnection,
      hierarchyConfig: ClassificationsTreeHierarchyConfiguration,
    ) {
      const imodelAccess = createIModelAccess(imodel);
      const tree = createClassificationsTree({ imodelAccess, hierarchyConfig });
      if (cacheState === "warm") {
        // Label search populates the same ID cache used by the hierarchy definition.
        await collect(tree.createInstanceKeyPaths({ label: "no matching labels", limit: "unbounded" }));
      }
      return createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: tree.definition });
    }

    describe.each(["category", "classification"] as const)("Custom category relationship (%s source)", (source) => {
      const relationship: NonNullable<
        ClassificationsTreeHierarchyConfiguration["classificationToCategoriesRelationshipSpecification"]
      > = {
        fullClassName:
          source === "category"
            ? `${CATEGORY_SYMBOLIZES_CLASSIFICATION_RELATIONSHIP_SCHEMA}.CategorySymbolizesClassification`
            : `${CATEGORY_SYMBOLIZES_CLASSIFICATION_RELATIONSHIP_SCHEMA}.ClassificationIsSymbolizedByCategory`,
        source,
      };
      const insertCategoryRelationship =
        source === "category"
          ? insertCategorySymbolizesClassificationRelationship
          : insertClassificationIsSymbolizedByCategoryRelationship;

      it.each(["default", "custom"] as const)("loads elements using the %s relationship", async (relationshipType) => {
        await using buildIModelResult = await buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          await importCategorySymbolizesClassificationSchema(imodel);
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "clTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "cl" });
            const elementsModel = insertPhysicalModelWithPartition({ txn, codeValue: "m" });
            const category = insertSpatialCategory({ txn, codeValue: "cat" });
            const elementInHierarchy = insertPhysicalElement({
              txn,
              modelId: elementsModel.id,
              categoryId: category.id,
              userLabel: "1-shared element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: elementInHierarchy.id,
              classificationId: classification.id,
            });
            insertCategoryRelationship({ txn, categoryId: category.id, classificationId: classification.id });
            const categoryFromCustomRelationship = insertSpatialCategory({ txn, codeValue: "cat custom" });
            const elementFromCustomRelationship = insertPhysicalElement({
              txn,
              modelId: elementsModel.id,
              categoryId: categoryFromCustomRelationship.id,
              userLabel: "2-custom element",
            });
            insertCategoryRelationship({
              txn,
              categoryId: categoryFromCustomRelationship.id,
              classificationId: classification.id,
            });
            const categoryFromDefaultRelationship = insertSpatialCategory({ txn, codeValue: "cat default" });
            const elementFromDefaultRelationship = insertPhysicalElement({
              txn,
              modelId: elementsModel.id,
              categoryId: categoryFromDefaultRelationship.id,
              userLabel: "3-default element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: elementFromDefaultRelationship.id,
              classificationId: classification.id,
            });
            return {
              table,
              classification,
              elementInHierarchy,
              elementFromCustomRelationship,
              elementFromDefaultRelationship,
            };
          });
        });
        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          classificationToCategoriesRelationshipSpecification: relationshipType === "custom" ? relationship : undefined,
        });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: [
                    keys.elementInHierarchy,
                    relationshipType === "custom"
                      ? keys.elementFromCustomRelationship
                      : keys.elementFromDefaultRelationship,
                  ].map((element) =>
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [element],
                      supportsFiltering: true,
                      children: false,
                    }),
                  ),
                }),
              ],
            }),
          ],
        });
      });

      it("keeps classifications without eligible category elements as leaves", async () => {
        await using buildIModelResult = await buildIModel(async (imodel, testSchema) => {
          await importClassificationSchema(imodel);
          await importCategorySymbolizesClassificationSchema(imodel);
          const hiddenClasses = await importHiddenElementClasses(imodel);
          const excludedClass = testSchema.items.SubModelablePhysicalObject.fullName;
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "clTable" });
            const elementsModel = insertPhysicalModelWithPartition({ txn, codeValue: "m" });
            const unrelatedCategory = insertSpatialCategory({ txn, codeValue: "unrelated" });
            const unrelatedParent = insertPhysicalElement({
              txn,
              modelId: elementsModel.id,
              categoryId: unrelatedCategory.id,
            });
            const classifications = [
              "child-only",
              "empty",
              "excluded",
              "hidden",
              "private-category",
              "private-model",
              "template-model",
            ].map((variant) => {
              const classification = insertClassification({ txn, modelId: table.id, codeValue: variant });
              const category = insertSpatialCategory({
                txn,
                codeValue: variant,
                isPrivate: variant === "private-category",
              });
              insertCategoryRelationship({ txn, classificationId: classification.id, categoryId: category.id });
              if (variant !== "empty") {
                const model =
                  variant === "private-model" || variant === "template-model"
                    ? insertGeometricModelWithPartition({
                        txn,
                        codeValue: variant,
                        isPrivate: variant === "private-model",
                        isTemplate: variant === "template-model",
                      })
                    : elementsModel;
                insertPhysicalElement({
                  txn,
                  modelId: model.id,
                  categoryId: category.id,
                  classFullName:
                    variant === "excluded"
                      ? excludedClass
                      : variant === "hidden"
                        ? hiddenClasses.hiddenClass
                        : "Generic.PhysicalObject",
                  parentId: variant === "child-only" ? unrelatedParent.id : undefined,
                });
              }
              return classification;
            });
            return { table, classifications, excludedClass };
          });
        });
        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          classificationToCategoriesRelationshipSpecification: relationship,
          elements: { excludedClasses: [keys.excludedClass] },
        });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: keys.classifications.map((classification) =>
                NodeValidators.createForInstanceNode({
                  instanceKeys: [classification],
                  supportsFiltering: true,
                  children: false,
                }),
              ),
            }),
          ],
        });
      });

      it.each(["label", "targetItems"] as const)("searches nested category elements using %s", async (input) => {
        await using buildIModelResult = await buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          await importCategorySymbolizesClassificationSchema(imodel);
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "clTable" });
            const parentClassification = insertClassification({ txn, modelId: table.id, codeValue: "parent cl" });
            const classification = insertClassification({
              txn,
              modelId: table.id,
              parentId: parentClassification.id,
              codeValue: "cl",
            });
            const elementsModel = insertPhysicalModelWithPartition({ txn, codeValue: "m" });
            const category = insertSpatialCategory({ txn, codeValue: "cat" });
            insertCategoryRelationship({ txn, categoryId: category.id, classificationId: classification.id });
            const element = insertPhysicalElement({ txn, modelId: elementsModel.id, categoryId: category.id });
            const child = insertPhysicalElement({
              txn,
              modelId: elementsModel.id,
              categoryId: category.id,
              parentId: element.id,
              userLabel: "category-linked leaf",
            });
            const unrelatedCategory = insertSpatialCategory({ txn, codeValue: "unrelated" });
            const unrelatedElement = insertPhysicalElement({
              txn,
              modelId: elementsModel.id,
              categoryId: unrelatedCategory.id,
              userLabel: "directly-linked element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: unrelatedElement.id,
              classificationId: classification.id,
            });
            return { table, parentClassification, classification, element, child, unrelatedElement };
          });
        });
        const { imodelConnection, ...keys } = buildIModelResult;
        const tree = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: {
            rootClassificationSystemCode,
            classificationToCategoriesRelationshipSpecification: relationship,
          },
        });
        if (cacheState === "warm") {
          await collect(tree.createInstanceKeyPaths({ label: "no matching labels", limit: "unbounded" }));
        }
        expect(
          await collect(
            tree.createInstanceKeyPaths(
              input === "label" ? { label: "category-linked leaf" } : { targetItems: [keys.child] },
            ),
          ),
        ).toEqual([
          {
            path: [
              keys.table,
              keys.parentClassification,
              keys.classification,
              { ...keys.element, className: "BisCore.GeometricElement3d" },
              { ...keys.child, className: "BisCore.GeometricElement3d" },
            ],
            target: keys.child.id,
          },
        ]);
        expect(
          await collect(
            tree.createInstanceKeyPaths(
              input === "label" ? { label: "directly-linked element" } : { targetItems: [keys.unrelatedElement] },
            ),
          ),
        ).toEqual([]);
      });
    });

    it("excludes private and template model elements", async () => {
      await using buildIModelResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, async (txn) => {
          await importClassificationSchema(imodel);
          const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
          const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "table" });
          const excludedClassification = insertClassification({
            txn,
            modelId: table.id,
            codeValue: "excluded classification",
          });
          const sharedClassification = insertClassification({
            txn,
            modelId: table.id,
            codeValue: "shared classification",
          });
          const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          const element = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id });
          insertElementHasClassificationsRelationship({
            txn,
            elementId: element.id,
            classificationId: sharedClassification.id,
          });
          for (const flag of ["isPrivate", "isTemplate"] as const) {
            const hiddenModel = insertGeometricModelWithPartition({ txn, codeValue: flag, [flag]: true });
            const hiddenElement = insertPhysicalElement({ txn, modelId: hiddenModel.id, categoryId: category.id });
            for (const classification of [sharedClassification, excludedClassification]) {
              insertElementHasClassificationsRelationship({
                txn,
                elementId: hiddenElement.id,
                classificationId: classification.id,
              });
            }
          }
          return { table, excludedClassification, sharedClassification, element };
        }),
      );
      const { imodelConnection, ...keys } = buildIModelResult;
      using provider = await createProvider(imodelConnection, { rootClassificationSystemCode });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.table],
            supportsFiltering: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.excludedClassification],
                supportsFiltering: true,
                children: false,
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.sharedClassification],
                supportsFiltering: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.element],
                    supportsFiltering: true,
                    children: false,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it.each([rootClassificationSystemCode, "Owner's Classification"])(
      "loads classifications' hierarchy without elements for system code %s",
      async (systemCode) => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: systemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const parentClassification = insertClassification({
              txn,
              modelId: table.id,
              codeValue: "TestParentClassification",
            });
            const childClassification = insertClassification({
              txn,
              modelId: table.id,
              parentId: parentClassification.id,
              codeValue: "TestChildClassification",
            });

            return { table, parentClassification, childClassification };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, { rootClassificationSystemCode: systemCode });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.parentClassification],
                  supportsFiltering: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childClassification],
                      supportsFiltering: true,
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      },
    );

    it("loads classification table with private root and non-private nested classification", async () => {
      await using buildIModelResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, async (txn) => {
          await importClassificationSchema(imodel);

          const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
          const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
          const classification = insertClassification({
            txn,
            modelId: table.id,
            codeValue: "RootClassification",
            isPrivate: true,
          });
          insertClassification({
            txn,
            modelId: table.id,
            parentId: classification.id,
            codeValue: "PublicChildClassification",
          });
          return { table };
        }),
      );

      const { imodelConnection, ...keys } = buildIModelResult;
      using provider = await createProvider(imodelConnection, { rootClassificationSystemCode });

      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.table],
            supportsFiltering: true,
            children: false,
          }),
        ],
      });
    });

    it("loads classification elements", async () => {
      await using buildIModelResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, async (txn) => {
          await importClassificationSchema(imodel);

          const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
          const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
          const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });

          const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
          const spatialCategory = insertSpatialCategory({ txn, codeValue: "Test spatial category" });
          const parentPhysicalElement = insertPhysicalElement({
            txn,
            modelId: physicalModel.id,
            categoryId: spatialCategory.id,
            codeValue: "Parent 3d element",
          });
          const childPhysicalElement = insertPhysicalElement({
            txn,
            modelId: physicalModel.id,
            categoryId: spatialCategory.id,
            parentId: parentPhysicalElement.id,
            codeValue: "Child 3d element",
          });
          insertElementHasClassificationsRelationship({
            txn,
            elementId: parentPhysicalElement.id,
            classificationId: classification.id,
          });

          return { table, classification, parentPhysicalElement, childPhysicalElement };
        }),
      );

      const { imodelConnection, ...keys } = buildIModelResult;
      using provider = await createProvider(imodelConnection, { rootClassificationSystemCode });

      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.table],
            supportsFiltering: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.classification],
                supportsFiltering: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.parentPhysicalElement],
                    supportsFiltering: true,
                    children: [
                      NodeValidators.createForInstanceNode({
                        instanceKeys: [keys.childPhysicalElement],
                        supportsFiltering: true,
                        children: false,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    describe("Hidden element classes and schemas", () => {
      it("treats classifications with only hidden elements as childless", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          const hiddenClassNames = await importHiddenElementClasses(imodel);
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });

            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "PhysicalModel" });
            const category = insertSpatialCategory({ txn, codeValue: "Category" });
            insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: category.id,
              userLabel: "visible unclassified element in the same category",
            });
            for (const [variant, classFullName] of Object.entries(hiddenClassNames)) {
              const hiddenClassifiedElement = insertPhysicalElement({
                txn,
                classFullName,
                modelId: physicalModel.id,
                categoryId: category.id,
                userLabel: `hidden classified element (${variant})`,
              });
              insertPhysicalElement({
                txn,
                modelId: physicalModel.id,
                categoryId: category.id,
                parentId: hiddenClassifiedElement.id,
                userLabel: `visible descendant of hidden element (${variant})`,
              });
              insertElementHasClassificationsRelationship({
                txn,
                elementId: hiddenClassifiedElement.id,
                classificationId: classification.id,
              });
            }

            return { table, classification };
          });
        });

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, { rootClassificationSystemCode });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("hides hidden classified elements while preserving visible elements", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          const hiddenClassNames = await importHiddenElementClasses(imodel);
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "PhysicalModel" });
            const category = insertSpatialCategory({ txn, codeValue: "Category" });
            const visibleClassifiedElement = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: category.id,
              userLabel: "visible classified element",
            });
            for (const [variant, classFullName] of Object.entries(hiddenClassNames)) {
              insertPhysicalElement({
                txn,
                classFullName,
                modelId: physicalModel.id,
                categoryId: category.id,
                parentId: visibleClassifiedElement.id,
                userLabel: `hidden child element (${variant})`,
              });
            }
            const visibleChildElement = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: category.id,
              parentId: visibleClassifiedElement.id,
              userLabel: "visible child element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: visibleClassifiedElement.id,
              classificationId: classification.id,
            });
            return { table, classification, visibleClassifiedElement, visibleChildElement };
          });
        });

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, { rootClassificationSystemCode });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.visibleClassifiedElement],
                      supportsFiltering: true,
                      children: [
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.visibleChildElement],
                          supportsFiltering: true,
                          children: false,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("excludedElementClassNames", () => {
      it("does not give classifications children through unrelated included elements in the same category", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });
            const model = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
            const category = insertSpatialCategory({ txn, codeValue: "Shared category" });
            const excludedElement = insertPhysicalElement({
              txn,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Excluded classified element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: excludedElement.id,
              classificationId: classification.id,
            });
            insertPhysicalElement({
              txn,
              classFullName: "Generic.SpatialLocation",
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Unrelated included element",
            });
            return { table, classification };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          elements: { excludedClasses: ["Generic.PhysicalObject"] },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("does not filter out elements when they don't belong to any of the excluded classes", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });

            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Test spatial category" });
            const element = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element.id,
              classificationId: classification.id,
            });

            return { table, classification, element };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          elements: { excludedClasses: ["BisCore.GeometricElement2d"] },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.element],
                      supportsFiltering: true,
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("filters out elements of excluded classes", async () => {
        await using buildIModelResult = await buildIModel(async (imodel, testSchema) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });

            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Test spatial category" });
            const excludedElement = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Excluded element",
            });
            const keptElement = insertPhysicalElement({
              txn,
              classFullName: testSchema.items.SubModelablePhysicalObject.fullName,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Kept element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: excludedElement.id,
              classificationId: classification.id,
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: keptElement.id,
              classificationId: classification.id,
            });

            return { table, classification, keptElement };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          elements: { excludedClasses: ["Generic.PhysicalObject"] },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.keptElement],
                      supportsFiltering: true,
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("filters out elements of classes derived from excluded classes", async () => {
        await using buildIModelResult = await buildIModel(async (imodel, testSchema) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });

            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Test spatial category" });
            const excludedElement = insertPhysicalElement({
              txn,
              classFullName: testSchema.items.SubModelablePhysicalObject.fullName,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Excluded element",
            });
            const keptElement = insertPhysicalElement({
              txn,
              classFullName: "Generic.SpatialLocation",
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Kept element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: excludedElement.id,
              classificationId: classification.id,
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: keptElement.id,
              classificationId: classification.id,
            });

            return { table, classification, keptElement };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        // Omitting the base class should filter out elements of all derived classes due to polymorphic class exclusion.
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          elements: { excludedClasses: ["BisCore.PhysicalElement"] },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.keptElement],
                      supportsFiltering: true,
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("shows classification with no children when it contains only excluded elements", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });

            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Test spatial category" });
            const excludedElement = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Excluded element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: excludedElement.id,
              classificationId: classification.id,
            });

            return { table, classification };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          elements: { excludedClasses: ["Generic.PhysicalObject"] },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("sets hasChildren to false when classified element contains only excluded child elements", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });

            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Test spatial category" });
            const parentElement = insertPhysicalElement({
              txn,
              classFullName: "Generic.SpatialLocation",
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Parent element",
            });
            insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              parentId: parentElement.id,
              codeValue: "Excluded child element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: parentElement.id,
              classificationId: classification.id,
            });

            return { table, classification, parentElement };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          elements: { excludedClasses: ["Generic.PhysicalObject"] },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.parentElement],
                      supportsFiltering: true,
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("filters out child elements of excluded classes", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "TestClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "TestClassification" });

            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Test physical model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Test spatial category" });
            const parentElement = insertPhysicalElement({
              txn,
              classFullName: "Generic.SpatialLocation",
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Parent element",
            });
            insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              parentId: parentElement.id,
              codeValue: "Excluded child element",
            });
            const keptChildElement = insertPhysicalElement({
              txn,
              classFullName: "Generic.SpatialLocation",
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              parentId: parentElement.id,
              codeValue: "Kept child element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: parentElement.id,
              classificationId: classification.id,
            });

            return { table, classification, parentElement, keptChildElement };
          }),
        );

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, {
          rootClassificationSystemCode,
          elements: { excludedClasses: ["Generic.PhysicalObject"] },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.table],
              supportsFiltering: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.classification],
                  supportsFiltering: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.parentElement],
                      supportsFiltering: true,
                      children: [
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.keptChildElement],
                          supportsFiltering: true,
                          children: false,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });
    });
  });
});
