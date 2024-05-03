/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import {
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
import { createIModel } from "./IModelUtilities";

export const IMODEL_NAMES = [
  "baytown",
  "50k elements",
  "50k nested elements",
  "50k group member elements",
  "1k nested subjects",
  "50k subcategories",
  "50k nested functional 3D elements",
  "10k nested functional 2D elements",
] as const;
export type IModelName = (typeof IMODEL_NAMES)[number];
export type IModelPathsMap = { [_ in IModelName]?: string };

const BAYTOWN_DOWNLOAD_URL = "https://github.com/imodeljs/desktop-starter/raw/master/assets/Baytown.bim";

export class Datasets {
  private static readonly _iModels: IModelPathsMap = {};

  public static readonly CUSTOM_SCHEMA = {
    schemaName: "PerformanceTests",
    defaultClassName: "PerformanceTests",
    baseClassName: "Base_PerformanceTests",
    defaultUserLabel: "Element",
    customPropName: "PropX",
    defaultPropertyValue: "PropertyValue",
    itemsPerGroup: 100,
  };

  public static getIModelPath(name: IModelName): string {
    return this.verifyInitialized(this._iModels[name]);
  }

  public static async initialize(datasetsDirPath: string) {
    fs.mkdirSync(datasetsDirPath, { recursive: true });
    const promises = IMODEL_NAMES.map(async (key) => {
      if (key === "baytown") {
        this._iModels[key] = await this.createIModel(key, datasetsDirPath, async (name: string, localPath: string) =>
          this.downloadDataset(name, BAYTOWN_DOWNLOAD_URL, localPath),
        );
        return;
      }

      const elementCount = 1000 * Number.parseInt(/(\d+)k/.exec(key)![1], 10);
      this._iModels[key] = await this.createIModel(key, datasetsDirPath, this.getIModelFactory(key, elementCount), !!process.env.RECREATE);
    });
    await Promise.all(promises);
  }

  private static verifyInitialized<T>(arg: T | undefined): T {
    if (arg === undefined) {
      throw new Error("Datasets haven't been initialized. Call initialize() function before accessing the datasets.");
    }
    return arg;
  }

  private static async createIModel(
    name: string,
    folderPath: string,
    iModelFactory: (name: string, localPath: string) => void | Promise<void>,
    force?: boolean,
  ) {
    const localPath = path.join(folderPath, `${name}.bim`);

    if (force || !fs.existsSync(localPath)) {
      await iModelFactory(name, localPath);
    }

    return path.resolve(localPath);
  }

  private static getIModelFactory(key: IModelName, elementCount: number) {
    switch (key) {
      case "50k elements":
        return async (name: string, localPath: string) => this.createFlatIModel(name, localPath, elementCount);
      case "50k nested elements":
        return async (name: string, localPath: string) => this.createNestedModel(name, localPath, elementCount);
      case "50k group member elements":
        return async (name: string, localPath: string) => this.createNestedGroupModel(name, localPath, elementCount);
      case "1k nested subjects":
        return async (name: string, localPath: string) => this.createNestedSubjectModel(name, localPath, elementCount);
      case "50k subcategories":
        return async (name: string, localPath: string) => this.createNestedCategoriesModel(name, localPath, elementCount);
      case "50k nested functional 3D elements":
        return async (name: string, localPath: string) => this.createFunctionalElements3dModel(name, localPath, elementCount);
      case "10k nested functional 2D elements":
        return async (name: string, localPath: string) => this.createNestedFunctionalElements2dModel(name, localPath, elementCount);
      default:
        return async () => {};
    }
  }

  private static async downloadDataset(name: string, downloadUrl: string, localPath: string) {
    console.log(`Downloading "${name}" iModel from "${downloadUrl}"...`);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${name} iModel: ${response.statusText}`);
    }

    await response.body!.pipeTo(fs.WriteStream.toWeb(fs.createWriteStream(localPath)));
  }

  private static async createFlatIModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);

    const elementsPerGroup = 100;
    const numGroups = numElements / elementsPerGroup;
    const { defaultClassName, customPropName, schemaName, defaultUserLabel, defaultPropertyValue, baseClassName } = this.CUSTOM_SCHEMA;

    // prettier-ignore
    const schema = `
      <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
      <ECEntityClass typeName="${baseClassName}">
        <BaseClass>bis:PhysicalElement</BaseClass>
        <ECProperty propertyName="${customPropName}" typeName="string" />
      </ECEntityClass>
      ${[...Array(numGroups).keys()].map((i) => `
        <ECEntityClass typeName="${defaultClassName}_${i}">
          <BaseClass>${baseClassName}</BaseClass>
        </ECEntityClass>
      `).join("")}
    `;

    await createIModel(name, localPath, async (builder) => {
      await builder.importSchema(schemaName, schema);
      const { id: categoryId } = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
      const { id: modelId } = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
      for (let groupIdx = 0; groupIdx < numGroups; ++groupIdx) {
        for (let j = 0; j < elementsPerGroup; ++j) {
          insertPhysicalElement({
            builder,
            classFullName: `${schemaName}:${defaultClassName}_${groupIdx}`,
            fullClassNameSeparator: ":",
            userLabel: `${defaultUserLabel}_${groupIdx}`,
            modelId,
            categoryId,
            [customPropName]: `${defaultPropertyValue}_${groupIdx}`,
          });
        }
      }
    });

    console.log(`${numElements} elements: Done.`);
  }

  private static async createNestedModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);

    await createIModel(name, localPath, async (builder) => {
      const { id: spatialCategoryId } = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
      const { id: physicalModelId } = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
      const { id: drawingModelId } = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
      const { id: drawingCategoryId } = insertDrawingCategory({ builder, codeValue: "test drawing category" });

      const numberOfGroups = 1000;
      const elementsPerGroup = numElements / numberOfGroups;

      for (let i = 0; i < numberOfGroups; ++i) {
        let physicalParentId: string | undefined;
        let drawingParentId: string | undefined;

        for (let j = 0; j < elementsPerGroup / 2; ++j) {
          physicalParentId = insertPhysicalElement({
            builder,
            parentId: physicalParentId,
            modelId: physicalModelId,
            categoryId: spatialCategoryId,
          }).id;
          drawingParentId = insertDrawingGraphic({
            builder,
            parentId: drawingParentId,
            modelId: drawingModelId,
            categoryId: drawingCategoryId,
          }).id;
        }
      }
    });

    console.log(`${numElements} elements: Done.`);
  }

  private static async createNestedSubjectModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);

    await createIModel(name, localPath, async (builder) => {
      const numberOfGroups = 20;
      const elementsPerGroup = numElements / numberOfGroups;

      for (let i = 0; i < numberOfGroups; ++i) {
        let parentId: string | undefined;

        for (let j = 0; j < elementsPerGroup; ++j) {
          parentId = insertSubject({
            parentId,
            builder,
            codeValue: `subject_${i}_${j}`,
          }).id;
        }

        insertPhysicalModelWithPartition({ builder, codeValue: `model_${i}`, partitionParentId: parentId });
      }
    });

    console.log(`${numElements} elements: Done.`);
  }

  private static async createNestedCategoriesModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);
    await createIModel(name, localPath, async (builder) => {
      const { id: categoryId } = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });

      for (let i = 0; i < numElements; ++i) {
        insertSubCategory({
          parentCategoryId: categoryId,
          builder,
          codeValue: `${i}`,
        });
      }
    });

    console.log(`${numElements} elements: Done.`);
  }

  private static async createNestedGroupModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);

    const numGroups = 10;
    const membersPerGroup = 100;
    const elementsPerMember = numElements / (numGroups * membersPerGroup);

    await createIModel(name, localPath, async (builder) => {
      const { id: groupModelId } = insertGroupInformationModelWithPartition({ builder, codeValue: "group information model" });
      const { id: modelId } = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
      const { id: categoryId } = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });

      for (let groupIdx = 0; groupIdx < numGroups; ++groupIdx) {
        const { id: groupId } = insertGroupInformationElement({ builder, modelId: groupModelId });

        for (let i = 0; i < membersPerGroup; ++i) {
          let parentId: string | undefined;

          for (let j = 0; j < elementsPerMember; ++j) {
            parentId = insertPhysicalElement({ builder, parentId, modelId, categoryId }).id;
            if (j === 0) {
              builder.insertRelationship({ sourceId: groupId, targetId: parentId, classFullName: "BisCore.ElementGroupsMembers" });
            }
          }
        }
      }
    });

    console.log(`${numElements} elements: Done.`);
  }

  private static async createFunctionalElements3dModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);
    const schema = await this.getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");

    await createIModel(name, localPath, async (builder) => {
      await builder.importFullSchema(schema);
      const { id: physicalModelId } = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
      const { id: functionalModelId } = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
      const { id: categoryId } = insertSpatialCategory({ builder, codeValue: "test category" });

      const numberOfGroups = 1000;
      const elementsPerGroup = numElements / numberOfGroups;

      for (let i = 0; i < numberOfGroups; ++i) {
        let physicalElementParentId: string | undefined;
        let functionalElementParentId: string | undefined;

        for (let j = 0; j < elementsPerGroup; ++j) {
          physicalElementParentId = insertPhysicalElement({
            builder,
            parentId: physicalElementParentId,
            modelId: physicalModelId,
            categoryId,
          }).id;
          functionalElementParentId = insertFunctionalElement({
            builder,
            parentId: functionalElementParentId,
            modelId: functionalModelId,
            representedElementId: physicalElementParentId,
            relationshipName: "PhysicalElementFulfillsFunction",
          }).id;
        }
      }
    });

    console.log(`${numElements} elements: Done.`);
  }

  private static async createNestedFunctionalElements2dModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);
    const schema = await this.getSchemaFromPackage("functional-schema", "Functional.ecschema.xml");

    await createIModel(name, localPath, async (builder) => {
      await builder.importFullSchema(schema);

      const { id: drawingModelId } = insertDrawingModelWithPartition({ builder, codeValue: "test drawing model" });
      const { id: functionalModelId } = insertFunctionalModelWithPartition({ builder, codeValue: "test functional model" });
      const { id: categoryId } = insertDrawingCategory({ builder, codeValue: "test drawing category" });
      const { id: graphicsElementId } = insertDrawingGraphic({ builder, modelId: drawingModelId, categoryId });

      const numberOfGroups = 1000;
      const elementsPerGroup = numElements / numberOfGroups;

      for (let i = 0; i < numberOfGroups; ++i) {
        let functionalElementParentId: string | undefined;
        let graphicsElementParentId = insertDrawingGraphic({
          builder,
          categoryId,
          modelId: drawingModelId,
        }).id;

        for (let k = 0; k < elementsPerGroup; ++k) {
          functionalElementParentId = insertFunctionalElement({
            parentId: functionalElementParentId,
            builder,
            modelId: functionalModelId,
            representedElementId: k === elementsPerGroup - 1 ? graphicsElementParentId : graphicsElementId,
            relationshipName: "DrawingGraphicRepresentsFunctionalElement",
          }).id;
        }

        for (let j = 0; j < elementsPerGroup - 1; ++j) {
          graphicsElementParentId = insertDrawingGraphic({
            parentId: graphicsElementParentId,
            builder,
            categoryId,
            modelId: drawingModelId,
          }).id;
        }
      }
    });

    console.log(`${numElements} elements: Done.`);
  }

  private static async getSchemaFromPackage(packageName: string, schemaFileName: string): Promise<string> {
    const schemaFile = path.join(__dirname, "..", "..", "node_modules", "@bentley", packageName, schemaFileName);
    return fs.readFileSync(schemaFile, "utf8");
  }
}
