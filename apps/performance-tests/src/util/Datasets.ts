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
  "50k flat elements",
  "50k elements",
  "50k group member elements",
  "1k subjects",
  "50k subcategories",
  "50k functional 3D elements",
  "10k functional 2D elements",
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

  private static getIModelFactory(key: Exclude<IModelName, "baytown">, elementCount: number) {
    switch (key) {
      case "50k flat elements":
        return async (name: string, localPath: string) => this.createFlatIModel(name, localPath, elementCount);
      case "50k elements":
        return async (name: string, localPath: string) => this.createElementIModel(name, localPath, elementCount);
      case "50k group member elements":
        return async (name: string, localPath: string) => this.createGroupIModel(name, localPath, elementCount);
      case "1k subjects":
        return async (name: string, localPath: string) => this.createSubjectIModel(name, localPath, elementCount);
      case "50k subcategories":
        return async (name: string, localPath: string) => this.createCategoryIModel(name, localPath, elementCount);
      case "50k functional 3D elements":
        return async (name: string, localPath: string) => this.createFunctional3dElementIModel(name, localPath, elementCount);
      case "10k functional 2D elements":
        return async (name: string, localPath: string) => this.createFunctional2dElementIModel(name, localPath, elementCount);
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

  /**
   * Create an iModel with `numElements` physical elements. The elements are set up in a flat manner all belonging to the same
   * spatial category and physical model. The elements are grouped in batches of 100 elements forming `numElements` / 100 groups.
   * Elements belonging to the same group have the same custom class name but differ in user labels.
   */
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

  /**
   * Create an iModel with `numElements` elements, half of them 2D and the other half - 3D, all belonging to the same 2D
   * and 3D model and category. The elements are set up in a hierarchical manner, with 1000 top level elements each having 1
   * child element, which has 1 child element, and so on until the depth of (`numElements` / 2000) elements is reached.
   */
  private static async createElementIModel(name: string, localPath: string, numElements: number) {
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

  /**
   * Create an iModel with `numElements` subjects that are set up are set up in a hierarchical manner, with 20 top level subjects
   * each having 1 child subject, which has 1 child subject, and so on until the depth of (`numElements` / 20) elements is reached.
   */
  private static async createSubjectIModel(name: string, localPath: string, numElements: number) {
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

  /**
   * Create an iModel with `numElements` subcategories all belonging to the same parent spatial category.
   */
  private static async createCategoryIModel(name: string, localPath: string, numElements: number) {
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

  /**
   * Create an iModel with `numElements` group elements all belonging to the same spatial category and physical model.
   * The elements belong to 10 groups, each containing 100 members, each having 1 child element, which has 1 child element,
   * and so on until the depth of (`numElements` / 1000) elements is reached.
   */
  private static async createGroupIModel(name: string, localPath: string, numElements: number) {
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

  /**
   * Create an iModel with `numElements` functional 3D elements all belonging to the same spatial category, physical model and functional model.
   * The elements are set up in a hierarchical manner, with 1000 top level 3D elements, each having 1 child element, which has 1 child element,
   * and so on until the depth of (`numElements` / 1000) elements is reached. Each 3D element has a related functional element.
   */
  private static async createFunctional3dElementIModel(name: string, localPath: string, numElements: number) {
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

  /**
   * Create an iModel with `numElements` functional 2D elements all belonging to the same drawing category, drawing model and functional model.
   * The elements are set up in a hierarchical manner, with 1000 top level functional elements, each having 1 child functional element,
   * which has 1 child functional element, and so on until the depth of (`numElements` / 1000) elements is reached.
   * The last functional element in each chain is related to a 2D element, that has a child 2D element, that has a child 2D element,
   * and so on until until the depth of (`numElements` / 1000) elements is reached. Every functional element that is not the last in each chain
   * is related to an additional 2D element, resulting to a total of `numElements` + 1 2D elements.
   */
  private static async createFunctional2dElementIModel(name: string, localPath: string, numElements: number) {
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
