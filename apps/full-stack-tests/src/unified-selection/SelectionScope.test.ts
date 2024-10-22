/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";
import path from "path";
import {
  insertDrawingCategory,
  insertDrawingGraphic,
  insertDrawingModelWithPartition,
  insertFunctionalElement,
  insertFunctionalModelWithPartition,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { RpcConfiguration, RpcManager } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { buildTestIModel, initialize, terminate } from "@itwin/presentation-testing";
import { computeSelection, SelectableInstanceKey } from "@itwin/unified-selection";

describe("SelectionScope", () => {
  let iModel: IModelConnection;

  before(async () => {
    await initialize({
      backendHostProps: {
        cacheDir: path.join(__dirname, ".cache", `${process.pid}`),
      },
    });
    // eslint-disable-next-line @itwin/no-internal
    RpcManager.registerImpl(ECSchemaRpcInterface, ECSchemaRpcImpl);
    RpcConfiguration.developmentMode = true;
    RpcManager.initializeInterface(ECSchemaRpcInterface);
  });

  after(async () => {
    await terminate();
  });

  async function getSchemaFromPackage(packageName: string, schemaFileName: string): Promise<string> {
    const schemaFile = path.join(__dirname, "..", "..", "node_modules", "@bentley", packageName, schemaFileName);
    return fs.readFileSync(schemaFile, "utf8");
  }

  async function getSelection(keys: string[], scope: Parameters<typeof computeSelection>[0]["scope"]): Promise<SelectableInstanceKey[]> {
    const selectables: SelectableInstanceKey[] = [];
    for await (const selectable of computeSelection({ queryExecutor: createECSqlQueryExecutor(iModel), elementIds: keys, scope })) {
      selectables.push(selectable);
    }
    return selectables;
  }

  describe("`element` scope", () => {
    it("returns element", async function () {
      let elementKey1: SelectableInstanceKey;
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        const assemblyKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id }).id;
        elementKey1 = insertPhysicalElement({
          builder,
          userLabel: "element 1",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: assemblyKey,
        });
      });

      const actual = await getSelection([elementKey1!.id], { id: "element" });
      expect(actual).to.have.deep.members([elementKey1!]);
    });

    it("skips invalid ID's", async function () {
      let elementKey1: SelectableInstanceKey;
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        const assemblyKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id }).id;
        elementKey1 = insertPhysicalElement({
          builder,
          userLabel: "element 1",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: assemblyKey,
        });
      });

      const actual = await getSelection([elementKey1!.id, "invalid"], { id: "element" });
      expect(actual).to.have.deep.members([elementKey1!]);
    });

    it("returns element parent", async function () {
      let parentKey: SelectableInstanceKey;
      let elementKey1: SelectableInstanceKey;
      let elementKey2: SelectableInstanceKey;
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        parentKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
        elementKey1 = insertPhysicalElement({
          builder,
          userLabel: "element 1",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: parentKey.id,
        });
        elementKey2 = insertPhysicalElement({
          builder,
          userLabel: "element 2",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: parentKey.id,
        });
      });
      const actual = await getSelection([elementKey1!.id, elementKey2!.id], { id: "element", ancestorLevel: 1 });
      expect(actual).to.have.deep.members([parentKey!]);
    });

    it("returns element when it has no parent", async function () {
      let elementKey: SelectableInstanceKey;
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        elementKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
      });

      const actual = await getSelection([elementKey!.id], { id: "element", ancestorLevel: 1 });
      expect(actual).to.have.deep.members([elementKey!]);
    });

    it("returns grandparent of element", async function () {
      let grandParentKey: SelectableInstanceKey;
      let elementKey: SelectableInstanceKey;
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        grandParentKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
        const parentKey = insertPhysicalElement({
          builder,
          userLabel: "element 1",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: grandParentKey.id,
        });
        elementKey = insertPhysicalElement({
          builder,
          userLabel: "element 2",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: parentKey.id,
        });
      });

      const actual = await getSelection([elementKey!.id], { id: "element", ancestorLevel: 2 });
      expect(actual).to.have.deep.members([grandParentKey!]);
    });

    it("returns last existing ancestor", async function () {
      let parentKey: SelectableInstanceKey;
      let elementKey: SelectableInstanceKey;
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        parentKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
        elementKey = insertPhysicalElement({
          builder,
          userLabel: "element 1",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: parentKey.id,
        });
      });

      const actual = await getSelection([elementKey!.id], { id: "element", ancestorLevel: 2 });
      expect(actual).to.have.deep.members([parentKey!]);
    });

    it("returns all selected elements", async function () {
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

      const actual = await getSelection(
        elementKeys!.map((key) => key.id),
        { id: "element" },
      );
      expect(actual).to.have.deep.members(elementKeys!);
    });

    it("returns root element", async function () {
      let rootElementKey: SelectableInstanceKey;
      let elementKey3: SelectableInstanceKey;
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        rootElementKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
        const elementKey1 = insertPhysicalElement({
          builder,
          userLabel: "element 1",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: rootElementKey.id,
        });
        const elementKey2 = insertPhysicalElement({
          builder,
          userLabel: "element 2",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: elementKey1.id,
        });
        elementKey3 = insertPhysicalElement({
          builder,
          userLabel: "element 3",
          modelId: modelKey.id,
          categoryId: categoryKey.id,
          parentId: elementKey2.id,
        });
      });

      const actual = await getSelection([elementKey3!.id], { id: "element", ancestorLevel: -1 });
      expect(actual).to.have.deep.members([rootElementKey!]);
    });
  });

  describe("`category` scope", () => {
    it("returns element category", async function () {
      let categoryKey1: SelectableInstanceKey;
      let categoryKey2: SelectableInstanceKey;
      let elementIds: string[];
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        categoryKey1 = insertSpatialCategory({ builder, codeValue: "test category 1" });
        categoryKey2 = insertSpatialCategory({ builder, codeValue: "test category 2" });
        const assemblyKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey1.id });
        elementIds = [
          insertPhysicalElement({
            builder,
            userLabel: "element 1",
            modelId: modelKey.id,
            categoryId: categoryKey1.id,
            parentId: assemblyKey.id,
          }).id,
          insertPhysicalElement({
            builder,
            userLabel: "element 2",
            modelId: modelKey.id,
            categoryId: categoryKey1.id,
            parentId: assemblyKey.id,
          }).id,
          insertPhysicalElement({
            builder,
            userLabel: "element 2",
            modelId: modelKey.id,
            categoryId: categoryKey2.id,
            parentId: assemblyKey.id,
          }).id,
        ];
      });

      const actual = await getSelection(elementIds!, { id: "category" });
      expect(actual).to.have.deep.members([categoryKey1!, categoryKey2!]);
    });
  });

  describe("`model` scope", () => {
    it("returns element model", async function () {
      let modelKey: SelectableInstanceKey;
      let elementIds: string[];
      // eslint-disable-next-line deprecation/deprecation
      iModel = await buildTestIModel(this, async (builder) => {
        modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
        const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
        const assemblyKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
        elementIds = [
          insertPhysicalElement({
            builder,
            userLabel: "element 1",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
            parentId: assemblyKey.id,
          }).id,
          insertPhysicalElement({
            builder,
            userLabel: "element 2",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
            parentId: assemblyKey.id,
          }).id,
        ];
      });

      const actual = await getSelection(elementIds!, { id: "model" });
      expect(actual).to.have.deep.members([modelKey!]);
    });
  });

  describe("`functional` scope", () => {
    describe("`GeometricElement3d`", () => {
      it("returns `GeometricElement3d` related functional element", async function () {
        let physicalElement: SelectableInstanceKey;
        let functionalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElement = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          functionalElement = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElement.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional" });
        expect(actual).to.have.deep.members([functionalElement!]);
      });

      it("returns `GeometricElement3d` when no related functional element exists", async function () {
        let physicalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElement = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional" });
        expect(actual).to.have.deep.members([physicalElement!]);
      });

      it("returns `GeometricElement3d` when parent has related functional element", async function () {
        let physicalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const physicalElementParent = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementParent.id,
          });
          insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElementParent.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional" });
        expect(actual).to.have.deep.members([physicalElement!]);
      });

      it("returns `GeometricElement3d` and related functional element", async function () {
        let physicalElement1: SelectableInstanceKey;
        let physicalElement2: SelectableInstanceKey;
        let functionalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElement1 = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          physicalElement2 = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElement1.id,
          });
          functionalElement = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElement1.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement1!.id, physicalElement2!.id], { id: "functional" });
        expect(actual).to.have.deep.members([functionalElement!, physicalElement2!]);
      });

      it("returns `GeometricElement3d` parent related functional element", async function () {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const physicalElementParent = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementParent.id,
          });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElementParent.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns parent without functional element", async function () {
        let parentKey: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          parentKey = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: parentKey.id,
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([parentKey!]);
      });

      it("returns parentless `GeometricElement3d` related functional element", async function () {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
          });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElement.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns parentless `GeometricElement3d` when functional element does not exist", async function () {
        let physicalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([physicalElement!]);
      });

      it("returns `GeometricElement3d` grandparent related functional element", async function () {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const physicalElementGrandParent = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          const physicalElementParent = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementGrandParent.id,
          });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementParent.id,
          });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElementGrandParent.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns `GeometricElement3d` grandparent without related functional element", async function () {
        let physicalElementGrandParent: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElementGrandParent = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          const physicalElementParent = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementGrandParent.id,
          });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementParent.id,
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).to.have.deep.members([physicalElementGrandParent!]);
      });

      it("returns last existing `GeometricElement3d` ancestor related functional element", async function () {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const physicalElementParent = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementParent.id,
          });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElementParent.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns last existing `GeometricElement3d` ancestor without related functional element", async function () {
        let physicalElementParent: SelectableInstanceKey;
        let physicalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          physicalElementParent = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: categoryKey.id });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementParent.id,
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).to.have.deep.members([physicalElementParent!]);
      });

      it("returns `GeometricElement3d` top assembly related functional element", async function () {
        let physicalElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const physicalElementGrandparent = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
          });
          const physicalElementParent = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementGrandparent.id,
          });
          physicalElement = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: categoryKey.id,
            parentId: physicalElementParent.id,
          });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: physicalElementGrandparent.id,
            relationshipName: "PhysicalElementFulfillsFunction",
          });
        });

        const actual = await getSelection([physicalElement!.id], { id: "functional", ancestorLevel: -1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });
    });

    describe("`GeometricElement2d`", () => {
      it("returns `GeometricElement2d` related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElement = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElement.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional" });
        expect(actual).to.have.deep.members([functionalElement!]);
      });

      it("returns `GeometricElement2d` when no related functional element exists", async function () {
        let graphicsElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional" });
        expect(actual).to.have.deep.members([graphicsElement!]);
      });

      it("returns `GeometricElement2d` and related functional element", async function () {
        let graphicsElement1: SelectableInstanceKey;
        let graphicsElement2: SelectableInstanceKey;
        let functionalElement1: SelectableInstanceKey;
        let functionalElement2: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement1 = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          graphicsElement2 = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElement1 = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElement2.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
          functionalElement2 = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElementGrandParent.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement1!.id, graphicsElement2!.id], { id: "functional" });
        expect(actual).to.have.deep.members([functionalElement1!, functionalElement2!]);
      });

      it("returns `GeometricElement2d` related functional elements of different depth", async function () {
        let graphicsElement1: SelectableInstanceKey;
        let graphicsElement2: SelectableInstanceKey;
        let functionalElement1: SelectableInstanceKey;
        let functionalElement2: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement1 = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          graphicsElement2 = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElement1 = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElement2.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
          functionalElement2 = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElementParent.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
          insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElementGrandParent.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement1!.id, graphicsElement2!.id], { id: "functional" });
        expect(actual).to.have.deep.members([functionalElement1!, functionalElement2!]);
      });

      it("returns `GeometricElement2d` nearest related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElement.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns `GeometricElement2d` parent related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElementParent.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns `GeometricElement2d` ancestor related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElementGrandParent.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns all `GeometricElement2d` nearest related functional elements", async function () {
        let graphicsElement1: SelectableInstanceKey;
        let graphicsElement2: SelectableInstanceKey;
        let functionalElementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement1 = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          graphicsElement2 = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElementKeys = [
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElementGrandParent.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElement1.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
          ];
        });

        const actual = await getSelection([graphicsElement1!.id, graphicsElement2!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members(functionalElementKeys!);
      });

      it("returns parentless `GeometricElement2d` related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElement.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });

      it("returns parentless `GeometricElement2d` without related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members([graphicsElement!]);
      });

      it("returns `GeometricElement2d` grandparent", async function () {
        let graphicsElementGrandParent: SelectableInstanceKey;
        let graphicsElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).to.have.deep.members([graphicsElementGrandParent!]);
      });

      it("returns last existing `GeometricElement2d` ancestor", async function () {
        let graphicsElementParent: SelectableInstanceKey;
        let graphicsElement: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          graphicsElementParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: 2 });
        expect(actual).to.have.deep.members([graphicsElementParent!]);
      });

      it("returns `GeometricElement2d` grandparent related functional element", async function () {
        let graphicsElement: SelectableInstanceKey;
        let functionalElementKey: SelectableInstanceKey;
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const categoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });
          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: categoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          graphicsElement = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: categoryKey.id, parentId: graphicsElementParent.id });
          functionalElementKey = insertFunctionalElement({
            builder,
            modelId: functionalModelKey.id,
            representedElementId: graphicsElementGrandParent.id,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          });
        });

        const actual = await getSelection([graphicsElement!.id], { id: "functional", ancestorLevel: -1 });
        expect(actual).to.have.deep.members([functionalElementKey!]);
      });
    });

    describe("mixed elements", () => {
      it("returns element related functional elements", async function () {
        let elementIds: string[];
        let physicalElement2: SelectableInstanceKey;
        let functionalElementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const spatialCategoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const drawingCategoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });

          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: drawingCategoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          const graphicsElement1 = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementParent.id,
          });
          const graphicsElement2 = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementParent.id,
          });
          const physicalElement1 = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: spatialCategoryKey.id });
          physicalElement2 = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: spatialCategoryKey.id,
            parentId: physicalElement1.id,
          });
          elementIds = [graphicsElement1.id, graphicsElement2.id, physicalElement1.id, physicalElement2.id];
          functionalElementKeys = [
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElement2.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElementGrandParent.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: physicalElement1.id,
              relationshipName: "PhysicalElementFulfillsFunction",
            }),
          ];
        });

        const actual = await getSelection(elementIds!, { id: "functional" });
        expect(actual).to.have.deep.members([...functionalElementKeys!, physicalElement2!]);
      });

      it("returns parent related functional elements", async function () {
        let elementIds: string[];
        let functionalElementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const spatialCategoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const drawingCategoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });

          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: drawingCategoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          const graphicsElement1 = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementParent.id,
          });
          const graphicsElement2 = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementParent.id,
          });
          const physicalElement1 = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: spatialCategoryKey.id });
          const physicalElement2 = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: spatialCategoryKey.id,
            parentId: physicalElement1.id,
          });
          elementIds = [graphicsElement1.id, graphicsElement2.id, physicalElement1.id, physicalElement2.id];
          functionalElementKeys = [
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElement2.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElementParent.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: physicalElement1.id,
              relationshipName: "PhysicalElementFulfillsFunction",
            }),
          ];
        });

        const actual = await getSelection(elementIds!, { id: "functional", ancestorLevel: 1 });
        expect(actual).to.have.deep.members(functionalElementKeys!);
      });

      it("returns top assembly related functional elements", async function () {
        let elementIds: string[];
        let functionalElementKeys: SelectableInstanceKey[];
        // eslint-disable-next-line deprecation/deprecation
        iModel = await buildTestIModel(this, async (builder) => {
          const schema = await getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");
          await builder.importSchema(schema);
          const drawingModelKey = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
          const physicalModelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
          const functionalModelKey = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
          const spatialCategoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const drawingCategoryKey = insertDrawingCategory({ builder, codeValue: "test drawing category" });

          const graphicsElementGrandParent = insertDrawingGraphic({ builder, modelId: drawingModelKey.id, categoryId: drawingCategoryKey.id });
          const graphicsElementParent = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementGrandParent.id,
          });
          const graphicsElement1 = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementParent.id,
          });
          const graphicsElement2 = insertDrawingGraphic({
            builder,
            modelId: drawingModelKey.id,
            categoryId: drawingCategoryKey.id,
            parentId: graphicsElementParent.id,
          });
          const physicalElement1 = insertPhysicalElement({ builder, userLabel: "element", modelId: physicalModelKey.id, categoryId: spatialCategoryKey.id });
          const physicalElement2 = insertPhysicalElement({
            builder,
            userLabel: "element",
            modelId: physicalModelKey.id,
            categoryId: spatialCategoryKey.id,
            parentId: physicalElement1.id,
          });
          elementIds = [graphicsElement1.id, graphicsElement2.id, physicalElement1.id, physicalElement2.id];
          functionalElementKeys = [
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElement2.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: graphicsElementGrandParent.id,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
            }),
            insertFunctionalElement({
              builder,
              modelId: functionalModelKey.id,
              representedElementId: physicalElement1.id,
              relationshipName: "PhysicalElementFulfillsFunction",
            }),
          ];
        });

        const actual = await getSelection(elementIds!, { id: "functional", ancestorLevel: -1 });
        expect(actual).to.have.deep.members(functionalElementKeys!);
      });
    });
  });
});
