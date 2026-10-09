/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { Guid, Id64 } from "@itwin/core-bentley";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createClassificationsTree } from "@itwin/presentation-tree-definitions";
import { CLASS_NAMES, SearchLimitExceededError } from "@itwin/presentation-tree-definitions/internal";
import { initialize, terminate } from "../../IntegrationTests.js";
import { collect, createIModelAccess } from "../Common.js";
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
import type { InstanceKey } from "@itwin/presentation-shared";

const rootClassificationSystemCode = "TestClassificationSystem";
const defaultHierarchyConfiguration = { rootClassificationSystemCode };

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

  describe("Hierarchy search", () => {
    it.each(["label", "targetItems"] as const)(
      "excludes classification tables and classifications of hidden classes from %s searches",
      async (input) => {
        await using buildIModelResult = await buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          const hiddenClassNames = await importHiddenClassificationClasses(imodel);
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "matching table" });
            const classification = insertClassification({
              txn,
              modelId: table.id,
              codeValue: "matching classification",
            });
            const emptyTable = insertClassificationTable({
              txn,
              parentId: system.id,
              codeValue: "matching empty table",
            });
            const hiddenTargets: InstanceKey[] = [];
            for (const [variant, classFullName] of Object.entries(hiddenClassNames.tables)) {
              const hiddenTable = insertClassificationTable({
                txn,
                classFullName,
                parentId: system.id,
                codeValue: `matching hidden table (${variant})`,
              });
              const classificationInHiddenTable = insertClassification({
                txn,
                modelId: hiddenTable.id,
                codeValue: `matching classification in hidden table (${variant})`,
              });
              hiddenTargets.push(hiddenTable, classificationInHiddenTable);
            }
            for (const [variant, classFullName] of Object.entries(hiddenClassNames.classifications)) {
              const hiddenClassification = insertClassification({
                txn,
                classFullName,
                modelId: table.id,
                codeValue: `matching hidden classification (${variant})`,
              });
              const classificationUnderHiddenClassification = insertClassification({
                txn,
                modelId: table.id,
                parentId: hiddenClassification.id,
                codeValue: `matching classification under hidden classification (${variant})`,
              });
              hiddenTargets.push(hiddenClassification, classificationUnderHiddenClassification);
            }
            return { table, classification, emptyTable, hiddenTargets };
          });
        });
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createInstanceKeyPaths } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        const paths = await collect(
          createInstanceKeyPaths(
            input === "label"
              ? { label: "matching", limit: 3 }
              : { targetItems: [keys.table, keys.classification, keys.emptyTable, ...keys.hiddenTargets] },
          ),
        );
        expect(paths).toHaveLength(3);
        expect(paths).toEqual(
          expect.arrayContaining([
            { path: [keys.table], target: keys.table.id },
            { path: [keys.table, keys.classification], target: keys.classification.id },
            { path: [keys.emptyTable], target: keys.emptyTable.id },
          ]),
        );
      },
    );

    it("excludes content of classification tables and classifications of hidden classes from searches", async () => {
      await using buildIModelResult = await buildIModel(async (imodel) => {
        await importClassificationSchema(imodel);
        const hiddenClassNames = await importHiddenClassificationClasses(imodel);
        return withEditTxn(imodel, (txn) => {
          const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
          const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "table" });
          const classification = insertClassification({ txn, modelId: table.id, codeValue: "matching classification" });
          const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          const visibleElement = insertPhysicalElement({
            txn,
            modelId: model.id,
            categoryId: category.id,
            userLabel: "visible element",
          });
          insertElementHasClassificationsRelationship({
            txn,
            elementId: visibleElement.id,
            classificationId: classification.id,
          });
          const hiddenBranchElements: InstanceKey[] = [];
          const insertClassifiedElement = (classificationId: string, userLabel: string) => {
            const element = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id, userLabel });
            insertElementHasClassificationsRelationship({ txn, elementId: element.id, classificationId });
            insertElementHasClassificationsRelationship({ txn, elementId: visibleElement.id, classificationId });
            hiddenBranchElements.push(element);
          };
          for (const [variant, classFullName] of Object.entries(hiddenClassNames.tables)) {
            const hiddenTable = insertClassificationTable({
              txn,
              classFullName,
              parentId: system.id,
              codeValue: `hidden table (${variant})`,
            });
            const classificationInHiddenTable = insertClassification({
              txn,
              modelId: hiddenTable.id,
              codeValue: `matching classification in hidden table (${variant})`,
            });
            insertClassifiedElement(classificationInHiddenTable.id, `matching element in hidden table (${variant})`);
          }
          for (const [variant, classFullName] of Object.entries(hiddenClassNames.classifications)) {
            const hiddenClassification = insertClassification({
              txn,
              classFullName,
              modelId: table.id,
              codeValue: `hidden classification (${variant})`,
            });
            insertClassifiedElement(hiddenClassification.id, `matching element in hidden classification (${variant})`);
            const classificationUnderHiddenClassification = insertClassification({
              txn,
              modelId: table.id,
              parentId: hiddenClassification.id,
              codeValue: `matching classification under hidden classification (${variant})`,
            });
            insertClassifiedElement(
              classificationUnderHiddenClassification.id,
              `matching element under hidden classification (${variant})`,
            );
          }
          return { table, classification, visibleElement, hiddenBranchElements };
        });
      });
      const { imodelConnection, ...keys } = buildIModelResult;
      const { createInstanceKeyPaths } = createClassificationsTree({
        imodelAccess: createIModelAccess(imodelConnection),
        hierarchyConfig: defaultHierarchyConfiguration,
      });
      expect(await collect(createInstanceKeyPaths({ label: "matching", limit: 1 }))).toEqual([
        { path: [keys.table, keys.classification], target: keys.classification.id },
      ]);
      expect(await collect(createInstanceKeyPaths({ targetItems: keys.hiddenBranchElements }))).toEqual([]);
      const visiblePath = {
        path: [keys.table, keys.classification, { ...keys.visibleElement, className: CLASS_NAMES.GeometricElement3d }],
        target: keys.visibleElement.id,
      };
      expect(await collect(createInstanceKeyPaths({ targetItems: [keys.visibleElement] }))).toEqual([visiblePath]);
      expect(await collect(createInstanceKeyPaths({ label: "visible element", limit: 1 }))).toEqual([visiblePath]);
    });

    describe("Hidden element classes and schemas", () => {
      const searchTags = {
        visibleChild: "[visible-child]",
        hidden: "[hidden]",
        underHidden: "[under-hidden]",
        elementLimit: "[element-limit]",
        hiddenClassification: "[hidden-classification]",
      };

      async function setupIModel() {
        return buildIModel(async (imodel) => {
          await importClassificationSchema(imodel);
          const hiddenClassNames = await importHiddenClassesSchemas({ imodel, baseClass: "BisCore.PhysicalElement" });
          return withEditTxn(imodel, (txn) => {
            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "Table" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const hiddenOnlyClassification = insertClassification({
              txn,
              modelId: table.id,
              codeValue: `classification with only hidden elements ${searchTags.hiddenClassification}`,
            });
            const model = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const category = insertSpatialCategory({ txn, codeValue: "Category" });
            const elementProps = { txn, modelId: model.id, categoryId: category.id };
            const visibleElement = insertPhysicalElement({
              ...elementProps,
              userLabel: `visible element ${searchTags.elementLimit}`,
            });
            const visibleChild = insertPhysicalElement({
              ...elementProps,
              parentId: visibleElement.id,
              userLabel: `visible child element ${searchTags.visibleChild}`,
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: visibleElement.id,
              classificationId: classification.id,
            });
            const hiddenElements = Object.entries(hiddenClassNames).map(([variant, classFullName]) => {
              const root = insertPhysicalElement({
                ...elementProps,
                classFullName,
                userLabel: `hidden root element (${variant}) ${searchTags.hidden} ${searchTags.elementLimit}`,
              });
              const child = insertPhysicalElement({
                ...elementProps,
                parentId: visibleElement.id,
                classFullName,
                userLabel: `hidden child element (${variant}) ${searchTags.hidden} ${searchTags.elementLimit}`,
              });
              const rootBlocked = insertPhysicalElement({
                ...elementProps,
                parentId: root.id,
                userLabel: `visible element under hidden root (${variant}) ${searchTags.underHidden}`,
              });
              const nestedBlocked = insertPhysicalElement({
                ...elementProps,
                parentId: child.id,
                userLabel: `visible element under hidden child (${variant}) ${searchTags.underHidden}`,
              });
              for (const classificationId of [classification.id, hiddenOnlyClassification.id]) {
                insertElementHasClassificationsRelationship({ txn, elementId: root.id, classificationId });
              }
              return { root, child, rootBlocked, nestedBlocked };
            });
            return { table, classification, hiddenOnlyClassification, visibleElement, visibleChild, hiddenElements };
          });
        });
      }

      let setup: Awaited<ReturnType<typeof setupIModel>>;
      beforeAll(async () => {
        setup = await setupIModel();
      });
      afterAll(async () => {
        await setup[Symbol.asyncDispose]();
      });

      async function search(props: Parameters<ReturnType<typeof createClassificationsTree>["createSearchTree"]>[0]) {
        return createClassificationsTree({
          imodelAccess: createIModelAccess(setup.imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        }).createSearchTree({ ...props, revealTargets: true });
      }

      it.each(["targetItems", "label"] as const)("keeps visible descendants using %s", async (input) => {
        expect(
          await search(
            input === "targetItems" ? { targetItems: [setup.visibleChild] } : { label: searchTags.visibleChild },
          ),
        ).toEqual([
          {
            identifier: setup.table,
            options: { autoExpand: true },
            children: [
              {
                identifier: setup.classification,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { ...setup.visibleElement, className: CLASS_NAMES.GeometricElement3d },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: { ...setup.visibleChild, className: CLASS_NAMES.GeometricElement3d },
                        options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      });

      it.each(["targetItems", "label"] as const)("omits hidden element targets using %s", async (input) => {
        expect(
          await search(
            input === "targetItems"
              ? { targetItems: setup.hiddenElements.flatMap(({ root, child }) => [root, child]) }
              : { label: searchTags.hidden },
          ),
        ).toEqual([]);
      });

      it.each(["targetItems", "label"] as const)(
        "omits visible targets behind hidden ancestors using %s",
        async (input) => {
          expect(
            await search(
              input === "targetItems"
                ? {
                    targetItems: setup.hiddenElements.flatMap(({ rootBlocked, nestedBlocked }) => [
                      rootBlocked,
                      nestedBlocked,
                    ]),
                  }
                : { label: searchTags.underHidden },
            ),
          ).toEqual([]);
        },
      );

      it.each(["targetItems", "label"] as const)(
        "keeps classifications with only hidden related elements using %s",
        async (input) => {
          expect(
            await search(
              input === "targetItems"
                ? { targetItems: [setup.hiddenOnlyClassification] }
                : { label: searchTags.hiddenClassification },
            ),
          ).toEqual([
            {
              identifier: setup.table,
              options: { autoExpand: true },
              children: [
                {
                  identifier: setup.hiddenOnlyClassification,
                  options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                },
              ],
            },
          ]);
        },
      );

      it("does not count hidden element label matches toward the search limit", async () => {
        expect(await search({ label: searchTags.elementLimit, limit: 1 })).toEqual([
          {
            identifier: setup.table,
            options: { autoExpand: true },
            children: [
              {
                identifier: setup.classification,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { ...setup.visibleElement, className: CLASS_NAMES.GeometricElement3d },
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
        ]);
      });
    });

    describe("label search limits", () => {
      let imodelConnection: IModelConnection;
      let keys: { table: InstanceKey; classification: InstanceKey; elements: InstanceKey[] };

      beforeAll(async () => {
        const setupResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const model = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const category = insertSpatialCategory({ txn, codeValue: "Category" });
            const elements = Array.from({ length: 103 }, (_, index) => {
              const element = insertPhysicalElement({
                txn,
                userLabel: `matching element ${index}`,
                modelId: model.id,
                categoryId: category.id,
              });
              insertElementHasClassificationsRelationship({
                txn,
                elementId: element.id,
                classificationId: classification.id,
              });
              return element;
            });
            return { table, classification, elements };
          }),
        );
        imodelConnection = setupResult.imodelConnection;
        keys = setupResult;
      });

      afterAll(async () => {
        await imodelConnection.close();
      });

      it.each([undefined, "classifications-tree-test"])("shares factory inputs with unique ID %s", async (uniqueId) => {
        const imodelAccess = createIModelAccess(imodelConnection);
        const queryReader = vi.spyOn(imodelAccess, "createQueryReader");
        const { definition, createInstanceKeyPaths, createSearchTree } = createClassificationsTree({
          imodelAccess,
          hierarchyConfig: defaultHierarchyConfiguration,
          uniqueId,
        });
        using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: definition });
        const roots = await collect(provider.getNodes({ parentNode: undefined }));
        expect(roots).toHaveLength(1);
        expect(roots[0].key).toMatchObject({ type: "instances", instanceKeys: [keys.table] });
        const expectedPath = [
          keys.table,
          keys.classification,
          { id: keys.elements[0].id, className: CLASS_NAMES.GeometricElement3d },
        ];
        expect(await collect(createInstanceKeyPaths({ label: "matching element 0" }))).toEqual([
          { path: expectedPath, target: keys.elements[0].id },
        ]);
        const restartToken = queryReader.mock.calls.find(([, options]) =>
          options?.restartToken?.endsWith("/filter-by-label"),
        )?.[1]?.restartToken;
        expect(restartToken).toBeDefined();
        const resolvedUniqueId = restartToken!.split("/")[1];
        if (uniqueId) {
          expect(resolvedUniqueId).toBe(uniqueId);
        } else {
          expect(Guid.isGuid(resolvedUniqueId)).toBe(true);
        }

        queryReader.mockClear();
        expect(await createSearchTree({ label: "matching element 0" })).toEqual([
          {
            identifier: expectedPath[0],
            children: [{ identifier: expectedPath[1], children: [{ identifier: expectedPath[2] }] }],
          },
        ]);
        expect(queryReader).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ restartToken }));
        expect(await collect(createInstanceKeyPaths({ targetItems: [keys.elements[0]] }))).toEqual([
          { path: expectedPath, target: keys.elements[0].id },
        ]);
      });

      it.each([
        { limit: undefined, expectedError: new SearchLimitExceededError(100) },
        { limit: 2, expectedError: new SearchLimitExceededError(2) },
        { limit: 103, expectedError: undefined },
        { limit: "unbounded" as const, expectedError: undefined },
      ])("honors label search limit $limit with 103 matches", async ({ limit, expectedError }) => {
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        if (expectedError) {
          await expect(
            createSearchTree({
              label: "matching element",
              limit,
              revealTargets: true,
              abortSignal: new AbortController().signal,
            }),
          ).rejects.toThrow(expectedError);
          return;
        }

        expect(
          await createSearchTree({
            label: "matching element",
            limit,
            revealTargets: true,
            abortSignal: new AbortController().signal,
          }),
        ).toEqual([
          {
            identifier: { id: keys.table.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: true },
                children: keys.elements.map((element) => ({
                  identifier: { id: element.id, className: CLASS_NAMES.GeometricElement3d },
                  options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                })),
              },
            ],
          },
        ]);
      });
    });
    it("excludes private and template model elements from label and target-item searches", async () => {
      await using buildIModelResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, async (txn) => {
          await importClassificationSchema(imodel);
          const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
          const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "table" });
          const classification = insertClassification({ txn, modelId: table.id, codeValue: "classification" });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
          const element = insertPhysicalElement({
            txn,
            modelId: model.id,
            categoryId: category.id,
            userLabel: "matching element",
          });
          insertElementHasClassificationsRelationship({
            txn,
            elementId: element.id,
            classificationId: classification.id,
          });
          const hiddenElements = ["isPrivate", "isTemplate"].map((flag) => {
            const hiddenModel = insertGeometricModelWithPartition({ txn, codeValue: flag, [flag]: true });
            const hiddenElement = insertPhysicalElement({
              txn,
              modelId: hiddenModel.id,
              categoryId: category.id,
              userLabel: `matching ${flag}`,
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: hiddenElement.id,
              classificationId: classification.id,
            });
            return hiddenElement;
          });
          return { table, classification, element, hiddenElements };
        }),
      );
      const { imodelConnection, ...keys } = buildIModelResult;
      for (const search of [{ label: "matching", limit: 1 }, { targetItems: [keys.element, ...keys.hiddenElements] }]) {
        const { createInstanceKeyPaths } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(await collect(createInstanceKeyPaths(search))).toEqual([
          {
            path: [keys.table, keys.classification, { id: keys.element.id, className: CLASS_NAMES.GeometricElement3d }],
            target: keys.element.id,
          },
        ]);
      }
    });

    it("finds a table by label when the classification system code contains an apostrophe", async () => {
      const hierarchyConfig = { rootClassificationSystemCode: "Owner's Classification" };
      for (const includeClassifications of [false, true]) {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: hierarchyConfig.rootClassificationSystemCode });
            const table = insertClassificationTable({
              txn,
              parentId: system.id,
              codeValue: "ClassificationTable",
              userLabel: "Matching table",
            });
            if (includeClassifications) {
              const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
              const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
              const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
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
            }

            return { table };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig,
        });

        expect(await createSearchTree({ label: "Matching", revealTargets: true })).toEqual([
          {
            identifier: { id: keys.table.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
        ]);
      }
    });

    ["Test", "_", "%"].forEach((label) => {
      it(`finds classification table by label when it contains '${label}'`, async function () {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({
              txn,
              parentId: system.id,
              codeValue: "ClassificationTable",
              userLabel: `${label}Table`,
            });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
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

            return { table };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({ label, revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([
          {
            identifier: { id: keys.table.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
        ]);
      });

      it(`finds classification by label when it contains '${label}'`, async function () {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({
              txn,
              modelId: table.id,
              codeValue: "Classification",
              userLabel: `${label}Cl`,
            });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
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

            return { table, classification };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({ label, revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([
          {
            identifier: { id: keys.table.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it(`finds 3d element by label when it contains '${label}'`, async function () {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const element = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              userLabel: `${label}El`,
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
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({ label, revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([
          {
            identifier: { id: keys.table.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { id: keys.element.id, className: CLASS_NAMES.GeometricElement3d },
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
        ]);
      });

      it(`finds 3d child element by label when it contains '${label}'`, async function () {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const parentElement = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Parent Element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: parentElement.id,
              classificationId: classification.id,
            });
            const childElement = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              userLabel: `${label}ChildEl`,
              parentId: parentElement.id,
            });

            return { table, classification, parentElement, childElement };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({ label, revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([
          {
            identifier: { id: keys.table.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { id: keys.parentElement.id, className: CLASS_NAMES.GeometricElement3d },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: { id: keys.childElement.id, className: CLASS_NAMES.GeometricElement3d },
                        options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      });
    });

    describe("excludedElementClassNames", () => {
      it("excludes elements of excluded classes from search paths", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const element = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element",
              userLabel: "matching excluded element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element.id,
              classificationId: classification.id,
            });
          }),
        );
        const { imodelConnection } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: {
            ...defaultHierarchyConfiguration,
            elements: { excludedClasses: ["Generic.PhysicalObject"] },
          },
        });
        expect(
          await createSearchTree({ label: "matching", revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([]);
      });

      it("excludes elements of classes derived from excluded classes from search paths", async () => {
        await using buildIModelResult = await buildIModel(async (imodel, testSchema) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const element = insertPhysicalElement({
              txn,
              classFullName: testSchema.items.SubModelablePhysicalObject.fullName,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element",
              userLabel: "matching excluded element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element.id,
              classificationId: classification.id,
            });
          }),
        );
        const { imodelConnection } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: {
            ...defaultHierarchyConfiguration,
            elements: { excludedClasses: ["BisCore.PhysicalElement"] },
          },
        });
        expect(
          await createSearchTree({ label: "matching", revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([]);
      });

      it("returns the classification even when its only element is excluded", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({
              txn,
              modelId: table.id,
              codeValue: "Classification",
              userLabel: "matching excluded classification",
            });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const element = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element",
              userLabel: "excluded element",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element.id,
              classificationId: classification.id,
            });

            return { table, classification };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: {
            ...defaultHierarchyConfiguration,
            elements: { excludedClasses: ["Generic.PhysicalObject"] },
          },
        });
        expect(
          await createSearchTree({ label: "matching", revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([
          {
            identifier: { id: keys.table.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it("does not return child elements of filtered out parent elements", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const excludedParent = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Parent",
              userLabel: "excluded parent",
            });
            insertPhysicalElement({
              txn,
              classFullName: "Generic.SpatialLocation",
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              parentId: excludedParent.id,
              codeValue: "Child",
              userLabel: "matching child of excluded parent",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: excludedParent.id,
              classificationId: classification.id,
            });
          }),
        );
        const { imodelConnection } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: {
            ...defaultHierarchyConfiguration,
            elements: { excludedClasses: ["Generic.PhysicalObject"] },
          },
        });
        expect(
          await createSearchTree({ label: "matching", revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([]);
      });

      it("does not return excluded child elements when their parent is not excluded", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const keptParent = insertPhysicalElement({
              txn,
              classFullName: "Generic.SpatialLocation",
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Parent",
              userLabel: "kept parent",
            });
            insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              parentId: keptParent.id,
              codeValue: "Child",
              userLabel: "matching excluded child",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: keptParent.id,
              classificationId: classification.id,
            });
          }),
        );
        const { imodelConnection } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: {
            ...defaultHierarchyConfiguration,
            elements: { excludedClasses: ["Generic.PhysicalObject"] },
          },
        });
        expect(
          await createSearchTree({ label: "matching", revealTargets: true, abortSignal: new AbortController().signal }),
        ).toEqual([]);
      });
    });

    describe("by instance key", () => {
      it("finds classifications table", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table1 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable1" });
            const classification1 = insertClassification({ txn, modelId: table1.id, codeValue: "Classification1" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model1" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category1" });
            const element1 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element1",
              userLabel: "Element1",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element1.id,
              classificationId: classification1.id,
            });

            const table2 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable2" });
            const classification2 = insertClassification({ txn, modelId: table2.id, codeValue: "Classification2" });
            const element2 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element2",
              userLabel: "Element2",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element2.id,
              classificationId: classification2.id,
            });

            return { table1, table2 };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({
            targetItems: [keys.table2],
            revealTargets: true,
            abortSignal: new AbortController().signal,
          }),
        ).toEqual([
          {
            identifier: { id: keys.table2.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
        ]);
      });

      it("finds classifications", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table1 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable1" });
            const classification1 = insertClassification({ txn, modelId: table1.id, codeValue: "Classification1" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model1" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category1" });
            const element1 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element1",
              userLabel: "Element1",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element1.id,
              classificationId: classification1.id,
            });

            const table2 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable2" });
            const classification2 = insertClassification({ txn, modelId: table2.id, codeValue: "Classification2" });
            const element2 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element2",
              userLabel: "Element2",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element2.id,
              classificationId: classification2.id,
            });

            return { table1, table2, classification1, classification2 };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({
            targetItems: [keys.classification2],
            revealTargets: true,
            abortSignal: new AbortController().signal,
          }),
        ).toEqual([
          {
            identifier: { id: keys.table2.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification2.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it("finds geometric element 3d", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table1 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable1" });
            const classification1 = insertClassification({ txn, modelId: table1.id, codeValue: "Classification1" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model1" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category1" });
            const element1 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element1",
              userLabel: "Element1",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element1.id,
              classificationId: classification1.id,
            });

            const table2 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable2" });
            const classification2 = insertClassification({ txn, modelId: table2.id, codeValue: "Classification2" });
            const element2 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element2",
              userLabel: "Element2",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element2.id,
              classificationId: classification2.id,
            });

            return { table1, table2, classification1, classification2, element1, element2 };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({
            targetItems: [keys.element2],
            revealTargets: true,
            abortSignal: new AbortController().signal,
          }),
        ).toEqual([
          {
            identifier: { id: keys.table2.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification2.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { id: keys.element2.id, className: CLASS_NAMES.GeometricElement3d },
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("finds child geometric element 3d", async () => {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table1 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable1" });
            const classification1 = insertClassification({ txn, modelId: table1.id, codeValue: "Classification1" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model1" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category1" });
            const element1 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Element1",
              userLabel: "Element1",
            });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element1.id,
              classificationId: classification1.id,
            });

            const table2 = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable2" });
            const classification2 = insertClassification({ txn, modelId: table2.id, codeValue: "Classification2" });
            const element2 = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "element",
              userLabel: "Element2",
            });

            insertElementHasClassificationsRelationship({
              txn,
              elementId: element2.id,
              classificationId: classification2.id,
            });
            const childElement = insertPhysicalElement({
              txn,
              modelId: physicalModel.id,
              categoryId: spatialCategory.id,
              codeValue: "Child Element",
              userLabel: `ChildEl2`,
              parentId: element2.id,
            });

            return { table1, table2, classification1, classification2, element1, element2, childElement };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({
            targetItems: [keys.childElement],
            revealTargets: true,
            abortSignal: new AbortController().signal,
          }),
        ).toEqual([
          {
            identifier: { id: keys.table2.id, className: CLASS_NAMES.ClassificationTable },
            options: { autoExpand: true },
            children: [
              {
                identifier: { id: keys.classification2.id, className: CLASS_NAMES.Classification },
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { id: keys.element2.id, className: CLASS_NAMES.GeometricElement3d },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: { id: keys.childElement.id, className: CLASS_NAMES.GeometricElement3d },
                        options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("finds 3d element by base36 ECInstanceId suffix", async function () {
        await using buildIModelResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, async (txn) => {
            await importClassificationSchema(imodel);

            const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
            const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
            const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
            const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "Model" });
            const spatialCategory = insertSpatialCategory({ txn, codeValue: "Category" });
            const element = insertPhysicalElement({ txn, modelId: physicalModel.id, categoryId: spatialCategory.id });
            insertElementHasClassificationsRelationship({
              txn,
              elementId: element.id,
              classificationId: classification.id,
            });

            return { table, classification, element };
          }),
        );
        const { imodelConnection, ...keys } = buildIModelResult;

        const briefcaseId = Id64.getBriefcaseId(keys.element.id).toString(36).toLocaleUpperCase();
        const localId = Id64.getLocalId(keys.element.id).toString(36).toLocaleUpperCase();
        const { createSearchTree } = createClassificationsTree({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyConfig: defaultHierarchyConfiguration,
        });
        expect(
          await createSearchTree({
            label: `[${briefcaseId}-${localId}]`,
            revealTargets: true,
            abortSignal: new AbortController().signal,
          }),
        ).toEqual([
          {
            identifier: keys.table,
            options: { autoExpand: true },
            children: [
              {
                identifier: keys.classification,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { ...keys.element, className: CLASS_NAMES.GeometricElement3d },
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
        ]);
      });
    });

    it("returns empty array when nothing matches provided search text", async () => {
      await using buildIModelResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, async (txn) => {
          await importClassificationSchema(imodel);

          const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
          const table = insertClassificationTable({ txn, parentId: system.id, codeValue: "ClassificationTable" });
          const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
          const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "physical model" });
          const spatialCategory = insertSpatialCategory({ txn, codeValue: "physical category" });
          const physicalElement = insertPhysicalElement({
            txn,
            modelId: physicalModel.id,
            categoryId: spatialCategory.id,
            codeValue: "Physical element",
          });
          insertElementHasClassificationsRelationship({
            txn,
            elementId: physicalElement.id,
            classificationId: classification.id,
          });
        }),
      );
      const { imodelConnection } = buildIModelResult;
      const { createSearchTree } = createClassificationsTree({
        imodelAccess: createIModelAccess(imodelConnection),
        hierarchyConfig: defaultHierarchyConfiguration,
      });
      expect(
        await createSearchTree({ label: "Test", revealTargets: true, abortSignal: new AbortController().signal }),
      ).toEqual([]);
    });

    it("aborts when abort signal fires", async () => {
      await using buildIModelResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, async (txn) => {
          await importClassificationSchema(imodel);

          const system = insertClassificationSystem({ txn, codeValue: rootClassificationSystemCode });
          const table = insertClassificationTable({
            txn,
            parentId: system.id,
            codeValue: "ClassificationTable",
            userLabel: `TestTable`,
          });
          const classification = insertClassification({ txn, modelId: table.id, codeValue: "Classification" });
          const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "physical model" });
          const spatialCategory = insertSpatialCategory({ txn, codeValue: "physical category" });
          const physicalElement = insertPhysicalElement({
            txn,
            modelId: physicalModel.id,
            categoryId: spatialCategory.id,
            codeValue: "Physical element",
          });
          insertElementHasClassificationsRelationship({
            txn,
            elementId: physicalElement.id,
            classificationId: classification.id,
          });
          return { classificationTable: table };
        }),
      );
      const { imodelConnection, ...ids } = buildIModelResult;
      const { createSearchTree } = createClassificationsTree({
        imodelAccess: createIModelAccess(imodelConnection),
        hierarchyConfig: defaultHierarchyConfiguration,
      });

      const abortController1 = new AbortController();
      const pathsPromiseAborted = createSearchTree({
        label: "Test",
        revealTargets: true,
        abortSignal: abortController1.signal,
      });
      abortController1.abort();
      expect(await pathsPromiseAborted).toEqual([]);

      const abortController2 = new AbortController();
      const pathsPromise = createSearchTree({
        label: "Test",
        revealTargets: true,
        abortSignal: abortController2.signal,
      });
      expect(await pathsPromise).toEqual([
        {
          identifier: { className: ids.classificationTable.className, id: ids.classificationTable.id },
          options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
        },
      ]);
    });
  });
});
