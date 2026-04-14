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
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHiliteSetProvider, Selectables } from "@itwin/unified-selection";
import { createIModelAccess } from "../hierarchies/Utils.js";
import { buildTestIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { getSchemaFromPackage } from "./getSchema.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { SelectableInstanceKey } from "@itwin/unified-selection";

describe("HiliteSet", () => {
  let imodelConnection: IModelConnection;

  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  async function loadHiliteSet(selectables: Selectables) {
    const provider = createHiliteSetProvider({ imodelAccess: createIModelAccess(imodelConnection) });
    const iterator = provider.getHiliteSet({ selectables });

    const models: string[] = [];
    const subCategories: string[] = [];
    const elements: string[] = [];

    for await (const set of iterator) {
      models.push(...set.models);
      subCategories.push(...set.subCategories);
      elements.push(...set.elements);
    }

    return { models, subCategories, elements };
  }

  describe("Hiliting selection", () => {
    describe("Subject", () => {
      it("hilites models directly under subject", async () => {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            subjectKey = insertSubject({ imodel, codeValue: "test subject" });
            modelKeys = [
              insertPhysicalModelWithPartition({ imodel, codeValue: "model 1", partitionParentId: subjectKey.id }),
              insertPhysicalModelWithPartition({ imodel, codeValue: "model 2", partitionParentId: subjectKey.id }),
            ];
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([subjectKey!]));

        expect(hiliteSet.models).toHaveLength(modelKeys!.length);
        expect(hiliteSet.models).toEqual(expect.arrayContaining(modelKeys!.map((k) => k.id)));
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(0);
        expect(imodelConnection.selectionSet.size).toBe(0);
      });

      it("hilites models nested deeply under subject", async () => {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            subjectKey = insertSubject({ imodel, codeValue: "test subject" });
            const subject2 = insertSubject({ imodel, codeValue: "subject 2", parentId: subjectKey.id });
            const subject3 = insertSubject({ imodel, codeValue: "subject 3", parentId: subjectKey.id });
            const subject4 = insertSubject({ imodel, codeValue: "subject 4", parentId: subject3.id });
            modelKeys = [
              insertPhysicalModelWithPartition({ imodel, codeValue: "model 1", partitionParentId: subject2.id }),
              insertPhysicalModelWithPartition({ imodel, codeValue: "model 2", partitionParentId: subject4.id }),
            ];
          })
        ).imodelConnection;
        const hiliteSet = await loadHiliteSet(Selectables.create([subjectKey!]));

        expect(hiliteSet.models).toHaveLength(modelKeys!.length);
        expect(hiliteSet.models).toEqual(expect.arrayContaining(modelKeys!.map((k) => k.id)));
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(0);
      });
    });

    describe("Model", () => {
      it("hilites model", async () => {
        let modelKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            modelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test model" });
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([modelKey!]));

        expect(hiliteSet.models).toHaveLength(1);
        expect(hiliteSet.models).toContain(modelKey!.id);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(0);
        expect(imodelConnection.selectionSet.size).toBe(0);
      });
    });

    describe("Category", () => {
      it("hilites category's subcategories", async () => {
        let categoryKey: SelectableInstanceKey;
        let subCategoryKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
            subCategoryKeys = [
              getDefaultSubcategoryKey(categoryKey.id),
              insertSubCategory({ imodel, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
              insertSubCategory({ imodel, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
            ];
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([categoryKey!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(subCategoryKeys!.length);
        expect(hiliteSet.subCategories).toEqual(expect.arrayContaining(subCategoryKeys!.map((k) => k.id)));
        expect(hiliteSet.elements).toHaveLength(0);
      });

      it("hilites subcategory", async () => {
        let categoryKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
          })
        ).imodelConnection;

        const subCategoryKey = getDefaultSubcategoryKey(categoryKey!.id);
        const hiliteSet = await loadHiliteSet(Selectables.create([subCategoryKey]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(1);
        expect(hiliteSet.subCategories).toContain(subCategoryKey.id);
        expect(hiliteSet.elements).toHaveLength(0);
      });

      it("hilites when category and subcategory selected", async () => {
        let categoryKey: SelectableInstanceKey;
        let subCategoryKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
            subCategoryKeys = [
              getDefaultSubcategoryKey(categoryKey.id),
              insertSubCategory({ imodel, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
              insertSubCategory({ imodel, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
            ];
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([categoryKey!, subCategoryKeys![0]]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(subCategoryKeys!.length);
        expect(hiliteSet.subCategories).toEqual(expect.arrayContaining(subCategoryKeys!.map((k) => k.id)));
        expect(hiliteSet.elements).toHaveLength(0);
      });
    });

    describe("Element", () => {
      it("hilites assembly element", async () => {
        let assemblyKey: SelectableInstanceKey;
        let expectedHighlightedElementKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            const modelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test model" });
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
            assemblyKey = insertPhysicalElement({
              imodel,
              userLabel: "element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
            const element2 = insertPhysicalElement({
              imodel,
              userLabel: "element 2",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey.id,
            });
            const element3 = insertPhysicalElement({
              imodel,
              userLabel: "element 3",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: assemblyKey.id,
            });
            const element4 = insertPhysicalElement({
              imodel,
              userLabel: "element 4",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: element3.id,
            });
            const element5 = insertPhysicalElement({
              imodel,
              userLabel: "element 5",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: element3.id,
            });
            expectedHighlightedElementKeys = [assemblyKey, element2, element3, element4, element5];
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([assemblyKey!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(expectedHighlightedElementKeys!.length);
        expect(hiliteSet.elements).toEqual(expect.arrayContaining(expectedHighlightedElementKeys!.map((k) => k.id)));
      });

      it("hilites leaf element", async () => {
        let elementKey: SelectableInstanceKey;

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            const modelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test model" });
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
            elementKey = insertPhysicalElement({
              imodel,
              userLabel: "element",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
            });
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([elementKey!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(1);
        expect(hiliteSet.elements).toContain(elementKey!.id);
      });

      it("hilites all selected elements", async () => {
        let elementKeys: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            const modelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test model" });
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
            elementKeys = [
              insertPhysicalElement({ imodel, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
              insertPhysicalElement({ imodel, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
              insertPhysicalElement({ imodel, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
            ];
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create(elementKeys!));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(elementKeys!.length);
        expect(hiliteSet.elements).toEqual(expect.arrayContaining(elementKeys!.map((k) => k.id)));
      });
    });

    describe("Functional element", () => {
      it("hilites functional element related physical elements", async () => {
        let functionalElement: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;
        let expectedElements: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const physicalModelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test physical model" });
            const functionalModelKey = insertFunctionalModelWithPartition({
              imodel,
              codeValue: "test functional model",
            });
            const categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
            physicalElement = insertPhysicalElement({
              imodel,
              userLabel: "element",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
            });
            const physicalElementChild = insertPhysicalElement({
              imodel,
              userLabel: "child element 1",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
              parentId: physicalElement.id,
            });
            const physicalElementChild2 = insertPhysicalElement({
              imodel,
              userLabel: "child element 2",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
              parentId: physicalElement.id,
            });
            const physicalElementChildChild = insertPhysicalElement({
              imodel,
              userLabel: "child 1 child element",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
              parentId: physicalElementChild.id,
            });
            functionalElement = insertFunctionalElement({
              imodel,
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
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([functionalElement!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(expectedElements!.length);
        expect(hiliteSet.elements).toEqual(expect.arrayContaining(expectedElements!.map((k) => k.id)));
      });

      it("hilites functional element related graphic elements", async () => {
        let functionalElement: SelectableInstanceKey;
        let graphicsElement: SelectableInstanceKey;
        let expectedElements: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const drawingModelKey = insertDrawingModelWithPartition({ imodel, codeValue: "test drawing model" });
            const functionalModelKey = insertFunctionalModelWithPartition({
              imodel,
              codeValue: "test functional model",
            });
            const categoryKey = insertDrawingCategory({ imodel, codeValue: "test drawing category" });
            graphicsElement = insertDrawingGraphic({ imodel, modelId: drawingModelKey.id, categoryId: categoryKey.id });
            const graphicsElementChild = insertDrawingGraphic({
              imodel,
              modelId: drawingModelKey.id,
              categoryId: categoryKey.id,
              parentId: graphicsElement.id,
            });
            const graphicsElementChild2 = insertDrawingGraphic({
              imodel,
              modelId: drawingModelKey.id,
              categoryId: categoryKey.id,
              parentId: graphicsElementChild.id,
            });
            const graphicsElementChildChild = insertDrawingGraphic({
              imodel,
              modelId: drawingModelKey.id,
              categoryId: categoryKey.id,
              parentId: graphicsElementChild.id,
            });
            functionalElement = insertFunctionalElement({
              imodel,
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
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([functionalElement!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(expectedElements!.length);
        expect(hiliteSet.elements).toEqual(expect.arrayContaining(expectedElements!.map((k) => k.id)));
      });
    });

    describe("Hilites GroupInformationElement", () => {
      it("hilites group information element related physical elements", async () => {
        let groupInformationElement: SelectableInstanceKey;
        let expectedElements: SelectableInstanceKey[];

        imodelConnection = (
          await buildTestIModel(async (imodel) => {
            const groupModel = insertGroupInformationModelWithPartition({
              imodel,
              codeValue: "group information model",
            });
            const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
            await imodel.importSchemaStrings([schema]);
            const physicalModelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test physical model" });
            const categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
            groupInformationElement = insertGroupInformationElement({ imodel, modelId: groupModel.id });
            const physicalElementGroupMember = insertPhysicalElement({
              imodel,
              userLabel: "child element 1",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
            });
            imodel.relationships.insertInstance({
              sourceId: groupInformationElement.id,
              targetId: physicalElementGroupMember.id,
              classFullName: "BisCore.ElementGroupsMembers",
            });
            const physicalElementGroupMember2 = insertPhysicalElement({
              imodel,
              userLabel: "child element 2",
              modelId: physicalModelKey.id,
              categoryId: categoryKey.id,
            });
            imodel.relationships.insertInstance({
              sourceId: groupInformationElement.id,
              targetId: physicalElementGroupMember2.id,
              classFullName: "BisCore.ElementGroupsMembers",
            });
            const physicalElementGroupMemberChild = insertPhysicalElement({
              imodel,
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
          })
        ).imodelConnection;

        const hiliteSet = await loadHiliteSet(Selectables.create([groupInformationElement!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(expectedElements!.length);
        expect(hiliteSet.elements).toEqual(expect.arrayContaining(expectedElements!.map((k) => k.id)));
      });
    });
  });
});
