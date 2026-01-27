/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import path from "path";
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
import { Id64Arg, Id64Set } from "@itwin/core-bentley";
import { RpcConfiguration, RpcManager } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector, Props } from "@itwin/presentation-shared";
import { buildTestIModel, initialize, terminate } from "@itwin/presentation-testing";
import {
  createStorage,
  enableUnifiedSelectionSyncWithIModel,
  HiliteSet,
  SelectableInstanceKey,
  Selectables,
  SelectionScope,
  SelectionStorage,
} from "@itwin/unified-selection";
import { createSchemaContext } from "../IModelUtils.js";
import { getSchemaFromPackage } from "./getSchema.js";

describe("Unified selection sync with iModel", () => {
  let imodel: IModelConnection;
  let selectionStorage: SelectionStorage;

  before(async () => {
    await initialize({
      backendHostProps: {
        cacheDir: path.join(import.meta.dirname, ".cache", `${process.pid}`),
      },
    });
    RpcManager.registerImpl(ECSchemaRpcInterface, ECSchemaRpcImpl);
    RpcConfiguration.developmentMode = true;
    RpcManager.initializeInterface(ECSchemaRpcInterface);
  });

  after(async () => {
    await terminate();
  });

  beforeEach(async () => {
    selectionStorage = createStorage();
  });

  afterEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (imodel) {
      selectionStorage.clearStorage({ imodelKey: createIModelKey(imodel) });
      await imodel.close();
    }
  });

  function getStorageSelection(): Selectables {
    return selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) });
  }

  function enableSync(props?: { selectionScope?: SelectionScope }): Disposable {
    const schemaProvider = createECSchemaProvider(createSchemaContext(imodel));
    const classHierarchyInspector = createCachingECClassHierarchyInspector({ schemaProvider });
    const queryExecutor = createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 123);
    const dispose = enableUnifiedSelectionSyncWithIModel({
      imodelAccess: {
        key: createIModelKey(imodel),
        ...schemaProvider,
        ...classHierarchyInspector,
        ...queryExecutor,
        selectionSet: imodel.selectionSet,
        hiliteSet: imodel.hilited,
      },
      selectionStorage,
      activeScopeProvider: () => props?.selectionScope ?? "element",
    });
    return {
      [Symbol.dispose]: dispose,
    };
  }

  describe("Subject", () => {
    it("syncs subjects selection", async function () {
      let subjectKey: SelectableInstanceKey;
      let modelKeys: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        subjectKey = insertSubject({ builder, codeValue: "test subject" });
        const subject2 = insertSubject({ builder, codeValue: "subject 2", parentId: subjectKey.id });
        const subject3 = insertSubject({ builder, codeValue: "subject 3", parentId: subjectKey.id });
        const subject4 = insertSubject({ builder, codeValue: "subject 4", parentId: subject3.id });
        modelKeys = [
          insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subject2.id }),
          insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subject4.id }),
        ];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [subjectKey!] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: modelKeys.map(({ id }) => id),
          subCategories: [],
          elements: [],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: modelKeys.map(({ id }) => id),
                subCategories: [],
                elements: [],
              }
            : {
                elements: [],
              },
        );
      });

      if (is5xSelectionSet(imodel.selectionSet)) {
        imodel.selectionSet.emptyAll();
        await waitFor(() => {
          expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
          expect(imodel.hilited.isEmpty).to.be.true;
        });
      }
    });
  });

  describe("Model", () => {
    it("syncs model selection", async function () {
      let modelKey: SelectableInstanceKey;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [modelKey!] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [modelKey!.id],
          subCategories: [],
          elements: [],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [modelKey!.id],
                subCategories: [],
                elements: [],
              }
            : {
                elements: [],
              },
        );
      });

      if (is5xSelectionSet(imodel.selectionSet)) {
        imodel.selectionSet.emptyAll();
        await waitFor(() => {
          expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
          expect(imodel.hilited.isEmpty).to.be.true;
        });
      }
    });
  });

  describe("Category", () => {
    it("syncs category selection", async function () {
      let categoryKey: SelectableInstanceKey;
      let subCategoryKeys: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        subCategoryKeys = [
          getDefaultSubcategoryKey(categoryKey.id),
          insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
          insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
        ];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [categoryKey!] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: subCategoryKeys.map(({ id }) => id),
          elements: [],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: subCategoryKeys.map(({ id }) => id),
                elements: [],
              }
            : {
                elements: [],
              },
        );
      });

      if (is5xSelectionSet(imodel.selectionSet)) {
        imodel.selectionSet.emptyAll();
        await waitFor(() => {
          expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
          expect(imodel.hilited.isEmpty).to.be.true;
        });
      }
    });

    it("syncs subcategory selection", async function () {
      let categoryKey: SelectableInstanceKey;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
      });
      const subCategoryKey = getDefaultSubcategoryKey(categoryKey!.id);

      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [subCategoryKey] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [subCategoryKey.id],
          elements: [],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [subCategoryKey.id],
                elements: [],
              }
            : {
                elements: [],
              },
        );
      });

      if (is5xSelectionSet(imodel.selectionSet)) {
        imodel.selectionSet.emptyAll();
        await waitFor(() => {
          expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
          expect(imodel.hilited.isEmpty).to.be.true;
        });
      }
    });

    it("syncs category and subcategory selection", async function () {
      let categoryKey: SelectableInstanceKey;
      let subCategoryKeys: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        subCategoryKeys = [
          getDefaultSubcategoryKey(categoryKey.id),
          insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
          insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
        ];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [categoryKey!, subCategoryKeys![0]] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: subCategoryKeys.map(({ id }) => id),
          elements: [],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: subCategoryKeys.map(({ id }) => id),
                elements: [],
              }
            : {
                elements: [],
              },
        );
      });

      if (is5xSelectionSet(imodel.selectionSet)) {
        imodel.selectionSet.emptyAll();
        await waitFor(() => {
          expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
          expect(imodel.hilited.isEmpty).to.be.true;
        });
      }
    });
  });

  describe("Element", () => {
    it("syncs assembly element selection", async function () {
      let assemblyKey: SelectableInstanceKey;
      let childElementKeys: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        assemblyKey = insertPhysicalElement({ builder, userLabel: "element 1", modelId: modelKey.id, categoryId: categoryKey.id });
        const element2 = insertPhysicalElement({
          builder,
          userLabel: "element 2",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: assemblyKey.id,
        });
        const element3 = insertPhysicalElement({
          builder,
          userLabel: "element 3",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: assemblyKey.id,
        });
        const element4 = insertPhysicalElement({ builder, userLabel: "element 4", modelId: modelKey.id, categoryId: categoryKey.id, parentId: element3.id });
        const element5 = insertPhysicalElement({ builder, userLabel: "element 5", modelId: modelKey.id, categoryId: categoryKey.id, parentId: element3.id });
        childElementKeys = [element2, element3, element4, element5];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [assemblyKey!] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [],
          elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [],
                elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
              }
            : {
                elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
              },
        );
      });

      imodel.selectionSet.emptyAll();
      await waitFor(() => {
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
        expect(imodel.hilited.isEmpty).to.be.true;
      });
    });

    it("multiple elements selection", async function () {
      let elementKeys: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
        await builder.importSchema(schema);
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        elementKeys = [
          insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
          insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
          insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
        ];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: elementKeys! });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [],
          elements: elementKeys.map(({ id }) => id),
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [],
                elements: elementKeys.map(({ id }) => id),
              }
            : {
                elements: elementKeys.map(({ id }) => id),
              },
        );
      });

      imodel.selectionSet.emptyAll();
      await waitFor(() => {
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
        expect(imodel.hilited.isEmpty).to.be.true;
      });
    });

    it("syncs selection after selection set changes to different assembly elements", async function () {
      let assemblyKey: SelectableInstanceKey;
      let childElementKeys: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        assemblyKey = insertPhysicalElement({ builder, userLabel: "element 1", modelId: modelKey.id, categoryId: categoryKey.id });
        const element2 = insertPhysicalElement({
          builder,
          userLabel: "element 2",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: assemblyKey.id,
        });
        const element3 = insertPhysicalElement({
          builder,
          userLabel: "element 3",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: assemblyKey.id,
        });
        const element4 = insertPhysicalElement({ builder, userLabel: "element 4", modelId: modelKey.id, categoryId: categoryKey.id, parentId: element3.id });
        const element5 = insertPhysicalElement({ builder, userLabel: "element 5", modelId: modelKey.id, categoryId: categoryKey.id, parentId: element3.id });
        childElementKeys = [element2, element3, element4, element5];
      });
      using _ = enableSync({ selectionScope: { id: "element", ancestorLevel: -1 } });

      imodel.selectionSet.replace(childElementKeys![0].id);
      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [],
          elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [],
                elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
              }
            : {
                elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
              },
        );
        expect(getStorageSelection()).to.deep.eq(Selectables.create([assemblyKey!]));
      });

      imodel.selectionSet.replace(childElementKeys![1].id);
      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [],
          elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [],
                elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
              }
            : {
                elements: [assemblyKey.id, ...childElementKeys.map(({ id }) => id)],
              },
        );
        expect(getStorageSelection()).to.deep.eq(Selectables.create([assemblyKey!]));
      });
    });
  });

  describe("Functional element", () => {
    it("syncs functional element with related physical elements selection", async function () {
      let functionalElement: SelectableInstanceKey;
      let physicalElement: SelectableInstanceKey;
      let expectedElements: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
        await builder.importSchema(schema);
        const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
        const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        physicalElement = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
        const physicalElementChild = insertPhysicalElement({
          builder,
          userLabel: "child element 1",
          modelId: physicalModelKey.id,
          categoryId: categoryKey.id,
          parentId: physicalElement.id,
        });
        const physicalElementChild2 = insertPhysicalElement({
          builder,
          userLabel: "child element 2",
          modelId: physicalModelKey.id,
          categoryId: categoryKey.id,
          parentId: physicalElement.id,
        });
        const physicalElementChildChild = insertPhysicalElement({
          builder,
          userLabel: "child 1 child element",
          modelId: physicalModelKey.id,
          categoryId: categoryKey.id,
          parentId: physicalElementChild.id,
        });
        functionalElement = insertFunctionalElement({
          builder,
          modelId: functionalModelKey.id,
          representedElementId: physicalElement.id,
          relationshipName: "PhysicalElementFulfillsFunction",
        });
        expectedElements = [physicalElement, physicalElementChild, physicalElementChild2, physicalElementChildChild];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [functionalElement!] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [],
          elements: expectedElements.map(({ id }) => id),
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [],
                elements: expectedElements.map(({ id }) => id),
              }
            : {
                elements: expectedElements.map(({ id }) => id),
              },
        );
      });

      imodel.selectionSet.emptyAll();
      await waitFor(() => {
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
        expect(imodel.hilited.isEmpty).to.be.true;
      });
    });

    it("syncs functional element with related graphic elements selection", async function () {
      let functionalElement: SelectableInstanceKey;
      let graphicsElement: SelectableInstanceKey;
      let expectedElements: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
        await builder.importSchema(schema);
        const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
        const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
        const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
        graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
        const graphicsElementChild = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElement.id });
        const graphicsElementChild2 = insertDrawingGraphic({
          builder,
          modelId: drawingModelKey.id,
          categoryId: categoryKey.id,
          parentId: graphicsElementChild.id,
        });
        const graphicsElementChildChild = insertDrawingGraphic({
          builder,
          modelId: drawingModelKey.id,
          categoryId: categoryKey.id,
          parentId: graphicsElementChild.id,
        });
        functionalElement = insertFunctionalElement({
          builder,
          modelId: functionalModelKey.id,
          representedElementId: graphicsElement.id,
          relationshipName: "DrawingGraphicRepresentsFunctionalElement",
        });
        expectedElements = [graphicsElement, graphicsElementChild, graphicsElementChild2, graphicsElementChildChild];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [functionalElement!] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [],
          elements: expectedElements.map(({ id }) => id),
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [],
                elements: expectedElements.map(({ id }) => id),
              }
            : {
                elements: expectedElements.map(({ id }) => id),
              },
        );
      });

      imodel.selectionSet.emptyAll();
      await waitFor(() => {
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
        expect(imodel.hilited.isEmpty).to.be.true;
      });
    });
  });

  describe("Group information element", () => {
    it("syncs group information element selection", async function () {
      let groupInformationElement: SelectableInstanceKey;
      let expectedElements: SelectableInstanceKey[];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel(this, async (builder) => {
        const groupModel = insertGroupInformationModelWithPartition({ builder, codeValue: "group information model" });
        const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
        await builder.importSchema(schema);
        const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        groupInformationElement = insertGroupInformationElement({
          builder,
          modelId: groupModel.id,
        });
        const physicalElementGroupMember = insertPhysicalElement({
          builder,
          userLabel: "child element 1",
          modelId: physicalModelKey.id,
          categoryId: categoryKey.id,
        });
        builder.insertRelationship({
          sourceId: groupInformationElement.id,
          targetId: physicalElementGroupMember.id,
          classFullName: "BisCore.ElementGroupsMembers",
        });
        const physicalElementGroupMember2 = insertPhysicalElement({
          builder,
          userLabel: "child element 2",
          modelId: physicalModelKey.id,
          categoryId: categoryKey.id,
        });
        builder.insertRelationship({
          sourceId: groupInformationElement.id,
          targetId: physicalElementGroupMember2.id,
          classFullName: "BisCore.ElementGroupsMembers",
        });
        const physicalElementGroupMemberChild = insertPhysicalElement({
          builder,
          userLabel: "child 1 child element",
          modelId: physicalModelKey.id,
          categoryId: categoryKey.id,
          parentId: physicalElementGroupMember.id,
        });
        expectedElements = [physicalElementGroupMember, physicalElementGroupMember2, physicalElementGroupMemberChild];
      });
      using _ = enableSync();

      selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [groupInformationElement!] });

      await waitFor(() => {
        expect(getHiliteSet(imodel)).to.deep.eq({
          models: [],
          subCategories: [],
          elements: expectedElements.map(({ id }) => id),
        });
        expect(getSelectionSet(imodel)).to.deep.eq(
          is5xSelectionSet(imodel.selectionSet)
            ? {
                models: [],
                subCategories: [],
                elements: expectedElements.map(({ id }) => id),
              }
            : {
                elements: expectedElements.map(({ id }) => id),
              },
        );
      });

      imodel.selectionSet.emptyAll();
      await waitFor(() => {
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;
        expect(imodel.hilited.isEmpty).to.be.true;
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
  return {
    elements: [...ss.elements].sort(),
  };
}

interface CoreSelectableIds {
  elements?: Id64Arg;
  models?: Id64Arg;
  subcategories?: Id64Arg;
}
type CoreIModelSelectionSet = Props<typeof enableUnifiedSelectionSyncWithIModel>["imodelAccess"]["selectionSet"];
function is5xSelectionSet(selectionSet: CoreIModelSelectionSet): selectionSet is Omit<CoreIModelSelectionSet, "add" | "remove"> & {
  readonly active: { [P in keyof CoreSelectableIds]-?: Id64Set };
  add: (ids: Id64Arg | CoreSelectableIds) => boolean;
  remove: (ids: Id64Arg | CoreSelectableIds) => boolean;
} {
  return "active" in selectionSet;
}
