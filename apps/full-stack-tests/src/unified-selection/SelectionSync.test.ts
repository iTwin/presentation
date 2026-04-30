/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  getDefaultSubcategoryKey,
  insertDrawingCategory,
  insertDrawingGraphic,
  insertDrawingModelWithPartition,
  insertFunctionalElement,
  insertFunctionalModelWithPartition,
  insertGroupInformationElement,
  insertGroupInformationModelWithPartition,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
  insertSubCategory,
  insertSubject,
  waitFor,
} from "presentation-test-utilities";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createStorage, enableUnifiedSelectionSyncWithIModel, Selectables } from "@itwin/unified-selection";
import { buildTestIModel, createSchemaContext } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { getSchemaFromPackage } from "./getSchema.js";

import type { Id64Arg, Id64Set } from "@itwin/core-bentley";
import type { IModelConnection } from "@itwin/core-frontend";
import type { Props } from "@itwin/presentation-shared";
import type { HiliteSet, SelectableInstanceKey, SelectionScope, SelectionStorage } from "@itwin/unified-selection";

describe("Unified selection sync with iModel", () => {
  let imodelConnection: IModelConnection;
  let selectionStorage: SelectionStorage;

  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  beforeEach(async () => {
    selectionStorage = createStorage();
  });

  afterEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (imodelConnection) {
      selectionStorage.clearStorage({ imodelKey: createIModelKey(imodelConnection) });
      await imodelConnection.close();
    }
  });

  function getStorageSelection(): Selectables {
    return selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) });
  }

  function enableSync(props?: { selectionScope?: SelectionScope }): Disposable {
    const schemaProvider = createECSchemaProvider(createSchemaContext(imodelConnection));
    const classHierarchyInspector = createCachingECClassHierarchyInspector({ schemaProvider });
    const queryExecutor = createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodelConnection), 123);
    const dispose = enableUnifiedSelectionSyncWithIModel({
      imodelAccess: {
        key: createIModelKey(imodelConnection),
        ...schemaProvider,
        ...classHierarchyInspector,
        ...queryExecutor,
        selectionSet: imodelConnection.selectionSet,
        hiliteSet: imodelConnection.hilited,
      },
      selectionStorage,
      activeScopeProvider: () => props?.selectionScope ?? "element",
    });
    return { [Symbol.dispose]: dispose };
  }

  describe("Subject", () => {
    it("syncs subjects selection", async () => {
      let subjectKey: SelectableInstanceKey;
      let modelKeys: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            subjectKey = insertSubject({ txn, codeValue: "test subject" });
            const subject2 = insertSubject({ txn, codeValue: "subject 2", parentId: subjectKey.id });
            const subject3 = insertSubject({ txn, codeValue: "subject 3", parentId: subjectKey.id });
            const subject4 = insertSubject({ txn, codeValue: "subject 4", parentId: subject3.id });
            modelKeys = [
              insertPhysicalModelWithPartition({ txn, codeValue: "model 1", partitionParentId: subject2.id }),
              insertPhysicalModelWithPartition({ txn, codeValue: "model 2", partitionParentId: subject4.id }),
            ];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [subjectKey!],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: modelKeys.map(({ id }) => id),
          subCategories: [],
          elements: [],
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: modelKeys.map(({ id }) => id), subCategories: [], elements: [] }
            : { elements: [] },
        );
      });

      if (is5xSelectionSet(imodelConnection.selectionSet)) {
        imodelConnection.selectionSet.emptyAll();
        await waitFor(() => {
          expect(
            Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
          ).toBe(true);
          expect(imodelConnection.hilited.isEmpty).toBe(true);
        });
      }
    });
  });

  describe("Model", () => {
    it("syncs model selection", async () => {
      let modelKey: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          modelKey = withEditTxn(imodel, (txn) => insertPhysicalModelWithPartition({ txn, codeValue: "test model" }));
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [modelKey!],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({ models: [modelKey!.id], subCategories: [], elements: [] });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [modelKey!.id], subCategories: [], elements: [] }
            : { elements: [] },
        );
      });

      if (is5xSelectionSet(imodelConnection.selectionSet)) {
        imodelConnection.selectionSet.emptyAll();
        await waitFor(() => {
          expect(
            Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
          ).toBe(true);
          expect(imodelConnection.hilited.isEmpty).toBe(true);
        });
      }
    });
  });

  describe("Category", () => {
    it("syncs category selection", async () => {
      let categoryKey: SelectableInstanceKey;
      let subCategoryKeys: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });

            subCategoryKeys = [
              getDefaultSubcategoryKey(categoryKey.id),
              insertSubCategory({ txn, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
              insertSubCategory({ txn, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
            ];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [categoryKey!],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: subCategoryKeys.map(({ id }) => id),
          elements: [],
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: subCategoryKeys.map(({ id }) => id), elements: [] }
            : { elements: [] },
        );
      });

      if (is5xSelectionSet(imodelConnection.selectionSet)) {
        imodelConnection.selectionSet.emptyAll();
        await waitFor(() => {
          expect(
            Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
          ).toBe(true);
          expect(imodelConnection.hilited.isEmpty).toBe(true);
        });
      }
    });

    it("syncs subcategory selection", async () => {
      let categoryKey: SelectableInstanceKey;

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          categoryKey = withEditTxn(imodel, (txn) => insertSpatialCategory({ txn, codeValue: "test category" }));
        })
      ).imodelConnection;
      const subCategoryKey = getDefaultSubcategoryKey(categoryKey!.id);

      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [subCategoryKey],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [subCategoryKey.id],
          elements: [],
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [subCategoryKey.id], elements: [] }
            : { elements: [] },
        );
      });

      if (is5xSelectionSet(imodelConnection.selectionSet)) {
        imodelConnection.selectionSet.emptyAll();
        await waitFor(() => {
          expect(
            Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
          ).toBe(true);
          expect(imodelConnection.hilited.isEmpty).toBe(true);
        });
      }
    });

    it("syncs category and subcategory selection", async () => {
      let categoryKey: SelectableInstanceKey;
      let subCategoryKeys: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            subCategoryKeys = [
              getDefaultSubcategoryKey(categoryKey.id),
              insertSubCategory({ txn, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
              insertSubCategory({ txn, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
            ];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [categoryKey!, subCategoryKeys![0]],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: subCategoryKeys.map(({ id }) => id),
          elements: [],
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: subCategoryKeys.map(({ id }) => id), elements: [] }
            : { elements: [] },
        );
      });

      if (is5xSelectionSet(imodelConnection.selectionSet)) {
        imodelConnection.selectionSet.emptyAll();
        await waitFor(() => {
          expect(
            Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
          ).toBe(true);
          expect(imodelConnection.hilited.isEmpty).toBe(true);
        });
      }
    });
  });

  describe("Element", () => {
    it("syncs assembly element selection", async () => {
      let assemblyKey: SelectableInstanceKey;
      let childElementKeys: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            assemblyKey = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            const element2 = insertPhysicalElement({
              txn,
              userLabel: "element 2",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey.id,
            });
            const element3 = insertPhysicalElement({
              txn,
              userLabel: "element 3",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey.id,
            });
            const element4 = insertPhysicalElement({
              txn,
              userLabel: "element 4",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: element3.id,
            });
            const element5 = insertPhysicalElement({
              txn,
              userLabel: "element 5",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: element3.id,
            });
            childElementKeys = [element2, element3, element4, element5];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [assemblyKey!],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [],
          elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [], elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)] }
            : { elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)] },
        );
      });

      imodelConnection.selectionSet.emptyAll();
      await waitFor(() => {
        expect(
          Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
        ).toBe(true);
        expect(imodelConnection.hilited.isEmpty).toBe(true);
      });
    });

    it("multiple elements selection", async () => {
      let elementKeys: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          await withEditTxn(imodel, async (txn) => {
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            elementKeys = [
              insertPhysicalElement({ txn, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
              insertPhysicalElement({ txn, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
              insertPhysicalElement({ txn, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
            ];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: elementKeys!,
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [],
          elements: elementKeys.map(({ id }) => id),
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [], elements: elementKeys.map(({ id }) => id) }
            : { elements: elementKeys.map(({ id }) => id) },
        );
      });

      imodelConnection.selectionSet.emptyAll();
      await waitFor(() => {
        expect(
          Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
        ).toBe(true);
        expect(imodelConnection.hilited.isEmpty).toBe(true);
      });
    });

    it("syncs selection after selection set changes to different assembly elements", async () => {
      let assemblyKey: SelectableInstanceKey;
      let childElementKeys: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            const modelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            assemblyKey = insertPhysicalElement({
              txn,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            const element2 = insertPhysicalElement({
              txn,
              userLabel: "element 2",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey.id,
            });
            const element3 = insertPhysicalElement({
              txn,
              userLabel: "element 3",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey.id,
            });
            const element4 = insertPhysicalElement({
              txn,
              userLabel: "element 4",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: element3.id,
            });
            const element5 = insertPhysicalElement({
              txn,
              userLabel: "element 5",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: element3.id,
            });
            childElementKeys = [element2, element3, element4, element5];
          });
        })
      ).imodelConnection;
      using _ = enableSync({ selectionScope: { id: "element", ancestorLevel: -1 } });

      imodelConnection.selectionSet.replace(childElementKeys![0].id);
      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [],
          elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [], elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)] }
            : { elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)] },
        );
        expect(getStorageSelection()).toEqual(Selectables.create([assemblyKey!]));
      });

      imodelConnection.selectionSet.replace(childElementKeys![1].id);
      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [],
          elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [], elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)] }
            : { elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)] },
        );
        expect(getStorageSelection()).toEqual(Selectables.create([assemblyKey!]));
      });
    });
  });

  describe("Functional element", () => {
    it("syncs functional element with related physical elements selection", async () => {
      let functionalElement: SelectableInstanceKey;
      let physicalElement: SelectableInstanceKey;
      let expectedElements: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          await withEditTxn(imodel, async (txn) => {
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
            const functionalModelKey = insertFunctionalModelWithPartition({ txn, codeValue: "test functional model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            physicalElement = insertPhysicalElement({
              txn,
              userLabel: "element",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
            });
            const physicalElementChild = insertPhysicalElement({
              txn,
              userLabel: "child element 1",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
              parentId: physicalElement.id,
            });
            const physicalElementChild2 = insertPhysicalElement({
              txn,
              userLabel: "child element 2",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
              parentId: physicalElement.id,
            });
            const physicalElementChildChild = insertPhysicalElement({
              txn,
              userLabel: "child 1 child element",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
              parentId: physicalElementChild.id,
            });
            functionalElement = insertFunctionalElement({
              txn,
              modelId: functionalModelKey.id,
              representedElementId: physicalElement.id,
              relationshipName: "PhysicalElementFulfillsFunction",
            });
            expectedElements = [
              physicalElement,
              physicalElementChild,
              physicalElementChild2,
              physicalElementChildChild,
            ];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [functionalElement!],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [],
          elements: expectedElements.map(({ id }) => id),
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [], elements: expectedElements.map(({ id }) => id) }
            : { elements: expectedElements.map(({ id }) => id) },
        );
      });

      imodelConnection.selectionSet.emptyAll();
      await waitFor(() => {
        expect(
          Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
        ).toBe(true);
        expect(imodelConnection.hilited.isEmpty).toBe(true);
      });
    });

    it("syncs functional element with related graphic elements selection", async () => {
      let functionalElement: SelectableInstanceKey;
      let graphicsElement: SelectableInstanceKey;
      let expectedElements: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          await withEditTxn(imodel, async (txn) => {
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const drawingModelKey = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
            const functionalModelKey = insertFunctionalModelWithPartition({ txn, codeValue: "test functional model" });
            const categoryKey = insertDrawingCategory({ txn, codeValue: "test drawing category" });
            graphicsElement = insertDrawingGraphic({ txn, modelId: drawingModelKey.id, categoryId: categoryKey.id });
            const graphicsElementChild = insertDrawingGraphic({
              txn,
              modelId: drawingModelKey.id,
              categoryId: categoryKey.id,
              parentId: graphicsElement.id,
            });
            const graphicsElementChild2 = insertDrawingGraphic({
              txn,
              modelId: drawingModelKey.id,
              categoryId: categoryKey.id,
              parentId: graphicsElementChild.id,
            });
            const graphicsElementChildChild = insertDrawingGraphic({
              txn,
              modelId: drawingModelKey.id,
              categoryId: categoryKey.id,
              parentId: graphicsElementChild.id,
            });
            functionalElement = insertFunctionalElement({
              txn,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElement.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            });
            expectedElements = [
              graphicsElement,
              graphicsElementChild,
              graphicsElementChild2,
              graphicsElementChildChild,
            ];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [functionalElement!],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [],
          elements: expectedElements.map(({ id }) => id),
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [], elements: expectedElements.map(({ id }) => id) }
            : { elements: expectedElements.map(({ id }) => id) },
        );
      });

      imodelConnection.selectionSet.emptyAll();
      await waitFor(() => {
        expect(
          Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
        ).toBe(true);
        expect(imodelConnection.hilited.isEmpty).toBe(true);
      });
    });
  });

  describe("Group information element", () => {
    it("syncs group information element selection", async () => {
      let groupInformationElement: SelectableInstanceKey;
      let expectedElements: SelectableInstanceKey[];

      imodelConnection = (
        await buildTestIModel(async (imodel) => {
          await withEditTxn(imodel, async (txn) => {
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const groupModel = insertGroupInformationModelWithPartition({ txn, codeValue: "group information model" });
            const physicalModelKey = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
            const categoryKey = insertSpatialCategory({ txn, codeValue: "test category" });
            groupInformationElement = insertGroupInformationElement({ txn, modelId: groupModel.id });
            const physicalElementGroupMember = insertPhysicalElement({
              txn,
              userLabel: "child element 1",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
            });
            txn.insertRelationship({
              sourceId: groupInformationElement.id,
              targetId: physicalElementGroupMember.id,
              classFullName: "BisCore.ElementGroupsMembers",
            });
            const physicalElementGroupMember2 = insertPhysicalElement({
              txn,
              userLabel: "child element 2",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
            });
            txn.insertRelationship({
              sourceId: groupInformationElement.id,
              targetId: physicalElementGroupMember2.id,
              classFullName: "BisCore.ElementGroupsMembers",
            });
            const physicalElementGroupMemberChild = insertPhysicalElement({
              txn,
              userLabel: "child 1 child element",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
              parentId: physicalElementGroupMember.id,
            });
            expectedElements = [
              physicalElementGroupMember,
              physicalElementGroupMember2,
              physicalElementGroupMemberChild,
            ];
          });
        })
      ).imodelConnection;
      using _ = enableSync();

      selectionStorage.addToSelection({
        imodelKey: createIModelKey(imodelConnection),
        source: "test",
        selectables: [groupInformationElement!],
      });

      await waitFor(() => {
        expect(getHiliteSet(imodelConnection)).toEqual({
          models: [],
          subCategories: [],
          elements: expectedElements.map(({ id }) => id),
        });
        expect(getSelectionSet(imodelConnection)).toEqual(
          is5xSelectionSet(imodelConnection.selectionSet)
            ? { models: [], subCategories: [], elements: expectedElements.map(({ id }) => id) }
            : { elements: expectedElements.map(({ id }) => id) },
        );
      });

      imodelConnection.selectionSet.emptyAll();
      await waitFor(() => {
        expect(
          Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodelConnection) })),
        ).toBe(true);
        expect(imodelConnection.hilited.isEmpty).toBe(true);
      });
    });
  });
});

function getHiliteSet(imodel: IModelConnection): HiliteSet {
  return {
    models: imodel.hilited.models.toId64Array().sort(),
    subCategories: imodel.hilited.subcategories.toId64Array().sort(),
    elements: imodel.hilited.elements.toId64Array().sort(),
  };
}
function getSelectionSet(imodel: IModelConnection): HiliteSet | Pick<HiliteSet, "elements"> {
  const ss: CoreIModelSelectionSet = imodel.selectionSet;
  if (is5xSelectionSet(ss)) {
    return {
      models: [...ss.active.models].sort(),
      subCategories: [...ss.active.subcategories].sort(),
      elements: [...ss.active.elements].sort(),
    };
  }
  return { elements: [...ss.elements].sort() };
}

interface CoreSelectableIds {
  elements?: Id64Arg;
  models?: Id64Arg;
  subcategories?: Id64Arg;
}
type CoreIModelSelectionSet = Props<typeof enableUnifiedSelectionSyncWithIModel>["imodelAccess"]["selectionSet"];
function is5xSelectionSet(
  selectionSet: CoreIModelSelectionSet,
): selectionSet is Omit<CoreIModelSelectionSet, "add" | "remove"> & {
  readonly active: { [P in keyof CoreSelectableIds]-?: Id64Set };
  add: (ids: Id64Arg | CoreSelectableIds) => boolean;
  remove: (ids: Id64Arg | CoreSelectableIds) => boolean;
} {
  return "active" in selectionSet;
}
