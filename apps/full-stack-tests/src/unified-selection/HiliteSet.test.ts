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
import { IModelConnection } from "@itwin/core-frontend";
import { createHiliteSetProvider, SelectableInstanceKey, Selectables } from "@itwin/unified-selection";
import { createIModelAccess } from "../hierarchies/Utils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { buildTestIModel } from "../TestIModelSetup.js";
import { getSchemaFromPackage } from "./getSchema.js";

describe("HiliteSet", () => {
  let iModel: IModelConnection;

  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  async function loadHiliteSet(selectables: Selectables) {
    const provider = createHiliteSetProvider({ imodelAccess: createIModelAccess(iModel) });
    const iterator = provider.getHiliteSet({ selectables });

    const models: string[] = [];
    const subCategories: string[] = [];
    const elements: string[] = [];

    for await (const set of iterator) {
      models.push(...set.models);
      subCategories.push(...set.subCategories);
      elements.push(...set.elements);
    }

    return {
      models,
      subCategories,
      elements,
    };
  }

  describe("Hiliting selection", () => {
    describe("Subject", () => {
      it("hilites models directly under subject", async () => {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          subjectKey = insertSubject({ builder, codeValue: "test subject" });
          modelKeys = [
            insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subjectKey.id }),
            insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subjectKey.id }),
          ];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([subjectKey!]));

        expect(hiliteSet.models).toHaveLength(modelKeys!.length);
        expect(hiliteSet.models).toEqual(expect.arrayContaining(modelKeys!.map((k) => k.id)));
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(0);
        expect(iModel.selectionSet.size).toBe(0);
      });

      it("hilites models nested deeply under subject", async () => {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          subjectKey = insertSubject({ builder, codeValue: "test subject" });
          const subject2 = insertSubject({ builder, codeValue: "subject 2", parentId: subjectKey.id });
          const subject3 = insertSubject({ builder, codeValue: "subject 3", parentId: subjectKey.id });
          const subject4 = insertSubject({ builder, codeValue: "subject 4", parentId: subject3.id });
          modelKeys = [
            insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subject2.id }),
            insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subject4.id }),
          ];
        });
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

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([modelKey!]));

        expect(hiliteSet.models).toHaveLength(1);
        expect(hiliteSet.models).toContain(modelKey!.id);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(0);
        expect(iModel.selectionSet.size).toBe(0);
      });
    });

    describe("Category", () => {
      it("hilites category's subcategories", async () => {
        let categoryKey: SelectableInstanceKey;
        let subCategoryKeys: SelectableInstanceKey[];

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          subCategoryKeys = [
            getDefaultSubcategoryKey(categoryKey.id),
            insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
            insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
          ];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([categoryKey!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(subCategoryKeys!.length);
        expect(hiliteSet.subCategories).toEqual(expect.arrayContaining(subCategoryKeys!.map((k) => k.id)));
        expect(hiliteSet.elements).toHaveLength(0);
      });

      it("hilites subcategory", async () => {
        let categoryKey: SelectableInstanceKey;

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        });

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

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          subCategoryKeys = [
            getDefaultSubcategoryKey(categoryKey.id),
            insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
            insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
          ];
        });

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

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
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
          expectedHighlightedElementKeys = [assemblyKey, element2, element3, element4, element5];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([assemblyKey!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(expectedHighlightedElementKeys!.length);
        expect(hiliteSet.elements).toEqual(expect.arrayContaining(expectedHighlightedElementKeys!.map((k) => k.id)));
      });

      it("hilites leaf element", async () => {
        let elementKey: SelectableInstanceKey;

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          elementKey = insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id });
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([elementKey!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(1);
        expect(hiliteSet.elements).toContain(elementKey!.id);
      });

      it("hilites all selected elements", async () => {
        let elementKeys: SelectableInstanceKey[];

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
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

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
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

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
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

        iModel = await buildTestIModel(expect.getState().currentTestName!, async (builder) => {
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

        const hiliteSet = await loadHiliteSet(Selectables.create([groupInformationElement!]));

        expect(hiliteSet.models).toHaveLength(0);
        expect(hiliteSet.subCategories).toHaveLength(0);
        expect(hiliteSet.elements).toHaveLength(expectedElements!.length);
        expect(hiliteSet.elements).toEqual(expect.arrayContaining(expectedElements!.map((k) => k.id)));
      });
    });
  });
});
