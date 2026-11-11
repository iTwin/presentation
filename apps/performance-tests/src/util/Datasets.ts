/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import {
  getFullSchemaXml,
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
import { createSnapshotIModel } from "./IModelUtilities.js";

import type { Id64String } from "@itwin/core-bentley";
import type { EC } from "@itwin/presentation-shared";

type IModelFactoryProps = { name: string; localPath: string };
type IModelFactory = (props: IModelFactoryProps) => void | Promise<void>;

/**
 * Elements are evenly split into `classCount` classes named `${schema.name}.${schema.classNamePrefix}_${index}`, all
 * deriving from `${schema.name}.${schema.baseClassName}`. Elements of class `index` have `${userLabelPrefix}_${index}`
 * user labels and `${propertyValuePrefix}_${index}` values of the `schema.propertyName` property defined on the base
 * class. All elements belong to the `categoryCodeValue` spatial category.
 */
const ELEMENTS_IN_500_CLASSES = {
  elementCount: 50_000,
  classCount: 500,
  schema: {
    name: "PerformanceTests",
    baseClassName: "Base_PerformanceTests",
    classNamePrefix: "PerformanceTests",
    propertyName: "PropX",
  },
  userLabelPrefix: "Element",
  propertyValuePrefix: "PropertyValue",
  categoryCodeValue: "My Category",
} as const;

/**
 * Datasets used by the tests, along with metadata describing their contents. See the functions that create the datasets
 * for how the metadata is used.
 */
export const DATASETS = {
  baytown: {},
  "1k subjects": { elementCount: 1_000, chainCount: 20, userLabel: "test_subject" },
  "50k elements in 500 classes": ELEMENTS_IN_500_CLASSES,
  "50k hierarchical 2D and 3D elements": {
    elementCount: 50_000,
    chainCount: 1_000,
    physicalElementClassName: "Generic.PhysicalObject",
    drawingGraphicClassName: "BisCore.DrawingGraphic",
  },
  "50k group member elements": {
    elementCount: 50_000,
    groupCount: 10,
    membersPerGroup: 1_000,
    physicalElementClassName: "Generic.PhysicalObject",
    groupClassName: "Generic.Group",
    groupUserLabel: "test_group",
  },
  "50k subcategories": { elementCount: 50_000 },
  "50k functional 3D elements": {
    elementCount: 50_000,
    chainCount: 1_000,
    physicalElementClassName: "Generic.PhysicalObject",
    functionalElementClassName: "Functional.FunctionalComposite",
  },
  "50k functional 2D elements": {
    elementCount: 50_000,
    chainCount: 1_000,
    drawingGraphicClassName: "BisCore.DrawingGraphic",
    drawingGraphicUserLabel: "test_element",
    functionalElementClassName: "Functional.FunctionalComposite",
  },
} as const;
const IMODEL_NAMES = Object.keys(DATASETS) as IModelName[];

export type IModelName = keyof typeof DATASETS;
export type IModelPathsMap = { [_ in IModelName]?: string };

/** Name, iModel path and metadata of the given dataset. */
export interface Dataset<TName extends IModelName = IModelName> {
  name: TName;
  imodelPath: string;
  meta: (typeof DATASETS)[TName];
}

export class Datasets {
  static readonly #BAYTOWN_DOWNLOAD_URL = "https://github.com/imodeljs/desktop-starter/raw/master/assets/Baytown.bim";
  static readonly #iModels: IModelPathsMap = {};

  public static getDataset<TName extends IModelName>({ name }: { name: TName }): Dataset<TName> {
    return { name, imodelPath: this.#iModels[name]!, meta: DATASETS[name] };
  }

  public static async initialize({ datasetsDirPath }: { datasetsDirPath: string }) {
    fs.mkdirSync(datasetsDirPath, { recursive: true });

    // Download baytown iModel first to avoid timeouts in pipeline
    this.#iModels.baytown = await this.getOrCreateIModelPath({
      name: "baytown",
      folderPath: datasetsDirPath,
      factory: async (props) => this.downloadIModel({ ...props, downloadUrl: this.#BAYTOWN_DOWNLOAD_URL }),
    });

    const promises = IMODEL_NAMES.map(async (key) => {
      if (key === "baytown") {
        return;
      }
      this.#iModels[key] = await this.getOrCreateIModelPath({
        name: key,
        folderPath: datasetsDirPath,
        factory: this.createIModelFactory({ name: key }),
        force: !!process.env.RECREATE,
      });
    });
    await Promise.all(promises);
  }

  private static async getOrCreateIModelPath({
    name,
    folderPath,
    factory,
    force,
  }: {
    name: string;
    folderPath: string;
    factory: IModelFactory;
    force?: boolean;
  }) {
    const localPath = path.join(folderPath, `${name}.bim`);
    if (force || !fs.existsSync(localPath)) {
      console.log(`"${name}" iModel: Creating...`);
      await factory({ name, localPath });
      console.log(`"${name}" iModel: Done.`);
    }
    return path.resolve(localPath);
  }

  private static createIModelFactory({ name }: { name: Exclude<IModelName, "baytown"> }): IModelFactory {
    switch (name) {
      case "50k elements in 500 classes":
        return async (props) => this.createFlatElementsAcrossClassesIModel({ ...props, ...DATASETS[name] });
      case "50k hierarchical 2D and 3D elements":
        return async (props) => this.createHierarchical2dAnd3dElementsIModel({ ...props, ...DATASETS[name] });
      case "50k group member elements":
        return async (props) => this.createGroupMemberChainsIModel({ ...props, ...DATASETS[name] });
      case "1k subjects":
        return async (props) => this.createHierarchicalSubjectsIModel({ ...props, ...DATASETS[name] });
      case "50k subcategories":
        return async (props) => this.createSubcategoriesIModel({ ...props, ...DATASETS[name] });
      case "50k functional 3D elements":
        return async (props) => this.createFunctional3dElementsIModel({ ...props, ...DATASETS[name] });
      case "50k functional 2D elements":
        return async (props) => this.createFunctional2dElementsIModel({ ...props, ...DATASETS[name] });
    }
  }

  private static async downloadIModel({ name, downloadUrl, localPath }: IModelFactoryProps & { downloadUrl: string }) {
    console.log(`Downloading "${name}" iModel from "${downloadUrl}"...`);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${name} iModel: ${response.statusText}`);
    }

    await response.body!.pipeTo(
      fs.WriteStream.toWeb(fs.createWriteStream(localPath)) as WritableStream<Uint8Array<ArrayBuffer>>,
    );
  }

  /**
   * Create an iModel with `elementCount` physical elements without parent-child relationships, all belonging to the same
   * spatial category and physical model. The elements are evenly split into `classCount` batches, each of its own class
   * derived from a common base class. Elements in the same batch share the same user label and `schema.propertyName`
   * value.
   */
  private static async createFlatElementsAcrossClassesIModel({
    name,
    localPath,
    elementCount,
    classCount,
    schema: { name: schemaName, baseClassName, classNamePrefix, propertyName },
    userLabelPrefix,
    propertyValuePrefix,
    categoryCodeValue,
  }: IModelFactoryProps & Dataset<"50k elements in 500 classes">["meta"]) {
    const elementsPerGroup = elementCount / classCount;

    // prettier-ignore
    const schemaXml = `
      <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
      <ECEntityClass typeName="${baseClassName}">
        <BaseClass>bis:PhysicalElement</BaseClass>
        <ECProperty propertyName="${propertyName}" typeName="string" />
      </ECEntityClass>
      ${[...Array(classCount).keys()].map((i) => `
        <ECEntityClass typeName="${classNamePrefix}_${i}">
          <BaseClass>${baseClassName}</BaseClass>
        </ECEntityClass>
      `).join("")}
    `;

    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        await txn.iModel.importSchemaStrings([getFullSchemaXml({ schemaName, schemaContentXml: schemaXml })]);
        const { id: categoryId } = insertSpatialCategory({ txn, codeValue: categoryCodeValue });
        const { id: modelId } = insertPhysicalModelWithPartition({ txn, codeValue: "My Model" });
        for (let groupIdx = 0; groupIdx < classCount; ++groupIdx) {
          for (let j = 0; j < elementsPerGroup; ++j) {
            insertPhysicalElement({
              txn,
              classFullName: `${schemaName}.${classNamePrefix}_${groupIdx}` satisfies EC.FullClassNameDotNotation,
              userLabel: `${userLabelPrefix}_${groupIdx}`,
              modelId,
              categoryId,
              [propertyName]: `${propertyValuePrefix}_${groupIdx}`,
            });
          }
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` elements, half of them `physicalElementClassName` and the other half -
   * `drawingGraphicClassName` instances, all belonging to the same 2D and 3D model and category. The elements of each
   * class are set up in a hierarchical manner, with `chainCount` top level elements each having 1 child element, which
   * has 1 child element, and so on until the depth of `elementCount` / (2 * `chainCount`) elements is reached.
   */
  private static async createHierarchical2dAnd3dElementsIModel({
    name,
    localPath,
    elementCount,
    chainCount,
    physicalElementClassName,
    drawingGraphicClassName,
  }: IModelFactoryProps & Dataset<"50k hierarchical 2D and 3D elements">["meta"]) {
    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        const { id: spatialCategoryId } = insertSpatialCategory({ txn, codeValue: "My Category" });
        const { id: physicalModelId } = insertPhysicalModelWithPartition({ txn, codeValue: "My Model" });
        const { id: drawingModelId } = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
        const { id: drawingCategoryId } = insertDrawingCategory({ txn, codeValue: "test drawing category" });

        const chainLength = elementCount / (2 * chainCount);

        for (let i = 0; i < chainCount; ++i) {
          let physicalParentId: Id64String | undefined;
          let drawingParentId: Id64String | undefined;

          for (let j = 0; j < chainLength; ++j) {
            physicalParentId = insertPhysicalElement({
              txn,
              classFullName: physicalElementClassName,
              parentId: physicalParentId,
              modelId: physicalModelId,
              categoryId: spatialCategoryId,
              userLabel: `test_element`,
            }).id;
            drawingParentId = insertDrawingGraphic({
              txn,
              classFullName: drawingGraphicClassName,
              parentId: drawingParentId,
              modelId: drawingModelId,
              categoryId: drawingCategoryId,
              userLabel: `test_element`,
            }).id;
          }
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` subjects with `userLabel` user labels, set up in a hierarchical manner, with
   * `chainCount` top level subjects each having 1 child subject, which has 1 child subject, and so on until the depth of
   * `elementCount` / `chainCount` subjects is reached. The last subject in each chain has a physical model.
   */
  private static async createHierarchicalSubjectsIModel({
    name,
    localPath,
    elementCount,
    chainCount,
    userLabel,
  }: IModelFactoryProps & Dataset<"1k subjects">["meta"]) {
    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        const elementsPerChain = elementCount / chainCount;

        for (let i = 0; i < chainCount; ++i) {
          let parentId: Id64String | undefined;

          for (let j = 0; j < elementsPerChain; ++j) {
            parentId = insertSubject({ parentId, txn, codeValue: `subject_${i}_${j}`, userLabel }).id;
          }

          insertPhysicalModelWithPartition({ txn, codeValue: `model_${i}`, partitionParentId: parentId });
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` subcategories all belonging to the same parent spatial category.
   */
  private static async createSubcategoriesIModel({
    name,
    localPath,
    elementCount,
  }: IModelFactoryProps & { elementCount: number }) {
    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        const { id: categoryId } = insertSpatialCategory({ txn, codeValue: "My Category", userLabel: "test_category" });

        // Insert `elementCount` - 1 subcategories as `insertSpatialCategory` provides one additional subcategory
        for (let i = 0; i < elementCount - 1; ++i) {
          insertSubCategory({ parentCategoryId: categoryId, txn, codeValue: `${i}` });
        }
      },
    });
  }

  /**
   * Create `groupCount` `groupClassName` elements with `groupUserLabel` user labels, each grouping `membersPerGroup`
   * chain roots. Each chain contains `elementCount` / (`groupCount` * `membersPerGroup`) `physicalElementClassName`
   * elements. All physical elements belong to the same spatial category and physical model.
   */
  private static async createGroupMemberChainsIModel({
    name,
    localPath,
    elementCount,
    groupCount,
    membersPerGroup,
    physicalElementClassName,
    groupClassName,
    groupUserLabel,
  }: IModelFactoryProps & Dataset<"50k group member elements">["meta"]) {
    const elementsPerMember = elementCount / (groupCount * membersPerGroup);

    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        const { id: groupModelId } = insertGroupInformationModelWithPartition({
          txn,
          codeValue: "group information model",
        });
        const { id: modelId } = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
        const { id: categoryId } = insertSpatialCategory({ txn, codeValue: "My Category" });

        for (let groupIdx = 0; groupIdx < groupCount; ++groupIdx) {
          const { id: groupId } = insertGroupInformationElement({
            txn,
            classFullName: groupClassName,
            modelId: groupModelId,
            userLabel: groupUserLabel,
          });

          for (let i = 0; i < membersPerGroup; ++i) {
            let parentId: Id64String | undefined;

            for (let j = 0; j < elementsPerMember; ++j) {
              parentId = insertPhysicalElement({
                txn,
                classFullName: physicalElementClassName,
                parentId,
                modelId,
                categoryId,
              }).id;
              if (j === 0) {
                txn.insertRelationship({
                  sourceId: groupId,
                  targetId: parentId,
                  classFullName: "BisCore.ElementGroupsMembers",
                });
              }
            }
          }
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` `physicalElementClassName` elements all belonging to the same spatial category
   * and physical model. The elements are set up in a hierarchical manner, with `chainCount` top level elements, each
   * having 1 child element, which has 1 child element, and so on until the depth of `elementCount` / `chainCount`
   * elements is reached. Each physical element has a related `functionalElementClassName` element in a functional model,
   * where the functional elements form the same hierarchy.
   */
  private static async createFunctional3dElementsIModel({
    name,
    localPath,
    elementCount,
    chainCount,
    physicalElementClassName,
    functionalElementClassName,
  }: IModelFactoryProps & Dataset<"50k functional 3D elements">["meta"]) {
    const schema = await this.getSchemaFromBentleyPackage({
      packageName: "functional-schema",
      schemaFileName: "Functional.ecschema.xml",
    });

    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        await txn.iModel.importSchemaStrings([schema]);
        const { id: physicalModelId } = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
        const { id: functionalModelId } = insertFunctionalModelWithPartition({
          txn,
          codeValue: "test functional model",
        });
        const { id: categoryId } = insertSpatialCategory({ txn, codeValue: "test category" });

        const elementsPerChain = elementCount / chainCount;

        for (let i = 0; i < chainCount; ++i) {
          let physicalElementParentId: Id64String | undefined;
          let functionalElementParentId: Id64String | undefined;

          for (let j = 0; j < elementsPerChain; ++j) {
            physicalElementParentId = insertPhysicalElement({
              txn,
              classFullName: physicalElementClassName,
              parentId: physicalElementParentId,
              modelId: physicalModelId,
              categoryId,
              userLabel: "test_element",
            }).id;
            functionalElementParentId = insertFunctionalElement({
              txn,
              classFullName: functionalElementClassName,
              parentId: functionalElementParentId,
              modelId: functionalModelId,
              representedElementId: physicalElementParentId,
              relationshipName: "PhysicalElementFulfillsFunction",
              userLabel: "test_functional_element",
            }).id;
          }
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` `functionalElementClassName` elements all belonging to the same functional
   * model. The elements are set up in a hierarchical manner, with `chainCount` top level functional elements, each having
   * 1 child functional element, which has 1 child functional element, and so on until the depth of `elementCount` /
   * `chainCount` elements is reached. The last functional element in each chain is related to a `drawingGraphicClassName`
   * element, that has a child 2D element, that has a child 2D element, and so on until the depth of `elementCount` /
   * `chainCount` elements is reached. These 2D elements have `drawingGraphicUserLabel` user labels and belong to the same
   * drawing category and drawing model. Every functional element that is not the last in each chain is related to an
   * additional 2D element, resulting in a total of `elementCount` + 1 2D elements.
   */
  private static async createFunctional2dElementsIModel({
    name,
    localPath,
    elementCount,
    chainCount,
    drawingGraphicClassName,
    drawingGraphicUserLabel,
    functionalElementClassName,
  }: IModelFactoryProps & Dataset<"50k functional 2D elements">["meta"]) {
    const schema = await this.getSchemaFromBentleyPackage({
      packageName: "functional-schema",
      schemaFileName: "Functional.ecschema.xml",
    });

    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        await txn.iModel.importSchemaStrings([schema]);

        const { id: drawingModelId } = insertDrawingModelWithPartition({ txn, codeValue: "test drawing model" });
        const { id: functionalModelId } = insertFunctionalModelWithPartition({
          txn,
          codeValue: "test functional model",
        });
        const { id: categoryId } = insertDrawingCategory({ txn, codeValue: "test drawing category" });
        const { id: graphicsElementId } = insertDrawingGraphic({
          txn,
          classFullName: drawingGraphicClassName,
          modelId: drawingModelId,
          categoryId,
        });

        const elementsPerChain = elementCount / chainCount;

        for (let i = 0; i < chainCount; ++i) {
          let firstGraphicsElementId: Id64String | undefined;
          let graphicsElementParentId: Id64String | undefined;
          let functionalElementParentId: Id64String | undefined;

          for (let j = 0; j < elementsPerChain; ++j) {
            graphicsElementParentId = insertDrawingGraphic({
              parentId: graphicsElementParentId,
              txn,
              classFullName: drawingGraphicClassName,
              categoryId,
              modelId: drawingModelId,
              userLabel: drawingGraphicUserLabel,
            }).id;

            if (j === 0) {
              firstGraphicsElementId = graphicsElementParentId;
            }

            functionalElementParentId = insertFunctionalElement({
              parentId: functionalElementParentId,
              txn,
              classFullName: functionalElementClassName,
              modelId: functionalModelId,
              // Last functional element in the chain represents the first graphics element, others represent an element outside the chain.
              representedElementId: j === elementsPerChain - 1 ? firstGraphicsElementId! : graphicsElementId,
              relationshipName: "DrawingGraphicRepresentsFunctionalElement",
              userLabel: "test_functional_element",
            }).id;
          }
        }
      },
    });
  }

  private static async getSchemaFromBentleyPackage({
    packageName,
    schemaFileName,
  }: {
    packageName: string;
    schemaFileName: string;
  }): Promise<string> {
    const schemaFile = path.join(__dirname, "..", "..", "node_modules", "@bentley", packageName, schemaFileName);
    return fs.readFileSync(schemaFile, "utf8");
  }
}
