/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { of } from "rxjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { createIModelHierarchyProvider, createMergedIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createClassificationsTree, createClassificationsTreeIdsProvider } from "@itwin/presentation-tree-definitions";
import {
  type ClassificationsTreeHierarchyConfiguration,
  toPromise,
} from "@itwin/presentation-tree-definitions/internal";
import { createChangedIModels } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { collect, createIModelAccess } from "../Common.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { buildIModel, importHiddenClassesSchemas, insertGeometricModelWithPartition } from "../IModelUtils.js";
import {
  importClassificationSchema,
  importHiddenClassificationClasses,
  insertClassification,
  insertClassificationSystem,
  insertClassificationTable,
  insertElementHasClassificationsRelationship,
} from "./Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";

const rootClassificationSystemCode = "TestClassificationSystem";

describe("Classifications tree", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("uses the supplied classifications provider for hierarchy and search", async () => {
    await using imodel = await buildIModel(async (db) =>
      withEditTxn(db, async (txn) => {
        await importClassificationSchema(db);
        const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
        const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "table" });
        insertClassification({ txn, modelId: table.id, codeValue: "classification" });
        return { table };
      }),
    );
    const imodelAccess = createIModelAccess(imodel.imodelConnection);
    const hierarchyConfig = { rootClassificationSystemCode };
    const idsProvider = createClassificationsTreeIdsProvider({ imodelAccess, hierarchyConfig });
    await toPromise(idsProvider.getAllClassifications());
    const hierarchyGetter = vi.spyOn(idsProvider, "getDirectChildClassifications").mockReturnValue(of([]));
    const searchGetter = vi.spyOn(idsProvider, "getAllClassifications").mockReturnValue(of([]));
    const queryReader = vi.spyOn(imodelAccess, "createQueryReader");
    const tree = createClassificationsTree({ imodelAccess, hierarchyConfig, idsProvider });
    using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: tree.hierarchyDefinition });

    const [tableNode] = await collect(provider.getNodes({ parentNode: undefined }));
    expect(tableNode).toBeDefined();
    expect(await collect(provider.getNodes({ parentNode: tableNode }))).toEqual([]);
    expect(hierarchyGetter).toHaveBeenCalledWith([imodel.table.id]);
    expect(await tree.createSearchTree({ label: "classification" })).toEqual([]);
    expect(searchGetter).toHaveBeenCalled();
    expect(queryReader.mock.calls.map(([, options]) => options?.restartToken)).not.toContainEqual(
      expect.stringMatching(/^(ClassificationsTreeIdsProvider|ElementModelCategoriesProvider)\//),
    );
  });

  describe("two iModel versions", () => {
    async function createVersions() {
      return createChangedIModels(
        async (db) =>
          withEditTxn(db, async (txn) => {
            await importClassificationSchema(db);
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "table" });
            const parent = insertClassification({ txn, modelId: table.id, codeValue: "parent" });
            const child = insertClassification({
              txn,
              modelId: table.id,
              parentId: parent.id,
              codeValue: "base child",
            });
            return { table, parent, child };
          }),
        async (db, base) =>
          withEditTxn(db, (txn) => {
            txn.deleteElement(base.child.id);
            const child = insertClassification({
              txn,
              modelId: base.table.id,
              parentId: base.parent.id,
              codeValue: "new child",
            });
            return { table: base.table, parent: base.parent, child };
          }),
      );
    }

    it("uses separate cached providers in a merged classifications hierarchy", async () => {
      await using versions = await createVersions();
      const hierarchyConfig = { rootClassificationSystemCode };
      const imodels = [versions.base, versions.changeset1].map(({ imodelConnection }) => {
        const imodelAccess = createIModelAccess(imodelConnection);
        const idsProvider = createClassificationsTreeIdsProvider({ imodelAccess, hierarchyConfig });
        return { imodelAccess, idsProvider };
      });
      const [base, changed] = imodels;
      expect(versions.base.imodelConnection.iModelId).toBe(versions.changeset1.imodelConnection.iModelId);
      expect(base.imodelAccess.imodelKey).not.toBe(changed.imodelAccess.imodelKey);
      await Promise.all(imodels.map(async ({ idsProvider }) => toPromise(idsProvider.getAllClassifications())));
      const childGetters = imodels.map(({ idsProvider }) => {
        expect(idsProvider.state).toBe("loaded");
        return vi.spyOn(idsProvider, "getDirectChildClassifications");
      });
      const trees = imodels.map(({ imodelAccess, idsProvider }) => ({
        imodelAccess,
        tree: createClassificationsTree({ imodelAccess, hierarchyConfig, idsProvider }),
      }));
      using provider = createMergedIModelHierarchyProvider({
        imodels,
        getHierarchyDefinition: ({ imodelAccess }) =>
          trees.find((entry) => entry.imodelAccess === imodelAccess)!.tree.hierarchyDefinition,
      });

      const tables = await collect(provider.getNodes({ parentNode: undefined }));
      expect(tables).toMatchObject([
        {
          key: {
            type: "instances",
            instanceKeys: expect.arrayContaining(
              imodels.map(({ imodelAccess }) => ({ ...versions.base.table, imodelKey: imodelAccess.imodelKey })),
            ),
          },
        },
      ]);
      const parents = await collect(provider.getNodes({ parentNode: tables[0] }));
      expect(parents).toMatchObject([
        {
          key: {
            type: "instances",
            instanceKeys: expect.arrayContaining(
              imodels.map(({ imodelAccess }) => ({ ...versions.base.parent, imodelKey: imodelAccess.imodelKey })),
            ),
          },
        },
      ]);
      const children = await collect(provider.getNodes({ parentNode: parents[0] }));
      expect(children).toMatchObject([
        {
          label: "base child",
          key: { instanceKeys: [{ ...versions.base.child, imodelKey: base.imodelAccess.imodelKey }] },
        },
        {
          label: "new child",
          key: { instanceKeys: [{ ...versions.changeset1.child, imodelKey: changed.imodelAccess.imodelKey }] },
        },
      ]);
      for (const childGetter of childGetters) {
        expect(childGetter).toHaveBeenCalledWith([versions.base.table.id]);
        expect(childGetter).toHaveBeenCalledWith([versions.base.parent.id]);
      }
    });

    it.each(["cold", "warm"] as const)(
      "uses default providers for multiple versions with %s caches",
      async (cacheState) => {
        await using versions = await createVersions();
        const imodels = [versions.base, versions.changeset1].map(({ imodelConnection }) => ({
          imodelAccess: createIModelAccess(imodelConnection),
        }));
        const trees = imodels.map(({ imodelAccess }) => ({
          imodelAccess,
          tree: createClassificationsTree({ imodelAccess, hierarchyConfig: { rootClassificationSystemCode } }),
        }));
        if (cacheState === "warm") {
          for (const { tree } of trees) {
            await collect(tree.createInstanceKeyPaths({ label: "", limit: "unbounded" }));
          }
        }
        using provider = createMergedIModelHierarchyProvider({
          imodels,
          getHierarchyDefinition: ({ imodelAccess }) =>
            trees.find((entry) => entry.imodelAccess === imodelAccess)!.tree.hierarchyDefinition,
        });
        const tables = await collect(provider.getNodes({ parentNode: undefined }));
        expect(tables).toHaveLength(1);
        const parents = await collect(provider.getNodes({ parentNode: tables[0] }));
        expect(parents).toHaveLength(1);
        expect(await collect(provider.getNodes({ parentNode: parents[0] }))).toMatchObject([
          {
            label: "base child",
            key: { instanceKeys: [{ ...versions.base.child, imodelKey: imodels[0].imodelAccess.imodelKey }] },
          },
          {
            label: "new child",
            key: { instanceKeys: [{ ...versions.changeset1.child, imodelKey: imodels[1].imodelAccess.imodelKey }] },
          },
        ]);
        expect(await trees[0].tree.createSearchTree({ label: "new child" })).toEqual([]);
        expect(await collect(trees[1].tree.createInstanceKeyPaths({ label: "new child" }))).toEqual([
          {
            path: [versions.changeset1.table, versions.changeset1.parent, versions.changeset1.child],
            target: versions.changeset1.child.id,
          },
        ]);
      },
    );
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
      return createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: tree.hierarchyDefinition });
    }

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
          const hiddenClassNames = await importHiddenClassesSchemas({ imodel, baseClass: "BisCore.PhysicalElement" });
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
          const hiddenClassNames = await importHiddenClassesSchemas({ imodel, baseClass: "BisCore.PhysicalElement" });
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

    describe("Hidden classification classes and schemas", () => {
      it("hides classification tables and classifications of hidden classes", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          const hiddenClassNames = await importHiddenClassificationClasses(imodel);
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "visible table" });
            const classification = insertClassification({
              txn,
              modelId: table.id,
              codeValue: "visible classification",
            });
            for (const [variant, classFullName] of Object.entries(hiddenClassNames.tables)) {
              const hiddenTable = insertClassificationTable({
                txn,
                classFullName,
                parentId: system.id,
                codeValue: `hidden table (${variant})`,
              });
              insertClassification({
                txn,
                modelId: hiddenTable.id,
                codeValue: `classification in hidden table (${variant})`,
              });
            }
            for (const [variant, classFullName] of Object.entries(hiddenClassNames.classifications)) {
              const hiddenClassification = insertClassification({
                txn,
                classFullName,
                modelId: table.id,
                codeValue: `hidden classification (${variant})`,
              });
              insertClassification({
                txn,
                modelId: table.id,
                parentId: hiddenClassification.id,
                codeValue: `classification under hidden classification (${variant})`,
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

      it("treats classification tables and classifications with only hidden child classifications as childless", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          const hiddenClassNames = await importHiddenClassificationClasses(imodel);
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const emptyTable = insertClassificationTable({ txn, parentId: system.id, codeValue: "empty table" });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "table" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "classification" });
            for (const [variant, classFullName] of Object.entries(hiddenClassNames.classifications)) {
              insertClassification({
                txn,
                classFullName,
                modelId: emptyTable.id,
                codeValue: `hidden classification (${variant})`,
              });
              insertClassification({
                txn,
                classFullName,
                modelId: table.id,
                parentId: classification.id,
                codeValue: `hidden child classification (${variant})`,
              });
            }
            return { emptyTable, table, classification };
          });
        });

        const { imodelConnection, ...keys } = buildIModelResult;
        using provider = await createProvider(imodelConnection, { rootClassificationSystemCode });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.emptyTable],
              supportsFiltering: true,
              children: false,
            }),
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
