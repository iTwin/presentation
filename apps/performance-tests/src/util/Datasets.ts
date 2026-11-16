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
  insertPhysicalType,
  insertSpatialCategory,
  insertSubCategory,
  insertSubject,
} from "presentation-test-utilities";
import { Code, IModel } from "@itwin/core-common";
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
  "50k single-class elements": {
    elementCount: 50_000,
    bucketCount: 10,
    schema: {
      name: "ContentPerformance",
      className: "Element",
      ordinalPropertyName: "Ordinal",
      bucketPropertyName: "Bucket",
    },
    userLabelPrefix: "Element",
    modelCodeValue: "Content model",
    categoryCodeValue: "Content category",
  },
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
  "10k elements in 100 groups each, 10 elements in 50k groups": {
    elementCount: 10_000,
    groupCount: 50_000,
    groupsPerElement: 100,
    hubElementCount: 10,
    elementClassName: "Generic.PhysicalObject",
    hubElementClassName: "Generic.Graphic3d",
    groupClassName: "Generic.Group",
    groupUserLabelPrefix: "Group",
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
  "50k elements with properties, types and aspects": {
    elementCount: 50_000,
    directPropertyCount: 32,
    directStringPropertyLength: 32,
    typeCount: 10,
    aspectClassCount: 70,
    schema: {
      name: "ContentPerformance",
      className: "Element",
      propertyNamePrefix: "Value",
      aspectClassNamePrefix: "Aspect",
      aspectPropertyName: "Value",
    },
    typeClassName: "Generic.PhysicalType",
    typeUserLabelPrefix: "Type",
    userLabelPrefix: "Element",
  },
  "50k elements in 500 classes with 50 content modifiers": {
    ...ELEMENTS_IN_500_CLASSES,
    contentModifiers: { count: 50, labelPrefix: "Property" },
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
      case "50k elements in 500 classes with 50 content modifiers":
        return async (props) => this.createFlatElementsAcrossClassesIModel({ ...props, ...DATASETS[name] });
      case "50k single-class elements":
        return async (props) => this.createOrdinalAndBucketElementsIModel({ ...props, ...DATASETS[name] });
      case "50k elements with properties, types and aspects":
        return async (props) => this.createElementsWithPropertiesTypesAndAspectsIModel({ ...props, ...DATASETS[name] });
      case "50k hierarchical 2D and 3D elements":
        return async (props) => this.createHierarchical2dAnd3dElementsIModel({ ...props, ...DATASETS[name] });
      case "50k group member elements":
        return async (props) => this.createGroupMemberChainsIModel({ ...props, ...DATASETS[name] });
      case "10k elements in 100 groups each, 10 elements in 50k groups":
        return async (props) => this.createHighFanOutGroupMembersIModel({ ...props, ...DATASETS[name] });
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
   * Create `groupCount` `groupClassName` elements with `${groupUserLabelPrefix}_${index}` user labels and
   * `elementCount` `elementClassName` elements. Element `i` is a member of
   * the `groupsPerElement` groups starting at index `i * groupsPerElement`, wrapping around `groupCount`. Additional
   * `hubElementCount` `hubElementClassName` elements are members of every group. All non-group elements belong to the
   * same spatial category and physical model.
   */
  private static async createHighFanOutGroupMembersIModel({
    name,
    localPath,
    elementCount,
    groupCount,
    groupsPerElement,
    hubElementCount,
    elementClassName,
    hubElementClassName,
    groupClassName,
    groupUserLabelPrefix,
  }: IModelFactoryProps & Dataset<"10k elements in 100 groups each, 10 elements in 50k groups">["meta"]) {
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
        const groupIds = Array.from(
          { length: groupCount },
          (_, i) =>
            insertGroupInformationElement({
              txn,
              classFullName: groupClassName,
              modelId: groupModelId,
              userLabel: `${groupUserLabelPrefix}_${i}`,
            }).id,
        );
        const insertMember = (classFullName: `${string}.${string}`, memberGroupIds: Id64String[]) => {
          const { id: memberId } = insertPhysicalElement({ txn, classFullName, modelId, categoryId });
          for (const groupId of memberGroupIds) {
            txn.insertRelationship({
              sourceId: groupId,
              targetId: memberId,
              classFullName: "BisCore.ElementGroupsMembers",
            });
          }
        };
        for (let i = 0; i < elementCount; ++i) {
          insertMember(
            elementClassName,
            Array.from({ length: groupsPerElement }, (_, j) => groupIds[(i * groupsPerElement + j) % groupCount]),
          );
        }
        for (let i = 0; i < hubElementCount; ++i) {
          insertMember(hubElementClassName, groupIds);
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` physical elements without parent-child relationships, all belonging to the same
   * spatial category and physical model. The elements are evenly split into `classCount` batches, each of its own class
   * derived from a common base class. Elements in the same batch share the same user label and `schema.propertyName`
   * value. When `contentModifiers` is set, the iModel also contains a ruleset with content modifiers for the first
   * `contentModifiers.count` classes, which display `schema.propertyName` with `${contentModifiers.labelPrefix} ${index}`
   * labels.
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
    contentModifiers,
  }: IModelFactoryProps &
    Omit<typeof ELEMENTS_IN_500_CLASSES, "elementCount" | "classCount"> & {
      elementCount: number;
      classCount: number;
      contentModifiers?: { count: number; labelPrefix: string };
    }) {
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
        if (contentModifiers) {
          await txn.iModel.importSchemaStrings([
            getFullSchemaXml({
              schemaName: "PresentationRules",
              schemaAlias: "pr",
              schemaContentXml: `
              <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
              <ECEntityClass typeName="Ruleset">
                <BaseClass>bis:DefinitionElement</BaseClass>
              </ECEntityClass>
            `,
            }),
          ]);
          txn.insertElement({
            classFullName: "PresentationRules.Ruleset",
            model: IModel.dictionaryId,
            code: Code.createEmpty(),
            jsonProperties: {
              // The embedded-ruleset reader expects this nested payload in the JsonProperties column.
              jsonProperties: {
                id: "content-performance-modifiers",
                supplementationInfo: { supplementationPurpose: "content-performance" },
                rules: Array.from({ length: contentModifiers.count }, (_, i) => ({
                  ruleType: "ContentModifier",
                  class: { schemaName, className: `${classNamePrefix}_${i}` },
                  propertyOverrides: [
                    { name: propertyName, isDisplayed: true, labelOverride: `${contentModifiers.labelPrefix} ${i}` },
                    { name: "UserLabel", isDisplayed: true },
                  ],
                })),
              },
            },
          });
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` `${schema.name}.${schema.className}` instances with
   * `${userLabelPrefix}_${index}` user labels, all belonging to the `modelCodeValue` physical model and
   * `categoryCodeValue` spatial category. Values of `schema.ordinalPropertyName` are unique and inserted in reverse,
   * while values of `schema.bucketPropertyName` take `bucketCount` values in insertion order.
   */
  private static async createOrdinalAndBucketElementsIModel({
    name,
    localPath,
    elementCount,
    bucketCount,
    schema,
    userLabelPrefix,
    modelCodeValue,
    categoryCodeValue,
  }: IModelFactoryProps & Dataset<"50k single-class elements">["meta"]) {
    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        await txn.iModel.importSchemaStrings([
          getFullSchemaXml({
            schemaName: schema.name,
            schemaContentXml: `
            <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
            <ECEntityClass typeName="${schema.className}">
              <BaseClass>bis:PhysicalElement</BaseClass>
              <ECProperty propertyName="${schema.ordinalPropertyName}" typeName="int" />
              <ECProperty propertyName="${schema.bucketPropertyName}" typeName="int" />
            </ECEntityClass>
          `,
          }),
        ]);
        const { id: modelId } = insertPhysicalModelWithPartition({ txn, codeValue: modelCodeValue });
        const { id: categoryId } = insertSpatialCategory({ txn, codeValue: categoryCodeValue });
        for (let i = 0; i < elementCount; ++i) {
          insertPhysicalElement({
            txn,
            modelId,
            categoryId,
            classFullName: `${schema.name}.${schema.className}`,
            userLabel: `${userLabelPrefix}_${i}`,
            [schema.ordinalPropertyName]: elementCount - i - 1,
            [schema.bucketPropertyName]: i % bucketCount,
          });
        }
      },
    });
  }

  /**
   * Create an iModel with `elementCount` `${schema.name}.${schema.className}` instances with
   * `${userLabelPrefix}_${index}` user labels in the same physical model and spatial category. Every element has
   * `directPropertyCount` string properties named `${schema.propertyNamePrefix}${index}`, each holding the last digit of
   * `index` repeated `directStringPropertyLength` times.
   *
   * There are `typeCount` `typeClassName` instances with `${typeUserLabelPrefix}_${index}` user labels, each owning one unique aspect of every `aspectClassCount` aspect
   * class `${schema.name}.${schema.aspectClassNamePrefix}${index}`, with `schema.aspectPropertyName` set to the aspect
   * class index + `aspectClassCount`. Element `i` is of type `i % typeCount` and owns aspects of the classes whose index
   * has the same remainder, with `schema.aspectPropertyName` set to the aspect class index. Together the elements own
   * aspects of every class.
   */
  private static async createElementsWithPropertiesTypesAndAspectsIModel({
    name,
    localPath,
    elementCount,
    directPropertyCount,
    directStringPropertyLength,
    typeCount,
    aspectClassCount,
    schema,
    typeClassName,
    typeUserLabelPrefix,
    userLabelPrefix,
  }: IModelFactoryProps & Dataset<"50k elements with properties, types and aspects">["meta"]) {
    const getAspectClassName = (index: number) => `${schema.name}.${schema.aspectClassNamePrefix}${index}`;
    await createSnapshotIModel({
      name,
      localPath,
      populate: async (txn) => {
        await txn.iModel.importSchemaStrings([
          getFullSchemaXml({
            schemaName: schema.name,
            schemaContentXml: `
            <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
            <ECEntityClass typeName="${schema.className}">
              <BaseClass>bis:PhysicalElement</BaseClass>
              ${Array.from(
                { length: directPropertyCount },
                (_, i) => `<ECProperty propertyName="${schema.propertyNamePrefix}${i}" typeName="string" />`,
              ).join("")}
            </ECEntityClass>
            ${Array.from(
              { length: aspectClassCount },
              (_, i) => `
                <ECEntityClass typeName="${schema.aspectClassNamePrefix}${i}">
                  <BaseClass>bis:ElementUniqueAspect</BaseClass>
                  <ECProperty propertyName="${schema.aspectPropertyName}" typeName="int" />
                </ECEntityClass>
              `,
            ).join("")}
          `,
          }),
        ]);
        const { id: modelId } = insertPhysicalModelWithPartition({ txn, codeValue: "Content model" });
        const { id: categoryId } = insertSpatialCategory({ txn, codeValue: "Content category" });
        const typeIds = Array.from({ length: typeCount }, (_, type) => {
          const { id: typeId } = insertPhysicalType({
            txn,
            classFullName: typeClassName,
            userLabel: `${typeUserLabelPrefix}_${type}`,
          });
          for (let aspect = 0; aspect < aspectClassCount; ++aspect) {
            const aspectProps = {
              classFullName: getAspectClassName(aspect),
              element: { id: typeId },
              [schema.aspectPropertyName]: aspect + aspectClassCount,
            };
            txn.insertAspect(aspectProps);
          }
          return typeId;
        });
        const propertyValues = Object.fromEntries(
          Array.from({ length: directPropertyCount }, (_, i) => [
            `${schema.propertyNamePrefix}${i}`,
            String(i % 10).repeat(directStringPropertyLength),
          ]),
        );
        for (let i = 0; i < elementCount; ++i) {
          const type = i % typeCount;
          const { id: elementId } = insertPhysicalElement({
            txn,
            modelId,
            categoryId,
            typeDefinitionId: typeIds[type],
            classFullName: `${schema.name}.${schema.className}`,
            userLabel: `${userLabelPrefix}_${i}`,
            ...propertyValues,
          });
          for (let aspect = type; aspect < aspectClassCount; aspect += typeCount) {
            const aspectProps = {
              classFullName: getAspectClassName(aspect),
              element: { id: elementId },
              [schema.aspectPropertyName]: aspect,
            };
            txn.insertAspect(aspectProps);
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
