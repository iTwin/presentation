/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertSubCategory } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { Id64 } from "@itwin/core-bentley";
import { CLASS_NAMES } from "../../../tree-definitions/shared/ClassNameDefinitions.js";
import { createBaseIdsProvider } from "../../../tree-definitions/shared/idsProviders/BaseIdsProvider.js";
import { SearchLimitExceededError } from "../../../tree-definitions/shared/TreeErrors.js";
import { getClassesByView, mergeWithDefaults } from "../../../tree-definitions/shared/Utils.js";
import {
  CategoriesTreeDefinition,
  defaultHierarchyConfiguration,
} from "../../../tree-definitions/trees/categories-tree/CategoriesTreeDefinition.js";
import { createCategoriesTreeIdsProvider } from "../../../tree-definitions/trees/categories-tree/CategoriesTreeIdsProvider.js";
import { buildIModel } from "../../IModelUtils.js";
import { initializeITwinJs, terminateITwinJs } from "../../Initialize.js";
import { createIModelAccess } from "../Common.js";
import {
  getDefaultSubCategoryId,
  getInsertFunctionByViewType,
  insertDefinitionContainer,
  insertSubModel,
} from "./Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
import type { EC, InstanceKey } from "@itwin/presentation-shared";
import type { CategoriesTreeHierarchyConfiguration } from "../../../tree-definitions/trees/categories-tree/CategoriesTreeDefinition.js";

// cspell:words egory
// cspell complains about Cat_egory and Cat%egory

describe("Categories tree", () => {
  describe("Hierarchy search", () => {
    beforeAll(async () => {
      await initializeITwinJs();
    });

    afterAll(async () => {
      await terminateITwinJs();
    });

    describe("label search limits", () => {
      let imodelConnection: IModelConnection;
      let keys: { category: InstanceKey; elements: InstanceKey[] };

      beforeAll(async () => {
        const { insertCategory, insertElement, insertElementsModel } = getInsertFunctionByViewType("3d");
        const setupResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, (txn) => {
            const model = insertElementsModel({ txn, codeValue: "model" });
            const category = insertCategory({ txn, codeValue: "category" });
            const elements = Array.from({ length: 103 }, (_, index) =>
              insertElement({
                txn,
                userLabel: `matching element ${index}`,
                modelId: model.id,
                categoryId: category.id,
              }),
            );
            return { category, elements };
          }),
        );
        imodelConnection = setupResult.imodelConnection;
        keys = setupResult;
      });

      afterAll(async () => {
        await imodelConnection.close();
      });

      it.each([
        { limit: undefined, exceedsLimit: true },
        { limit: 2, exceedsLimit: true },
        { limit: 103, exceedsLimit: false },
        { limit: "unbounded" as const, exceedsLimit: false },
      ])("honors label search limit $limit with 103 matches", async ({ limit, exceedsLimit }) => {
        const imodelAccess = createIModelAccess(imodelConnection);
        const searchProps = createCategoriesTreeSearchProps({
          imodelConnection,
          hierarchyConfig: { elements: { nodes: "include" } },
          viewType: "3d",
          searchText: "matching element",
          searchLimit: limit,
        });
        const searchPaths = CategoriesTreeDefinition.createSearchTree({
          ...searchProps,
          imodelAccess,
          abortSignal: new AbortController().signal,
        });
        if (exceedsLimit) {
          await expect(searchPaths).rejects.toThrow(
            new SearchLimitExceededError(typeof limit === "number" ? limit : 100),
          );
          return;
        }
        expect(await searchPaths).toEqual([
          {
            identifier: keys.category,
            options: { autoExpand: true },
            children: keys.elements.map((element) => ({
              identifier: { ...element, className: getClassesByView("3d").elementClass },
              options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
            })),
          },
        ]);
      });
    });

    ["2d" as const, "3d" as const].forEach((viewType) => {
      describe(`${viewType} view`, () => {
        const { insertCategory, insertElement, insertElementsModel, insertElementsSubModel, insertModeledElement } =
          getInsertFunctionByViewType(viewType);

        it("does not emit search paths for a hidden default subcategory", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "model" });
              const category = insertCategory({ txn, codeValue: "category" });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });
              return { category };
            }),
          );
          const { imodelConnection, ...keys } = buildIModelResult;
          const { idsProvider } = createCategoriesTreeSearchProps({
            imodelConnection,
            searchText: "category",
            viewType,
          });
          const defaultSubCategoryId = getDefaultSubCategoryId(keys.category.id);

          const paths = new Array<HierarchyNodeIdentifiersPath>();
          for await (const path of idsProvider.getSubCategoriesSearchPaths({ subCategoryIds: defaultSubCategoryId })) {
            paths.push(path);
          }
          expect(paths).toEqual([]);
        });

        it("finds definition container by label", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc", userLabel: "Test" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              const category = insertCategory({ txn, codeValue: "cat", modelId: definitionModel.id });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });

              return { definitionContainer };
            }),
          );
          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.definitionContainer,
              options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
            },
          ]);
        });

        it("does not return definition container with only empty categories when `categories.withoutElements` is set to 'exclude'", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc", userLabel: "Test" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              insertCategory({ txn, codeValue: "cat", modelId: definitionModel.id });
              return { definitionContainer };
            }),
          );
          const { imodelConnection } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([]);
        });

        it("returns definition container with only empty categories when `categories.withoutElements` is set to 'include'", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc", userLabel: "Test" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              insertCategory({ txn, codeValue: "cat", modelId: definitionModel.id });
              return { definitionContainer };
            }),
          );
          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({
            imodelConnection,
            hierarchyConfig: { categories: { withoutElements: "include" } },
            searchText: "Test",
            viewType,
          });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.definitionContainer,
              options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
            },
          ]);
        });

        it("aborts when abort signal fires", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc", userLabel: "Test" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              const category = insertCategory({ txn, codeValue: "cat", modelId: definitionModel.id });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });
              return { definitionContainer };
            }),
          );
          const { imodelConnection, ...ids } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);

          const searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });

          const abortController1 = new AbortController();
          const pathsPromiseAborted = CategoriesTreeDefinition.createSearchTree({
            ...searchProps,
            imodelAccess,
            abortSignal: abortController1.signal,
          });
          abortController1.abort();
          expect(await pathsPromiseAborted).toEqual([]);

          const abortController2 = new AbortController();
          const pathsPromise = CategoriesTreeDefinition.createSearchTree({
            ...searchProps,
            imodelAccess,
            abortSignal: abortController2.signal,
          });
          expect(await pathsPromise).toEqual([
            {
              identifier: { className: "BisCore.DefinitionContainer", id: ids.definitionContainer.id },
              options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
            },
          ]);
        });

        it("finds definition container by label when it is contained by another definition container", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              const definitionContainerChild = insertDefinitionContainer({
                txn,
                codeValue: "DefinitionContainerChild",
                userLabel: "Test",
                modelId: definitionModel.id,
              });
              const definitionModelChild = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainerChild.id,
              });
              const category = insertCategory({ txn, codeValue: "cat", modelId: definitionModelChild.id });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });

              return { definitionContainer, definitionContainerChild };
            }),
          );
          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.definitionContainer,
              options: { autoExpand: true },
              children: [
                {
                  identifier: keys.definitionContainerChild,
                  options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                },
              ],
            },
          ]);
        });

        it("does not find definition container by label when it doesn't contain categories", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc", userLabel: "Test" });
              insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              const category = insertCategory({ txn, codeValue: "cat" });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });
            }),
          );
          const { imodelConnection } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([]);
        });

        it("finds category by label when it is contained by definition container", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              const category = insertCategory({
                txn,
                codeValue: "cat",
                userLabel: "Test",
                modelId: definitionModel.id,
              });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });

              return { definitionContainer, category };
            }),
          );
          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.definitionContainer,
              options: { autoExpand: true },
              children: [
                { identifier: keys.category, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
              ],
            },
          ]);
        });

        it("finds subCategory by label when its parent category is contained by definition container", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "dc" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              const category = insertCategory({ txn, codeValue: "cat", modelId: definitionModel.id });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });
              const subCategory1 = insertSubCategory({
                txn,
                codeValue: "SubCategory1",
                parentCategoryId: category.id,
                modelId: definitionModel.id,
              });

              return { definitionContainer, category, subCategory1 };
            }),
          );
          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({
            imodelConnection,
            searchText: "SubCategory1",
            viewType,
          });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.definitionContainer,
              options: { autoExpand: true },
              children: [
                {
                  identifier: keys.category,
                  options: { autoExpand: true },
                  children: [
                    {
                      identifier: keys.subCategory1,
                      options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                    },
                  ],
                },
              ],
            },
          ]);
        });

        it("finds categories by label containing special SQLite characters", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });

              const category1 = insertCategory({ txn, codeValue: "Test Cat_egory" });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category1.id });

              const category2 = insertCategory({ txn, codeValue: "Test Cat%egory" });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category2.id });

              return { category1, category2 };
            }),
          );

          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          let searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "_", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            { identifier: keys.category1, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
          ]);

          searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "%", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            { identifier: keys.category2, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
          ]);
        });

        it("finds subcategories by label containing special SQLite characters", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });

              const category = insertCategory({ txn, codeValue: "Test Category" });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });

              const subCategory1 = insertSubCategory({
                txn,
                parentCategoryId: category.id,
                codeValue: "SubCat_egory1",
              });
              const subCategory2 = insertSubCategory({
                txn,
                parentCategoryId: category.id,
                codeValue: "SubCat%egory2",
              });

              return { category, subCategory1, subCategory2 };
            }),
          );

          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          let searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "_", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.category,
              options: { autoExpand: true },
              children: [
                { identifier: keys.subCategory1, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
              ],
            },
          ]);

          searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "%", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.category,
              options: { autoExpand: true },
              children: [
                { identifier: keys.subCategory2, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
              ],
            },
          ]);
        });

        it("finds categories by label when subCategory count is 1 and labels of category and subCategory differ", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              // SubCategory gets inserted by default
              const category = insertCategory({ txn, codeValue: "cat", userLabel: "Test" });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });

              return { category };
            }),
          );

          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          let searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });

          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            { identifier: keys.category, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
          ]);

          searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "cat", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([]);
        });

        it("finds categories and subCategories by label when subCategory count is > 1", async () => {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });

              const category = insertCategory({ txn, codeValue: "cat", userLabel: "Test" });
              insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });

              const subCategory1 = insertSubCategory({ txn, codeValue: "SubCategory1", parentCategoryId: category.id });

              const subCategory2 = insertSubCategory({ txn, codeValue: "SubCategory2", parentCategoryId: category.id });

              return { category, subCategory1, subCategory2 };
            }),
          );

          const { imodelConnection, ...keys } = buildIModelResult;
          const imodelAccess = createIModelAccess(imodelConnection);
          let searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "Test", viewType });

          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            { identifier: keys.category, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
          ]);

          searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "SubCategory1", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.category,
              options: { autoExpand: true },
              children: [
                { identifier: keys.subCategory1, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
              ],
            },
          ]);

          searchProps = createCategoriesTreeSearchProps({ imodelConnection, searchText: "SubCategory2", viewType });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.category,
              options: { autoExpand: true },
              children: [
                { identifier: keys.subCategory2, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
              ],
            },
          ]);
        });

        it("finds element by base36 ECInstanceId suffix", async function () {
          await using buildIModelResult = await buildIModel(async (imodel) =>
            withEditTxn(imodel, (txn) => {
              const elementsModel = insertElementsModel({ txn, codeValue: "m" });
              const definitionContainer = insertDefinitionContainer({ txn, codeValue: "TestDefinitionContainer" });
              const definitionModel = insertSubModel({
                txn,
                classFullName: CLASS_NAMES.DefinitionModel,
                modeledElementId: definitionContainer.id,
              });
              const category = insertCategory({ txn, codeValue: "cat", modelId: definitionModel.id });
              const element = insertElement({ txn, modelId: elementsModel.id, categoryId: category.id });

              return { definitionContainer, element, category };
            }),
          );
          const { imodelConnection, ...keys } = buildIModelResult;

          const briefcaseId = Id64.getBriefcaseId(keys.element.id).toString(36).toLocaleUpperCase();
          const localId = Id64.getLocalId(keys.element.id).toString(36).toLocaleUpperCase();
          const imodelAccess = createIModelAccess(imodelConnection);
          const searchProps = createCategoriesTreeSearchProps({
            imodelConnection,
            hierarchyConfig: { elements: { nodes: "include" } },
            searchText: `[${briefcaseId}-${localId}]`,
            viewType,
          });
          expect(
            await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            }),
          ).toEqual([
            {
              identifier: keys.definitionContainer,
              options: { autoExpand: true },
              children: [
                {
                  identifier: keys.category,
                  options: { autoExpand: true },
                  children: [
                    {
                      identifier: { ...keys.element, className: getClassesByView(viewType).elementClass },
                      options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                    },
                  ],
                },
              ],
            },
          ]);
        });

        describe("intermediate categories", () => {
          const showElementsConfig = { elements: { nodes: "include" as const } };
          const { elementClass, modelClass } = getClassesByView(viewType);
          it("finds child element with different category than parent (intermediate category in path)", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "m" });
                const categoryA = insertCategory({ txn, codeValue: "catA" });
                const categoryB = insertCategory({ txn, codeValue: "catB" });
                const parentElement = insertElement({
                  txn,
                  userLabel: "parent element",
                  modelId: model.id,
                  categoryId: categoryA.id,
                });
                const childElement = insertElement({
                  txn,
                  userLabel: "child",
                  modelId: model.id,
                  categoryId: categoryB.id,
                  parentId: parentElement.id,
                });
                return { categoryA, categoryB, parentElement, childElement };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: showElementsConfig,
              searchText: "child",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([
              {
                identifier: keys.categoryA,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { className: elementClass, id: keys.parentElement.id },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: keys.categoryB,
                        options: { autoExpand: true },
                        children: [
                          {
                            identifier: { className: elementClass, id: keys.childElement.id },
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

          it("finds child element with same category as parent (no intermediate category in path)", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "m" });
                const category = insertCategory({ txn, codeValue: "cat" });
                const parentElement = insertElement({
                  txn,
                  userLabel: "parent element",
                  modelId: model.id,
                  categoryId: category.id,
                });
                const childElement = insertElement({
                  txn,
                  userLabel: "child",
                  modelId: model.id,
                  categoryId: category.id,
                  parentId: parentElement.id,
                });
                return { category, parentElement, childElement };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: showElementsConfig,
              searchText: "child",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([
              {
                identifier: keys.category,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { className: elementClass, id: keys.parentElement.id },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: { className: elementClass, id: keys.childElement.id },
                        options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                      },
                    ],
                  },
                ],
              },
            ]);
          });

          it("finds category that appears as intermediate category", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "m" });
                const categoryA = insertCategory({ txn, codeValue: "catA" });
                const categoryB = insertCategory({ txn, codeValue: "catB" });
                const parentElement = insertElement({
                  txn,
                  userLabel: "parent element",
                  modelId: model.id,
                  categoryId: categoryA.id,
                });
                insertElement({
                  txn,
                  userLabel: "child element",
                  modelId: model.id,
                  categoryId: categoryB.id,
                  parentId: parentElement.id,
                });
                return { categoryA, categoryB, parentElement };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: showElementsConfig,
              searchText: "catB",
              viewType,
            });
            const paths = await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            });
            // Should find the category as an intermediate category path (under parentElement)
            expect(paths).toEqual([
              {
                identifier: keys.categoryA,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { className: elementClass, id: keys.parentElement.id },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: keys.categoryB,
                        options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                      },
                    ],
                  },
                ],
              },
              { identifier: keys.categoryB, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
            ]);
          });

          it("finds sub-model element with different category than modeled element (intermediate category in path)", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "m" });
                const categoryA = insertCategory({ txn, codeValue: "catA" });
                const categoryB = insertCategory({ txn, codeValue: "catB" });
                const modeledElement = insertModeledElement({
                  txn,
                  userLabel: "modeled element",
                  modelId: model.id,
                  categoryId: categoryA.id,
                });
                const subModel = insertElementsSubModel({ txn, modeledElementId: modeledElement.id });
                const modelingElement = insertElement({
                  txn,
                  userLabel: "modeling element",
                  modelId: subModel.id,
                  categoryId: categoryB.id,
                });
                return { categoryA, categoryB, modeledElement, subModel, modelingElement };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: showElementsConfig,
              searchText: "modeling element",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([
              {
                identifier: keys.categoryA,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { className: elementClass, id: keys.modeledElement.id },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: { className: modelClass, id: keys.subModel.id },
                        options: { autoExpand: true },
                        children: [
                          {
                            identifier: keys.categoryB,
                            options: { autoExpand: true },
                            children: [
                              {
                                identifier: { className: elementClass, id: keys.modelingElement.id },
                                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ]);
          });

          it("finds sub-model element with same category as modeled element (no intermediate category in path)", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "m" });
                const category = insertCategory({ txn, codeValue: "cat" });
                const modeledElement = insertModeledElement({
                  txn,
                  userLabel: "modeled element",
                  modelId: model.id,
                  categoryId: category.id,
                });
                const subModel = insertElementsSubModel({ txn, modeledElementId: modeledElement.id });
                const modelingElement = insertElement({
                  txn,
                  userLabel: "modeling element",
                  modelId: subModel.id,
                  categoryId: category.id,
                });
                return { category, modeledElement, subModel, modelingElement };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: showElementsConfig,
              searchText: "modeling element",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([
              {
                identifier: keys.category,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { className: elementClass, id: keys.modeledElement.id },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: { className: modelClass, id: keys.subModel.id },
                        options: { autoExpand: true },
                        children: [
                          {
                            identifier: { className: elementClass, id: keys.modelingElement.id },
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

          it("finds category that appears as intermediate category under sub-model", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "m" });
                const categoryA = insertCategory({ txn, codeValue: "catA" });
                const categoryB = insertCategory({ txn, codeValue: "catB" });
                const modeledElement = insertModeledElement({
                  txn,
                  userLabel: "modeled element",
                  modelId: model.id,
                  categoryId: categoryA.id,
                });
                const subModel = insertElementsSubModel({ txn, modeledElementId: modeledElement.id });
                insertElement({ txn, userLabel: "modeling element", modelId: subModel.id, categoryId: categoryB.id });
                return { categoryA, categoryB, modeledElement, subModel };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: showElementsConfig,
              searchText: "catB",
              viewType,
            });
            const paths = await CategoriesTreeDefinition.createSearchTree({
              ...searchProps,
              imodelAccess,
              abortSignal: new AbortController().signal,
            });
            expect(paths).toEqual([
              {
                identifier: keys.categoryA,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { className: elementClass, id: keys.modeledElement.id },
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: { className: modelClass, id: keys.subModel.id },
                        options: { autoExpand: true },
                        children: [
                          {
                            identifier: keys.categoryB,
                            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              { identifier: keys.categoryB, options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } } },
            ]);
          });
        });

        describe("elements.excludedClasses", () => {
          const showElementsConfig = { elements: { nodes: "include" as const } };
          const elementClassName: EC.FullClassNameDotNotation =
            viewType === "3d" ? "Generic.PhysicalObject" : "BisCore.DrawingGraphic";
          const subModeledElementBaseClassName: EC.FullClassNameDotNotation = "BisCore.ISubModeledElement";

          it("excludes elements of excluded classes from search paths", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "model" });
                const category = insertCategory({ txn, codeValue: "cat" });
                insertElement({
                  txn,
                  userLabel: "matching excluded element",
                  modelId: model.id,
                  categoryId: category.id,
                });
              }),
            );
            const { imodelConnection } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: { elements: { ...showElementsConfig.elements, excludedClasses: [elementClassName] } },
              searchText: "matching",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([]);
          });

          it("excludes elements of classes derived from excluded classes from search paths", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "model" });
                const category = insertCategory({ txn, codeValue: "cat" });
                insertModeledElement({
                  txn,
                  userLabel: "matching excluded element",
                  modelId: model.id,
                  categoryId: category.id,
                });
              }),
            );
            const { imodelConnection } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: {
                elements: { ...showElementsConfig.elements, excludedClasses: [subModeledElementBaseClassName] },
              },
              searchText: "matching",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([]);
          });

          it("returns the category even when its only element is excluded", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "model" });
                const excludedCategory = insertCategory({ txn, codeValue: "matching excluded category" });
                insertElement({
                  txn,
                  userLabel: "excluded element",
                  modelId: model.id,
                  categoryId: excludedCategory.id,
                });
                return { excludedCategory };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: {
                elements: { nodes: "exclude", excludedClasses: [elementClassName] },
              } as CategoriesTreeHierarchyConfiguration,
              searchText: "matching",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([
              {
                identifier: keys.excludedCategory,
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ]);
          });

          it("does not return child elements of filtered out parent elements", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "model" });
                const category = insertCategory({ txn, codeValue: "cat" });
                const excludedParent = insertElement({
                  txn,
                  userLabel: "excluded parent",
                  modelId: model.id,
                  categoryId: category.id,
                });
                insertModeledElement({
                  txn,
                  userLabel: "matching child of excluded parent",
                  modelId: model.id,
                  categoryId: category.id,
                  parentId: excludedParent.id,
                });
              }),
            );
            const { imodelConnection } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: { elements: { ...showElementsConfig.elements, excludedClasses: [elementClassName] } },
              searchText: "matching",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([]);
          });

          it("does not return excluded child elements when their parent is not excluded", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "model" });
                const category = insertCategory({ txn, codeValue: "cat" });
                const keptParent = insertElement({
                  txn,
                  userLabel: "kept parent",
                  modelId: model.id,
                  categoryId: category.id,
                });
                insertModeledElement({
                  txn,
                  userLabel: "matching excluded child",
                  modelId: model.id,
                  categoryId: category.id,
                  parentId: keptParent.id,
                });
              }),
            );
            const { imodelConnection } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: {
                elements: { ...showElementsConfig.elements, excludedClasses: [subModeledElementBaseClassName] },
              },
              searchText: "matching",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([]);
          });

          it("returns the category even when its only sub-model element is excluded", async () => {
            await using buildIModelResult = await buildIModel(async (imodel) =>
              withEditTxn(imodel, (txn) => {
                const model = insertElementsModel({ txn, codeValue: "model" });
                const category = insertCategory({ txn, codeValue: "cat" });
                const excludedCategory = insertCategory({ txn, codeValue: "matching excluded category" });
                const modeledElement = insertModeledElement({
                  txn,
                  userLabel: "modeled element",
                  modelId: model.id,
                  categoryId: category.id,
                });
                const subModel = insertElementsSubModel({ txn, modeledElementId: modeledElement.id });
                insertElement({
                  txn,
                  userLabel: "excluded element",
                  modelId: subModel.id,
                  categoryId: excludedCategory.id,
                });
                return { excludedCategory };
              }),
            );
            const { imodelConnection, ...keys } = buildIModelResult;
            const imodelAccess = createIModelAccess(imodelConnection);
            const searchProps = createCategoriesTreeSearchProps({
              imodelConnection,
              hierarchyConfig: {
                elements: { nodes: "exclude", excludedClasses: [elementClassName] },
              } as CategoriesTreeHierarchyConfiguration,
              searchText: "matching",
              viewType,
            });
            expect(
              await CategoriesTreeDefinition.createSearchTree({
                ...searchProps,
                imodelAccess,
                abortSignal: new AbortController().signal,
              }),
            ).toEqual([
              {
                identifier: keys.excludedCategory,
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ]);
          });
        });
      });
    });
  });
});

function createCategoriesTreeSearchProps(props: {
  imodelConnection: IModelConnection;
  viewType: "2d" | "3d";
  hierarchyConfig?: CategoriesTreeHierarchyConfiguration;
  searchText: string;
  searchLimit?: number | "unbounded";
}) {
  const hierarchyConfig = mergeWithDefaults({
    defaults: defaultHierarchyConfiguration,
    overrides: props.hierarchyConfig,
  });
  const imodelAccess = createIModelAccess(props.imodelConnection);
  const excludedElementClassNames =
    hierarchyConfig.elements.nodes === "include" ? hierarchyConfig.elements.excludedClasses : undefined;
  const idsProvider = createCategoriesTreeIdsProvider({
    queryExecutor: imodelAccess,
    type: props.viewType,
    baseIdsProvider: createBaseIdsProvider({
      queryExecutor: imodelAccess,
      elementClassName: getClassesByView(props.viewType).elementClass,
      excludedElementClassNames,
    }),
  });
  return {
    idsProvider,
    viewType: props.viewType,
    hierarchyConfig,
    label: props.searchText,
    limit: props.searchLimit,
    revealTargets: true,
  };
}
