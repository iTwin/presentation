/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";
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
} from "presentation-test-utilities";
import { RpcConfiguration, RpcManager } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { buildTestIModel, initialize, terminate } from "@itwin/presentation-testing";
import { SelectableInstanceKey, Selectables } from "@itwin/unified-selection";
import { createHiliteSetProvider } from "@itwin/unified-selection/lib/cjs/unified-selection/HiliteSetProvider";
import { createMetadataProvider } from "../hierarchies/Utils";

describe("HiliteSet", () => {
  let iModel: IModelConnection;

  before(async () => {
    await initialize();
    // eslint-disable-next-line @itwin/no-internal
    RpcManager.registerImpl(ECSchemaRpcInterface, ECSchemaRpcImpl);
    RpcConfiguration.developmentMode = true;
    RpcManager.initializeInterface(ECSchemaRpcInterface);
  });

  after(async () => {
    await terminate();
  });

  async function loadHiliteSet(selectables: Selectables) {
    const provider = createHiliteSetProvider({ queryExecutor: createECSqlQueryExecutor(iModel), metadataProvider: createMetadataProvider(iModel) });
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
      it("hilites models directly under subject", async function () {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          subjectKey = insertSubject({ builder, codeValue: "test subject" });
          modelKeys = [
            insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subjectKey.id }),
            insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subjectKey.id }),
          ];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([subjectKey!]));

        expect(hiliteSet.models)
          .to.have.lengthOf(modelKeys!.length)
          .and.to.include.members(modelKeys!.map((k) => k.id));
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements).to.be.empty;
        expect(iModel.selectionSet.size).to.eq(0);
      });

      it("hilites models nested deeply under subject", async function () {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
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

        expect(hiliteSet.models)
          .to.have.lengthOf(modelKeys!.length)
          .and.to.include.members(modelKeys!.map((k) => k.id));
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements).to.be.empty;
      });
    });

    describe("Model", () => {
      it("hilites model", async function () {
        let modelKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([modelKey!]));

        expect(hiliteSet.models).to.have.lengthOf(1).and.to.include(modelKey!.id);
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements).to.be.empty;
        expect(iModel.selectionSet.size).to.eq(0);
      });
    });

    describe("Category", () => {
      it("hilites category's subcategories", async function () {
        let categoryKey: SelectableInstanceKey;
        let subCategoryKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          subCategoryKeys = [
            getDefaultSubcategoryKey(categoryKey.id),
            insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
            insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
          ];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([categoryKey!]));

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories)
          .to.have.lengthOf(subCategoryKeys!.length)
          .and.to.include.members(subCategoryKeys!.map((k) => k.id));
        expect(hiliteSet.elements).to.be.empty;
      });

      it("hilites subcategory", async function () {
        let categoryKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        });

        const subCategoryKey = getDefaultSubcategoryKey(categoryKey!.id);
        const hiliteSet = await loadHiliteSet(Selectables.create([subCategoryKey]));

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.have.lengthOf(1).and.to.include(subCategoryKey.id);
        expect(hiliteSet.elements).to.be.empty;
      });

      it("hilites when category and subcategory selected", async function () {
        let categoryKey: SelectableInstanceKey;
        let subCategoryKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          subCategoryKeys = [
            getDefaultSubcategoryKey(categoryKey.id),
            insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
            insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
          ];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([categoryKey!, subCategoryKeys![0]]));

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories)
          .to.have.lengthOf(subCategoryKeys!.length)
          .and.to.include.members(subCategoryKeys!.map((k) => k.id));
        expect(hiliteSet.elements).to.be.empty;
      });
    });

    describe("Element", () => {
      it("hilites assembly element", async function () {
        let assemblyKey: SelectableInstanceKey;
        let expectedHighlightedElementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
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
          expectedHighlightedElementKeys = [assemblyKey, element2, element3, element4, element5];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([assemblyKey!]));

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements)
          .to.have.lengthOf(expectedHighlightedElementKeys!.length)
          .and.to.include.members(expectedHighlightedElementKeys!.map((k) => k.id));
      });

      it("hilites leaf element", async function () {
        let elementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          elementKey = insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id });
        });

        const hiliteSet = await loadHiliteSet(Selectables.create([elementKey!]));

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements).to.have.lengthOf(1).and.to.include(elementKey!.id);
      });

      it("hilites all selected elements", async function () {
        let elementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          elementKeys = [
            insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
            insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
            insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
          ];
        });

        const hiliteSet = await loadHiliteSet(Selectables.create(elementKeys!));

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements)
          .to.have.lengthOf(elementKeys!.length)
          .and.to.include.members(elementKeys!.map((k) => k.id));
      });
    });

    describe("Functional element", () => {
      async function getSchemaFromPackage(packageName: string, schemaFileName: string): Promise<string> {
        const schemaFile = path.join(__dirname, "..", "..", "node_modules", "@bentley", packageName, schemaFileName);
        return fs.readFileSync(schemaFile, "utf8");
      }

      it("hilites functional element related physical elements", async function () {
        let functionalElement: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;
        let expectedElements: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
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

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements)
          .to.have.lengthOf(expectedElements!.length)
          .and.to.include.members(expectedElements!.map((k) => k.id));
      });

      it("hilites functional element related graphic elements", async function () {
        let functionalElement: SelectableInstanceKey;
        let graphicsElement: SelectableInstanceKey;
        let expectedElements: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
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

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements)
          .to.have.lengthOf(expectedElements!.length)
          .and.to.include.members(expectedElements!.map((k) => k.id));
      });
    });

    describe("Hilites GroupInformationElement", () => {
      it("hilites group information element related physical elements", async function () {
        let groupInformationElement: SelectableInstanceKey;
        let expectedElements: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const groupModel = insertGroupInformationModelWithPartition({ builder, codeValue: "group information model" });
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

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements)
          .to.have.lengthOf(expectedElements!.length)
          .and.to.include.members(expectedElements!.map((k) => k.id));
      });
    });
  });
});
