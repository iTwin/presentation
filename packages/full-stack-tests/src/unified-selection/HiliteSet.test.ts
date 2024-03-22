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
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
  insertSubCategory,
  insertSubject,
} from "presentation-test-utilities";
import { RpcConfiguration, RpcManager } from "@itwin/core-common";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { buildTestIModel, initialize, terminate } from "@itwin/presentation-testing";
import { createStorage, SelectableInstanceKey, SelectionStorage } from "@itwin/unified-selection";
import { createMetadataProvider } from "../hierarchy-builder/Utils";

describe.only("HiliteSet", () => {
  let storage: SelectionStorage;

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

  beforeEach(async () => {
    storage = createStorage();
  });

  describe("Hiliting selection", () => {
    describe("Subject", () => {
      it("hilites models directly under subject", async function () {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          subjectKey = insertSubject({ builder, codeValue: "test subject" });
          modelKeys = [
            insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subjectKey.id }),
            insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subjectKey.id }),
          ];
        });

        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [subjectKey!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

        expect(hiliteSet.models)
          .to.have.lengthOf(modelKeys!.length)
          .and.to.include.members(modelKeys!.map((k) => k.id));
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements).to.be.empty;
        expect(imodel.selectionSet.size).to.eq(0);
      });

      it("hilites models nested deeply under subject", async function () {
        let subjectKey: SelectableInstanceKey;
        let modelKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          subjectKey = insertSubject({ builder, codeValue: "test subject" });
          const subject2 = insertSubject({ builder, codeValue: "subject 2", parentId: subjectKey.id });
          const subject3 = insertSubject({ builder, codeValue: "subject 3", parentId: subjectKey.id });
          const subject4 = insertSubject({ builder, codeValue: "subject 4", parentId: subject3.id });
          modelKeys = [
            insertPhysicalModelWithPartition({ builder, codeValue: "model 1", partitionParentId: subject2.id }),
            insertPhysicalModelWithPartition({ builder, codeValue: "model 2", partitionParentId: subject4.id }),
          ];
        });
        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [subjectKey!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

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
        const imodel = await buildTestIModel(this, async (builder) => {
          modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        });

        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [modelKey!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

        expect(hiliteSet.models).to.have.lengthOf(1).and.to.include(modelKey!.id);
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements).to.be.empty;
        expect(imodel.selectionSet.size).to.eq(0);
      });
    });

    describe("Category", () => {
      it("hilites category's subcategories", async function () {
        let categoryKey: SelectableInstanceKey;
        let subCategoryKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          subCategoryKeys = [
            getDefaultSubcategoryKey(categoryKey.id),
            insertSubCategory({ builder, codeValue: "sub 1", parentCategoryId: categoryKey.id }),
            insertSubCategory({ builder, codeValue: "sub 2", parentCategoryId: categoryKey.id }),
          ];
        });
        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [categoryKey!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories)
          .to.have.lengthOf(subCategoryKeys!.length)
          .and.to.include.members(subCategoryKeys!.map((k) => k.id));
        expect(hiliteSet.elements).to.be.empty;
      });

      it("hilites subcategory", async function () {
        let categoryKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        });
        const subCategoryKey = getDefaultSubcategoryKey(categoryKey!.id);
        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [subCategoryKey] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.have.lengthOf(1).and.to.include(subCategoryKey.id);
        expect(hiliteSet.elements).to.be.empty;
      });
    });

    describe("Element", () => {
      it("hilites assembly element", async function () {
        let assemblyKey: SelectableInstanceKey;
        let expectedHighlightedElementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
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

        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [assemblyKey!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements)
          .to.have.lengthOf(expectedHighlightedElementKeys!.length)
          .and.to.include.members(expectedHighlightedElementKeys!.map((k) => k.id));
      });

      it("hilites leaf element", async function () {
        let elementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          elementKey = insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id });
        });

        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [elementKey!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements).to.have.lengthOf(1).and.to.include(elementKey!.id);
      });

      it("hilites all selected elements", async function () {
        let elementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        const imodel = await buildTestIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          elementKeys = [
            insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
            insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
            insertPhysicalElement({ builder, userLabel: "element", modelId: modelKey.id, categoryId: categoryKey.id }),
          ];
        });
        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: elementKeys! });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

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
        const imodel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElement = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          const physicalelementChild = insertPhysicalElement({
            builder,
            userLabel: "child element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElement.id,
          });
          functionalElement = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            elementId: physicalElement.id,
            relationship: "Functional.PhysicalElementFulfillsFunction",
          });
          expectedElements = [physicalElement, physicalelementChild];
        });

        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [functionalElement!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

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
        const imodel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementChild = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElement.id });
          functionalElement = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            elementId: graphicsElement.id,
            relationship: "Functional.DrawingGraphicRepresentsFunctionalElement",
          });
          expectedElements = [graphicsElement, graphicsElementChild];
        });

        storage.addToSelection({ source: "Test", iModelKey: imodel.key, selectables: [functionalElement!] });
        const hiliteSet = await storage.getHiliteSet({
          iModelKey: imodel.key,
          queryExecutor: createECSqlQueryExecutor(imodel),
          metadataProvider: createMetadataProvider(imodel),
        });

        expect(hiliteSet.models).to.be.empty;
        expect(hiliteSet.subCategories).to.be.empty;
        expect(hiliteSet.elements)
          .to.have.lengthOf(expectedElements!.length)
          .and.to.include.members(expectedElements!.map((k) => k.id));
      });
    });
  });
});
