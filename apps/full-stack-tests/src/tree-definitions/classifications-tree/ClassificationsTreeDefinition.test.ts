/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createClassificationsTree } from "@itwin/presentation-tree-definitions";
import { initialize, terminate } from "../../IntegrationTests.js";
import { collect, createIModelAccess } from "../Common.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { buildIModel } from "../IModelUtils.js";
import {
  importClassificationSchema,
  insertClassification,
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
    async function createClassificationsTreeProvider(
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
        using provider = await createClassificationsTreeProvider(imodelConnection, {
          rootClassificationSystemCode: systemCode,
        });

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
      using provider = await createClassificationsTreeProvider(imodelConnection, { rootClassificationSystemCode });

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
      using provider = await createClassificationsTreeProvider(imodelConnection, { rootClassificationSystemCode });

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

    describe("excludedElementClassNames", () => {
      it.each(["cold", "warm"])(
        "does not give classifications children through unrelated included elements in the same category with a %s cache",
        async (cacheState) => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, async (txn) => {
              await importClassificationSchema(imodel);

              const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
              const table = insertClassificationTable({
                txn,
                parentId: system.id,
                codeValue: "TestClassificationTable",
              });
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
          const imodelAccess = createIModelAccess(imodelConnection);
          const tree = createClassificationsTree({
            imodelAccess,
            hierarchyConfig: {
              rootClassificationSystemCode,
              elements: { excludedClasses: ["Generic.PhysicalObject"] },
            },
          });
          if (cacheState === "warm") {
            // Searching loads the classification cache shared with the hierarchy definition.
            await collect(tree.createInstanceKeyPaths({ targetItems: [keys.classification] }));
          }
          using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: tree.definition });

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
        },
      );

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
        using provider = await createClassificationsTreeProvider(imodelConnection, {
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
        using provider = await createClassificationsTreeProvider(imodelConnection, {
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
        using provider = await createClassificationsTreeProvider(imodelConnection, {
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
        using provider = await createClassificationsTreeProvider(imodelConnection, {
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
        using provider = await createClassificationsTreeProvider(imodelConnection, {
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
        using provider = await createClassificationsTreeProvider(imodelConnection, {
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
