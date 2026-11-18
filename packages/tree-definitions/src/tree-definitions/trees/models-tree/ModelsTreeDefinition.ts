/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  bufferCount,
  defer,
  EMPTY,
  filter,
  firstValueFrom,
  forkJoin,
  from,
  fromEvent,
  identity,
  map,
  merge,
  mergeMap,
  reduce,
  switchMap,
  takeUntil,
} from "rxjs";
import { assert, Guid } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import {
  createPredicateBasedHierarchyDefinition,
  HierarchyNode,
  HierarchySearchTree,
  ProcessedHierarchyNode,
} from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, eachValueFrom, ECSql } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { fromWithRelease, releaseMainThreadOnItemsCount, toObservable, toPromise } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts, SearchLimitExceededError } from "../../shared/TreeErrors.js";
import {
  createExcludedClassesClause,
  createWhereClause,
  getOptimalBatchSize,
  groupingNodeDataFromChildren,
  mergeWithDefaults,
} from "../../shared/Utils.js";
import { ModelsTreeNodeInternal } from "./ModelsTreeNodeInternal.js";

import type { Observable, OperatorFunction } from "rxjs";
import type { GuidString, Id64Array, Id64String } from "@itwin/core-bentley";
import type {
  ClassGroupingNodeKey,
  DefineHierarchyLevelProps,
  DefineInstanceNodeChildHierarchyLevelProps,
  GroupingHierarchyNode,
  HierarchyDefinition,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  IModelInstanceKey,
  LimitingECSqlQueryExecutor,
  NodePostProcessor,
  NodePreProcessor,
} from "@itwin/presentation-hierarchies";
import type {
  DeepReadonly,
  EC,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryRow,
  IInstanceLabelSelectClauseFactory,
  InstanceKey,
} from "@itwin/presentation-shared";
import type { CategoryId } from "../../shared/Types.js";
import type { DeepRequired, HiddenClassesFilter } from "../../shared/Utils.js";
import type { ModelsTreeIdsProvider } from "./ModelsTreeIdsProvider.js";
import type { CategoryNodeProps } from "./ModelsTreeNodeInternal.js";

/**
 * An element class grouping node that can be used as a search target.
 * @beta
 */
export type ClassGroupingHierarchyNode = GroupingHierarchyNode & { key: ClassGroupingNodeKey };

const MAX_SEARCH_INSTANCE_KEY_COUNT = 100;

/**
 * Configures subject, model, category, and element nodes produced by `createModelsTree`.
 * @beta
 */
export interface ModelsTreeHierarchyConfiguration {
  /**
   * Controls whether hierarchy levels are filterable.
   *
   * Defaults to `"enable"`.
   */
  hierarchyLevelFiltering?: "enable" | "disable";
  /**
   * Subject node's configuration options.
   *
   * Defaults to `{ root: "include", labelMerging: "enable" }`.
   */
  subjects?: {
    /**
     * Controls whether the root Subject node is included in the hierarchy.
     *
     * Defaults to `"include"`.
     */
    root?: "include" | "exclude";
    /**
     * Controls whether sibling Subject nodes with the same label are merged into a single node.
     *
     * Defaults to `"enable"`.
     */
    labelMerging?: "enable" | "disable";
  };
  /**
   * Category node's configuration options.
   *
   * Defaults to `{ labelMerging: "enable" }`.
   */
  categories?: {
    /**
     * Controls whether sibling Category nodes with the same label are merged into a single node.
     *
     * Defaults to `"enable"`.
     */
    labelMerging?: "enable" | "disable";
  };
  /**
   * Element node's configuration options.
   *
   * Defaults to `{ baseClass: "BisCore.GeometricElement3d", classGrouping: "enable", excludedClasses: [] }`.
   */
  elements?: {
    /**
     * Full class name of a `GeometricElement3d` sub-class that should be used to load element nodes.
     *
     * Defaults to `BisCore.GeometricElement3d`.
     */
    baseClass?: EC.FullClassNameDotNotation;
    /**
     * Element classes to exclude from the hierarchy.
     *
     * Elements, whose class is or derives from one of the classes in this list, are not loaded into the hierarchy.
     * Children of such nodes are also not shown.
     *
     * Defaults to `[]`.
     */
    excludedClasses?: EC.FullClassNameDotNotation[];
    /**
     * Controls how element nodes are grouped.
     *
     * Defaults to `"enable"`.
     */
    classGrouping?: "enable" | "enable-with-counts" | "disable";
  };
  /**
   * Model node's configuration options.
   *
   * Defaults to `{ withoutElements: "exclude", labelMerging: "enable" }`.
   */
  models?: {
    /**
     * Controls whether models that have no elements in the iModel are included in the hierarchy.
     *
     * Defaults to `"exclude"`.
     */
    withoutElements?: "include" | "exclude";
    /**
     * Controls whether sibling Model nodes with the same label are merged into a single node.
     *
     * Defaults to `"enable"`.
     */
    labelMerging?: "enable" | "disable";
  };
}

/** @internal */
export type RequiredModelsTreeHierarchyConfiguration = DeepRequired<ModelsTreeHierarchyConfiguration>;

/** @internal */
export const defaultHierarchyConfiguration: RequiredModelsTreeHierarchyConfiguration = {
  subjects: { root: "include", labelMerging: "enable" },
  categories: { labelMerging: "enable" },
  elements: { baseClass: CLASS_NAMES.GeometricElement3d, excludedClasses: [], classGrouping: "enable" },
  models: { withoutElements: "exclude", labelMerging: "enable" },
  hierarchyLevelFiltering: "enable",
};

/**
 * Full class names of instances that may appear in a models hierarchy search path.
 * @beta
 */
type ModelsTreeSearchPathClasses =
  | "BisCore.Subject"
  | "BisCore.GeometricModel3d"
  | "BisCore.SpatialCategory"
  | "BisCore.GeometricElement3d";

/**
 * Key of a single instance in a models hierarchy search path, with `className` narrowed to `ModelsTreeSearchPathClasses`.
 * @beta
 */
export type ModelsTreeSearchPathKey = IModelInstanceKey & { className: ModelsTreeSearchPathClasses };

/**
 * A path of instance keys from a root node to a search target in a models hierarchy.
 * @beta
 */
export type ModelsTreeSearchPath = ReadonlyArray<Readonly<ModelsTreeSearchPathKey>>;

/**
 * A `HierarchySearchTree` whose entries identify only the instance classes that a models hierarchy search can return.
 * @beta
 */
export interface ModelsTreeSearchTree extends Omit<HierarchySearchTree, "identifier" | "children"> {
  /** Key of the instance this tree entry represents. */
  identifier: ModelsTreeSearchPathKey;
  /** Child entries representing the next level(s) in the search paths. */
  children?: ModelsTreeSearchTree[];
}

/**
 * Props that identify the parent of a models tree hierarchy level by a path of instance keys from a root node.
 * @internal
 */
interface ModelsTreePathProps {
  path: DeepReadonly<IModelInstanceKey[]>;
}

/** Props that identify the parent of a hierarchy level for `defineHierarchyLevel` - a parent node or a path. */
type ModelsTreeHierarchyLevelParentProps = Pick<DefineHierarchyLevelProps, "parentNode"> | ModelsTreePathProps;

/** Props that identify the parent of a hierarchy level for node processors - a parent node or a path. */
type ModelsTreeProcessorParentProps = Pick<Parameters<NodePostProcessor>[0], "parentNode"> | ModelsTreePathProps;

/** Props for creating a hierarchy level, regardless of how its parent is identified. */
type ModelsTreeChildrenQueryProps = Pick<
  DefineInstanceNodeChildHierarchyLevelProps,
  "instanceFilter" | "createSelectClause" | "createFilterClauses"
>;

/** Finds the closest entry of the given class in the path, going from its end. */
function findClosestPathEntry(path: ModelsTreePathProps["path"], className: string) {
  for (let i = path.length - 1; i >= 0; --i) {
    if (path[i].className === className) {
      return path[i];
    }
  }
  return undefined;
}

/**
 * Returns ID of the category of the element at the end of the path. Child elements with the same category as their
 * parent element aren't grouped under category nodes, so the closest category in the path is the element's category.
 */
function getElementCategoryId(path: ModelsTreePathProps["path"]): Id64String {
  const category = findClosestPathEntry(path, CLASS_NAMES.SpatialCategory);
  assert(category !== undefined, "Expected element to have a category in its path");
  return category.id;
}

/** Returns IDs of models and parent elements of category nodes - categories are children of either models or elements. */
function getCategoryNodeParentIds(parentProps: ModelsTreeProcessorParentProps): CategoryNodeProps {
  if ("path" in parentProps) {
    const { path } = parentProps;
    const parentEntry = path.at(-1);
    assert(parentEntry !== undefined, "Expected category node to have a parent");
    if (parentEntry.className === CLASS_NAMES.GeometricElement3d) {
      // elements are in the closest model of their path
      const model = findClosestPathEntry(path, CLASS_NAMES.GeometricModel3d);
      assert(model !== undefined, "Expected element to have a model in its path");
      return { modelIds: [model.id], parentElementIds: [parentEntry.id] };
    }
    assert(parentEntry.className === CLASS_NAMES.GeometricModel3d, "Expected category node parent to be a model");
    return { modelIds: [parentEntry.id] };
  }
  const { parentNode } = parentProps;
  assert(parentNode !== undefined, "Expected category node to have a parent node");
  if (ModelsTreeNodeInternal.isElementNode(parentNode)) {
    return {
      modelIds: [parentNode.extendedData.modelId],
      parentElementIds: parentNode.key.instanceKeys.map(({ id }) => id),
    };
  }
  assert(ModelsTreeNodeInternal.isModelNode(parentNode), "Expected category node parent to be a model node");
  return { modelIds: parentNode.key.instanceKeys.map(({ id }) => id) };
}

/** Returns the category of the modeled element, if the model is a sub-model, i.e. a child of an element. */
function getSubModeledElementCategory(parentProps: ModelsTreeProcessorParentProps): Id64String | undefined {
  if ("path" in parentProps) {
    const { path } = parentProps;
    return path.at(-1)?.className === CLASS_NAMES.GeometricElement3d ? getElementCategoryId(path) : undefined;
  }
  const { parentNode } = parentProps;
  return parentNode && ModelsTreeNodeInternal.isElementNode(parentNode)
    ? parentNode.extendedData.categoryId
    : undefined;
}

/** @internal */
interface ModelsTreeDefinitionProps {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  idsProvider: ModelsTreeIdsProvider;
  hierarchyConfig?: ModelsTreeHierarchyConfiguration;
  uniqueId?: GuidString;
}

/**
 * Identifies an element class grouping node and its containing category or element for hierarchy searches.
 * @beta
 */
export interface ElementsGroupInfo {
  parent: { ids: Id64String[]; type: "element" } | { ids: Id64String[]; modelIds: Id64String[]; type: "category" };
  groupingNode: ClassGroupingHierarchyNode;
}

/**
 * Visibility, limits, and cancellation options for models hierarchy searches.
 * @beta
 */
export interface ModelsTreeSearchOptions {
  /** Maximum number of matching instances. Defaults to 100; use `"unbounded"` to disable the limit. */
  limit?: number | "unbounded";
  /**
   * Includes only visible hierarchy node instance keys in the returned search paths.
   * Defaults to `false`.
   *
   * Leave disabled when passing results to `createIModelHierarchyProvider`, which requires hidden entries
   * for traversal.
   */
  includeOnlyVisibleNodeInstanceKeys?: boolean;
  /** Stops loading further paths when aborted. */
  abortSignal?: AbortSignal;
}

/** @internal */
type ModelsTreeInstanceKeyPathsBaseProps = ModelsTreeDefinitionProps & ModelsTreeSearchOptions;

/**
 * Search targets specified as instance keys or element class grouping nodes.
 * @internal
 */
type ModelsTreeInstanceKeyPathsFromTargetItemsProps = {
  targetItems: Array<InstanceKey | ElementsGroupInfo>;
} & ModelsTreeInstanceKeyPathsBaseProps;

/**
 * Search targets selected by a substring of their instance label.
 * @internal
 */
type ModelsTreeInstanceKeyPathsFromInstanceLabelProps = { label: string } & ModelsTreeInstanceKeyPathsBaseProps;

/**
 * Options for locating hierarchy paths by label, instance keys, or element class grouping nodes.
 * @internal
 */
type ModelsTreeInstanceKeyPathsProps =
  | ModelsTreeInstanceKeyPathsFromTargetItemsProps
  | ModelsTreeInstanceKeyPathsFromInstanceLabelProps;

/**
 * Defines a configurable hierarchy of subjects, models, categories, and geometric elements.
 *
 * Parents of hierarchy levels may be identified either by parent nodes, or by paths of instance keys from a root node,
 * so the definition can be used with `createIModelHierarchyProvider` and `createHierarchyNodePaths` from
 * `@itwin/presentation-hierarchies`.
 * @internal
 */
export class ModelsTreeDefinition implements HierarchyDefinition, HierarchyDefinition<ModelsTreePathProps> {
  #impl: HierarchyDefinition;
  #idsProvider: ModelsTreeIdsProvider;
  #hierarchyConfig: RequiredModelsTreeHierarchyConfiguration;
  #schemaProvider: ECSchemaProvider;
  #isSupported?: Promise<boolean>;
  static #componentName = "ModelsTreeDefinition";

  public constructor(props: ModelsTreeDefinitionProps) {
    this.#hierarchyConfig = mergeWithDefaults({
      defaults: defaultHierarchyConfiguration,
      overrides: props.hierarchyConfig,
    });
    this.#impl = createPredicateBasedHierarchyDefinition({
      imodelAccess: props.imodelAccess,
      hierarchy: {
        rootNodes: async (requestProps) => this.createRootNodesQuery(requestProps),
        childNodes: [
          {
            parentInstancesNodePredicate: CLASS_NAMES.Subject,
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) =>
              this.createSubjectChildrenQuery(requestProps),
          },
          {
            parentInstancesNodePredicate: CLASS_NAMES.ISubModeledElement,
            definitions: async ({
              parentNodeInstanceIds,
              ...requestProps
            }: DefineInstanceNodeChildHierarchyLevelProps) =>
              this.createISubModeledElementChildrenQuery({ ...requestProps, elementIds: parentNodeInstanceIds }),
          },
          {
            parentInstancesNodePredicate: CLASS_NAMES.GeometricModel3d,
            definitions: async ({
              parentNode,
              parentNodeInstanceIds,
              ...requestProps
            }: DefineInstanceNodeChildHierarchyLevelProps) =>
              this.createGeometricModel3dChildrenQuery({
                ...requestProps,
                modelIds: parentNodeInstanceIds,
                subModeledElementCategory: parentNode.extendedData?.subModeledElementCategory,
              }),
          },
          {
            parentInstancesNodePredicate: CLASS_NAMES.SpatialCategory,
            definitions: async ({
              parentNode,
              parentNodeInstanceIds,
              ...requestProps
            }: DefineInstanceNodeChildHierarchyLevelProps) => {
              assert(ModelsTreeNodeInternal.isCategoryNode(parentNode), "Expected category node as parent");
              return this.createSpatialCategoryChildrenQuery({
                ...requestProps,
                categoryIds: parentNodeInstanceIds,
                modelIds: parentNode.extendedData.modelIds,
                parentElementIds: parentNode.extendedData.parentElementIds,
              });
            },
          },
          {
            parentInstancesNodePredicate: CLASS_NAMES.GeometricElement3d,
            definitions: async ({
              parentNode,
              parentNodeInstanceIds,
              ...requestProps
            }: DefineInstanceNodeChildHierarchyLevelProps) => {
              assert(ModelsTreeNodeInternal.isElementNode(parentNode), "Expected parent node to be element node");
              return this.createGeometricElement3dChildrenQuery({
                ...requestProps,
                elementIds: parentNodeInstanceIds,
                categoryId: parentNode.extendedData.categoryId,
              });
            },
          },
        ],
      },
    });
    this.#idsProvider = props.idsProvider;
    this.#schemaProvider = props.imodelAccess;
  }

  // Parent-specific ids are assigned here rather than inlined into queries, so that query text stays the same for
  // every parent and prepared statements get reused.
  public preProcessNode: NodePreProcessor<ModelsTreeProcessorParentProps> = async ({ node, ...parentProps }) => {
    if (ModelsTreeNodeInternal.isRawCategoryNode(node)) {
      return { ...node, extendedData: { ...node.extendedData, ...getCategoryNodeParentIds(parentProps) } };
    }
    if (ModelsTreeNodeInternal.isModelNode(node)) {
      const subModeledElementCategory = getSubModeledElementCategory(parentProps);
      if (subModeledElementCategory !== undefined) {
        return { ...node, extendedData: { ...node.extendedData, subModeledElementCategory } };
      }
    }
    return node;
  };

  public postProcessNode: NodePostProcessor<ModelsTreeProcessorParentProps> = async ({ node }) => {
    if (!ProcessedHierarchyNode.isGroupingNode(node)) {
      return node;
    }
    const { hasSearchTargetAncestor, hasDirectNonSearchTargets } = groupingNodeDataFromChildren(node.children);
    const childrenWhichAreParents = new Set(
      node.children
        .filter((child) => !!child.children)
        .map((child) => {
          assert(
            ModelsTreeNodeInternal.isRawElementNode(child),
            "Expect all children of grouping nodes to be element nodes",
          );
          return child.key.instanceKeys.map(({ id }) => id);
        })
        .flat(),
    );
    const firstChild = node.children[0];
    assert(
      ModelsTreeNodeInternal.isRawElementNode(firstChild),
      "Expect first child of grouping node to be an element node",
    );

    return {
      ...node,
      label:
        this.#hierarchyConfig.elements.classGrouping === "enable-with-counts"
          ? `${node.label} (${node.children.length})`
          : node.label,
      extendedData: {
        ...node.extendedData,
        // `modelId`, `categoryId` are shared by all grouped elements.
        categoryId: firstChild.extendedData.categoryId,
        modelId: firstChild.extendedData.modelId,
        childrenWhichAreParents,
        ...(hasDirectNonSearchTargets ? { hasDirectNonSearchTargets } : {}),
        ...(hasSearchTargetAncestor ? { hasSearchTargetAncestor } : {}),
      },
    };
  };

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps<ModelsTreeHierarchyLevelParentProps>) {
    if (this.#isSupported === undefined) {
      this.#isSupported = this.isSupported();
    }

    if ((await this.#isSupported) === false) {
      return [];
    }

    if ("path" in props) {
      const { path, ...requestProps } = props;
      return this.definePathHierarchyLevel({ ...requestProps, path });
    }
    return this.#impl.defineHierarchyLevel(props);
  }

  /** Creates the hierarchy level, whose parent is identified by the given path of instance keys. */
  private async definePathHierarchyLevel({
    path,
    ...requestProps
  }: ModelsTreeChildrenQueryProps & ModelsTreePathProps): Promise<HierarchyLevelDefinition> {
    if (!path.length) {
      return this.createRootNodesQuery(requestProps);
    }
    const lastPathEntry = path[path.length - 1];
    switch (lastPathEntry.className) {
      case CLASS_NAMES.Subject:
        return this.createSubjectChildrenQuery({ ...requestProps, parentNodeInstanceIds: [lastPathEntry.id] });
      case CLASS_NAMES.GeometricModel3d:
        return this.createGeometricModel3dChildrenQuery({
          ...requestProps,
          modelIds: [lastPathEntry.id],
          subModeledElementCategory: getSubModeledElementCategory({ path: path.slice(0, -1) }),
        });
      case CLASS_NAMES.SpatialCategory:
        return this.createSpatialCategoryChildrenQuery({
          ...requestProps,
          categoryIds: [lastPathEntry.id],
          ...getCategoryNodeParentIds({ path: path.slice(0, -1) }),
        });
      case CLASS_NAMES.GeometricElement3d: {
        const elementIds = [lastPathEntry.id];
        const [childrenFromParent, childrenFromModel] = await Promise.all([
          this.createGeometricElement3dChildrenQuery({
            ...requestProps,
            elementIds,
            categoryId: getElementCategoryId(path),
          }),
          this.createISubModeledElementChildrenQuery({ ...requestProps, elementIds }),
        ]);
        return [...childrenFromParent, ...childrenFromModel];
      }
      default:
        return [];
    }
  }

  private async createRootNodesQuery(requestProps: ModelsTreeChildrenQueryProps) {
    return this.createSubjectChildrenQuery({
      ...requestProps,
      parentNodeInstanceIds: this.#hierarchyConfig.subjects.root === "exclude" ? [IModel.rootSubjectId] : [],
    });
  }

  private async createSubjectChildrenQuery({
    parentNodeInstanceIds: parentSubjectIds,
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: Pick<
    DefineInstanceNodeChildHierarchyLevelProps,
    "parentNodeInstanceIds" | "instanceFilter" | "createSelectClause" | "createFilterClauses"
  >): Promise<HierarchyLevelDefinition> {
    const [subjectFilterClauses, modelFilterClauses, modelsHiddenClassesFilter, elementsHiddenClassesFilter] =
      await Promise.all([
        createFilterClauses({ filter: instanceFilter, contentClass: { fullName: CLASS_NAMES.Subject, alias: "this" } }),
        createFilterClauses({
          filter: instanceFilter,
          contentClass: { fullName: CLASS_NAMES.GeometricModel3d, alias: "this" },
        }),
        ECSql.createHiddenClassesFilter({
          schemaProvider: this.#schemaProvider,
          baseClassName: CLASS_NAMES.GeometricModel3d,
        }),
        ECSql.createHiddenClassesFilter({
          schemaProvider: this.#schemaProvider,
          baseClassName: this.#hierarchyConfig.elements.baseClass,
        }),
      ]);
    const { childSubjectIds, childModelIds, subjectWhichAreParents } = parentSubjectIds.length
      ? await firstValueFrom(
          forkJoin({
            childSubjectIds: toObservable(this.#idsProvider.getChildSubjectIds(parentSubjectIds)),
            childModelIds: toObservable(this.#idsProvider.getChildSubjectModelIds(parentSubjectIds)),
            subjectWhichAreParents: toObservable(this.#idsProvider.getParentSubjectIds()),
          }),
        )
      : { childSubjectIds: [IModel.rootSubjectId], childModelIds: [], subjectWhichAreParents: [IModel.rootSubjectId] };
    const defs = new Array<HierarchyNodesDefinition>();
    if (childSubjectIds.length) {
      defs.push({
        fullClassName: CLASS_NAMES.Subject,
        query: {
          ecsql: `
            SELECT
              ${await createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { of: { classAlias: "this", className: CLASS_NAMES.Subject } },
                hideIfNoChildren: true,
                hasChildren: {
                  selector: `IFNULL(
                    (
                      SELECT 1
                      FROM IdSet(?) hasChildrenIdSet
                      WHERE hasChildrenIdSet.id = this.ECInstanceId
                      LIMIT 1
                    ),
                    0
                  )`,
                },
                ...(this.#hierarchyConfig.subjects.labelMerging === "enable"
                  ? { grouping: { byLabel: { action: "merge", groupId: "subject" } } }
                  : {}),
                extendedData: {
                  isRootSubject: { selector: `IIF(this.ECInstanceId = ${IModel.rootSubjectId}, true, false)` },
                  type: "subject",
                },
                autoExpand: { selector: `IIF(this.ECInstanceId = ${IModel.rootSubjectId}, true, false)` },
                supportsFiltering: this.supportsFiltering(),
              })}
            FROM ${subjectFilterClauses.from} this
            JOIN IdSet(?) childSubjectIdSet ON this.ECInstanceId = childSubjectIdSet.id
            ${subjectFilterClauses.joins}
            ${createWhereClause({ conditions: [subjectFilterClauses.where] })}
          `,
          bindings: [
            { type: "idset", value: subjectWhichAreParents },
            { type: "idset", value: childSubjectIds },
          ],
        },
      });
    }
    if (childModelIds.length) {
      defs.push({
        fullClassName: CLASS_NAMES.GeometricModel3d,
        query: {
          ecsql: `
            SELECT
              ${await createSelectClause({
                ecClassId: { selector: "model.ECClassId" },
                ecInstanceId: { selector: "model.ECInstanceId" },
                nodeLabel: { of: { classAlias: "partition", className: CLASS_NAMES.InformationPartitionElement } },
                hideNodeInHierarchy: { selector: "model.IsHidden" },
                hasChildren:
                  this.#hierarchyConfig.models.withoutElements === "include" ||
                  this.#hierarchyConfig.elements.excludedClasses.length
                    ? { selector: "model.HasChildren" }
                    : true,
                ...(this.#hierarchyConfig.models.labelMerging === "enable"
                  ? { grouping: { byLabel: { action: "merge", groupId: "model" } } }
                  : {}),
                extendedData: { type: "model" },
                supportsFiltering: this.supportsFiltering(),
              })}
            FROM (
              SELECT
                CASE
                  WHEN (
                    json_extract(p.JsonProperties, '$.PhysicalPartition.Model.Content') IS NOT NULL
                    OR json_extract(p.JsonProperties, '$.GraphicalPartition3d.Model.Content') IS NOT NULL
                  ) THEN 1
                  ELSE 0
                END IsHidden,
                ${
                  this.#hierarchyConfig.models.withoutElements === "include" ||
                  this.#hierarchyConfig.elements.excludedClasses.length
                    ? `IFNULL((
                        SELECT 1
                        FROM ${CLASS_NAMES.Element} e
                        ${createWhereClause({
                          conditions: [
                            "e.Model.Id = m.ECInstanceId",
                            `e.ECClassId IS (${this.#hierarchyConfig.elements.baseClass})`,
                            createExcludedClassesClause({
                              alias: "e",
                              excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                            }),
                            elementsHiddenClassesFilter.createWhereClause("e"),
                          ],
                        })}
                        LIMIT 1
                      ), 0)`
                    : "1"
                } HasChildren,
                m.*
              FROM ${CLASS_NAMES.GeometricModel3d} m
              JOIN IdSet(?) childModelIdSet ON m.ECInstanceId = childModelIdSet.id
              JOIN ${CLASS_NAMES.InformationPartitionElement} p ON p.ECInstanceId = m.ModeledElement.Id
            ) model
            JOIN ${modelFilterClauses.from} this ON this.ECInstanceId = model.ECInstanceId
            JOIN ${CLASS_NAMES.InformationPartitionElement} [partition] ON [partition].ECInstanceId = this.ModeledElement.Id
            ${modelFilterClauses.joins}
            ${createWhereClause({
              conditions: [
                modelsHiddenClassesFilter.createWhereClause("this"),
                modelFilterClauses.where && `model.IsHidden OR (${modelFilterClauses.where})`,
              ],
            })}
          `,
          bindings: [{ type: "idset", value: childModelIds }],
        },
      });
    }
    return defs;
  }

  private async createISubModeledElementChildrenQuery({
    elementIds,
    createSelectClause,
  }: ModelsTreeChildrenQueryProps & { elementIds: Id64String[] }): Promise<HierarchyLevelDefinition> {
    const elementsHiddenClassesFilter = await ECSql.createHiddenClassesFilter({
      schemaProvider: this.#schemaProvider,
      baseClassName: this.#hierarchyConfig.elements.baseClass,
    });
    // note: we do not apply hierarchy level filtering on this hierarchy level, because it's always
    // hidden - the filter will get applied on the child hierarchy levels
    return [
      {
        fullClassName: CLASS_NAMES.GeometricModel3d,
        query: {
          ecsql: `
            SELECT
              ${await createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: "", // doesn't matter - the node is always hidden
                hideNodeInHierarchy: true,
                hasChildren: true,
                extendedData: { type: "model" },
              })}
            FROM ${CLASS_NAMES.GeometricModel3d} this
            JOIN IdSet(?) elementIdSet ON this.ModeledElement.Id = elementIdSet.id
            ${createWhereClause({
              conditions: [
                "NOT this.IsPrivate",
                "NOT this.IsTemplate",
                `EXISTS (
                  SELECT 1
                  FROM ${CLASS_NAMES.Element} c
                  ${createWhereClause({
                    conditions: [
                      "c.Model.Id = this.ECInstanceId",
                      `c.ECClassId IS (${this.#hierarchyConfig.elements.baseClass})`,
                      createExcludedClassesClause({
                        alias: "c",
                        excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                      }),
                      elementsHiddenClassesFilter.createWhereClause("c"),
                    ],
                  })}
                )`,
              ],
            })}
          `,
          bindings: [{ type: "idset", value: elementIds }],
        },
      },
    ];
  }

  private async createGeometricModel3dChildrenQuery({
    modelIds,
    subModeledElementCategory,
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: ModelsTreeChildrenQueryProps & {
    modelIds: Id64String[];
    /** Category of the modeled element, if the models are sub-models. */
    subModeledElementCategory: Id64String | undefined;
  }): Promise<HierarchyLevelDefinition> {
    const [
      categoryInstanceFilterClauses,
      elementInstanceFilterClauses,
      allSubModels,
      categoryIds,
      elementsHiddenClassesFilter,
    ] = await Promise.all([
      createFilterClauses({
        filter: instanceFilter,
        contentClass: { fullName: CLASS_NAMES.SpatialCategory, alias: "this" },
      }),
      createFilterClauses({
        filter: instanceFilter,
        contentClass: { fullName: this.#hierarchyConfig.elements.baseClass, alias: "this" },
      }),
      this.#idsProvider.subModeledElements.state === "loaded"
        ? toPromise(
            this.#idsProvider.subModeledElements.getAllSubModeledElements({ excludeIfOnlyExcludedClasses: true }),
          )
        : undefined,
      this.#idsProvider.categories.state === "loaded"
        ? firstValueFrom(
            from(modelIds).pipe(
              mergeMap((modelId) => toObservable(this.#idsProvider.categories.getCategories({ modelId }))),
              reduce((acc, modelCategories) => {
                for (const categoryId of modelCategories) {
                  acc.add(categoryId);
                }
                return acc;
              }, new Set<CategoryId>()),
              map((categoryIdsSet) => [...categoryIdsSet]),
            ),
          )
        : undefined,
      ECSql.createHiddenClassesFilter({
        schemaProvider: this.#schemaProvider,
        baseClassName: this.#hierarchyConfig.elements.baseClass,
      }),
    ]);
    const cachedDataExists = !!categoryIds;
    if (cachedDataExists && categoryIds.length === 0) {
      return [];
    }
    // For top-level models show all categories of the top-most elements. For sub-models show only the categories
    // that don't match the sub-model element's category as intermediate category nodes - the elements matching
    // that category are shown directly (see below).
    const categoriesToShow =
      subModeledElementCategory === undefined
        ? categoryIds
        : categoryIds?.filter((categoryId) => categoryId !== subModeledElementCategory);
    const hasElementsWithTheSameCategory = categoriesToShow?.length !== categoryIds?.length;
    const definitions: HierarchyLevelDefinition = [];
    if (!categoriesToShow || categoriesToShow.length > 0) {
      definitions.push({
        fullClassName: CLASS_NAMES.SpatialCategory,
        query: {
          ecsql: `
            SELECT ${
              // filter joins may traverse to-many relationships and return the same category multiple times
              categoryInstanceFilterClauses.joins ? "DISTINCT" : ""
            }
              ${await this.createCategoryNodeSelectClause({ createSelectClause })}
            FROM ${categoryInstanceFilterClauses.from} this
            ${
              categoriesToShow
                ? "JOIN IdSet(?) categoryIdSet ON categoryIdSet.id = this.ECInstanceId"
                : `
                  JOIN (
                    SELECT DISTINCT ce.Category.Id categoryId
                    FROM IdSet(?) modelIdSet
                    CROSS JOIN ${CLASS_NAMES.Element} e ON e.Model.Id = modelIdSet.id
                    CROSS JOIN ${this.#hierarchyConfig.elements.baseClass} ce ON ce.ECInstanceId = e.ECInstanceId
                    ${createWhereClause({
                      conditions: [
                        "e.Parent.Id IS NULL",
                        createExcludedClassesClause({
                          alias: "e",
                          excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                        }),
                        elementsHiddenClassesFilter.createWhereClause("e"),
                      ],
                    })}
                  ) c ON c.categoryId = this.ECInstanceId
                `
            }
            ${categoryInstanceFilterClauses.joins}
            ${createWhereClause({
              conditions: [
                categoryInstanceFilterClauses.where,
                !categoriesToShow && subModeledElementCategory !== undefined && `this.ECInstanceId <> ?`,
              ],
            })}
          `,
          bindings: [
            { type: "idset", value: categoriesToShow ? categoriesToShow : modelIds },
            ...(!categoriesToShow && subModeledElementCategory !== undefined
              ? [{ type: "id" as const, value: subModeledElementCategory }]
              : []),
          ],
        },
      });
    }
    // Show elements which match the sub-model element's category directly under the (hidden) sub-model node.
    if (subModeledElementCategory !== undefined && (!cachedDataExists || hasElementsWithTheSameCategory)) {
      const { selectClause, bindings } = await this.createElementNodeSelectClause({
        createSelectClause,
        elementsHiddenClassesFilter,
        // allSubModels are defined when subModeledElementCategory is defined
        allSubModels: allSubModels ? [...allSubModels] : undefined,
      });
      definitions.push({
        fullClassName: this.#hierarchyConfig.elements.baseClass,
        query: {
          ecsql: `
            SELECT
              ${selectClause}
            FROM ${elementInstanceFilterClauses.from} this
            JOIN IdSet(?) modelIdSet ON this.Model.Id = modelIdSet.id
            ${elementInstanceFilterClauses.joins}
            ${createWhereClause({
              conditions: [
                "this.Parent.Id IS NULL",
                `this.Category.Id = ?`,
                createExcludedClassesClause({
                  alias: "this",
                  excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                }),
                elementsHiddenClassesFilter.createWhereClause("this"),
                elementInstanceFilterClauses.where,
              ],
            })}
          `,
          bindings: [...bindings, { type: "idset", value: modelIds }, { type: "id", value: subModeledElementCategory }],
        },
      });
    }
    return definitions;
  }

  private async createElementNodeSelectClause({
    createSelectClause,
    elementsHiddenClassesFilter,
    allSubModels,
  }: {
    createSelectClause: DefineHierarchyLevelProps["createSelectClause"];
    elementsHiddenClassesFilter: HiddenClassesFilter;
    allSubModels?: Id64String[];
  }): Promise<{ selectClause: string; bindings: ECSqlBinding[] }> {
    const selectClause = await createSelectClause({
      ecClassId: { selector: "this.ECClassId" },
      ecInstanceId: { selector: "this.ECInstanceId" },
      nodeLabel: { of: { classAlias: "this", className: this.#hierarchyConfig.elements.baseClass } },
      grouping: { byClass: this.#hierarchyConfig.elements.classGrouping !== "disable" },
      hasChildren: {
        selector: `
          IFNULL(
            (
              SELECT 1
              FROM ${CLASS_NAMES.Element} ce
              ${createWhereClause({
                conditions: [
                  "ce.Parent.Id = this.ECInstanceId",
                  `ce.ECClassId IS (${this.#hierarchyConfig.elements.baseClass})`,
                  createExcludedClassesClause({
                    alias: "ce",
                    excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                  }),
                  elementsHiddenClassesFilter.createWhereClause("ce"),
                ],
              })}
              LIMIT 1
            ),
            ${
              allSubModels !== undefined
                ? allSubModels.length
                  ? `IFNULL(
                      (
                        SELECT 1
                        FROM IdSet(?) subModelIdSet
                        WHERE this.ECInstanceId = subModelIdSet.id
                        LIMIT 1
                      ),
                      0
                    )`
                  : "0"
                : `IFNULL(
                      (
                        SELECT 1
                        FROM ${CLASS_NAMES.GeometricModel3d} m
                        JOIN ${CLASS_NAMES.Element} ce ON ce.Model.Id = m.ECInstanceId
                        ${createWhereClause({
                          conditions: [
                            "m.ECInstanceId = this.ECInstanceId",
                            "NOT m.IsPrivate",
                            "NOT m.IsTemplate",
                            `ce.ECClassId IS (${this.#hierarchyConfig.elements.baseClass})`,
                            createExcludedClassesClause({
                              alias: "ce",
                              excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                            }),
                            elementsHiddenClassesFilter.createWhereClause("ce"),
                          ],
                        })}
                        LIMIT 1
                      ),
                      0
                    )`
            }
          )
        `,
      },
      extendedData: {
        type: "element",
        modelId: { selector: "IdToHex(this.Model.Id)" },
        categoryId: { selector: "IdToHex(this.Category.Id)" },
      },
      supportsFiltering: this.supportsFiltering(),
    });
    return {
      selectClause,
      bindings: allSubModels && allSubModels.length > 0 ? [{ type: "idset", value: allSubModels }] : [],
    };
  }

  private async createCategoryNodeSelectClause({
    createSelectClause,
  }: {
    createSelectClause: DefineHierarchyLevelProps["createSelectClause"];
  }): Promise<string> {
    return createSelectClause({
      ecClassId: { selector: "this.ECClassId" },
      ecInstanceId: { selector: "this.ECInstanceId" },
      nodeLabel: { of: { classAlias: "this", className: CLASS_NAMES.SpatialCategory } },
      ...(this.#hierarchyConfig.categories.labelMerging === "enable"
        ? { grouping: { byLabel: { action: "merge", groupId: "category" } } }
        : {}),
      hasChildren: true,
      extendedData: { type: "category" },
      supportsFiltering: this.supportsFiltering(),
    });
  }

  private async createSpatialCategoryChildrenQuery({
    categoryIds,
    modelIds,
    parentElementIds: parentIds,
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: ModelsTreeChildrenQueryProps & {
    categoryIds: Id64String[];
    modelIds: Id64String[];
    /** IDs of parent elements, if the categories group child elements of elements. */
    parentElementIds?: Id64String[];
  }): Promise<HierarchyLevelDefinition> {
    const [instanceFilterClauses, allSubModels, elementsHiddenClassesFilter] = await Promise.all([
      createFilterClauses({
        filter: instanceFilter,
        contentClass: { fullName: this.#hierarchyConfig.elements.baseClass, alias: "this" },
      }),
      this.#idsProvider.subModeledElements.state === "loaded"
        ? toPromise(
            this.#idsProvider.subModeledElements.getAllSubModeledElements({ excludeIfOnlyExcludedClasses: true }),
          )
        : undefined,
      ECSql.createHiddenClassesFilter({
        schemaProvider: this.#schemaProvider,
        baseClassName: this.#hierarchyConfig.elements.baseClass,
      }),
    ]);
    const { selectClause, bindings } = await this.createElementNodeSelectClause({
      createSelectClause,
      elementsHiddenClassesFilter,
      allSubModels: allSubModels ? [...allSubModels] : undefined,
    });
    return [
      {
        fullClassName: this.#hierarchyConfig.elements.baseClass,
        query: {
          ecsql: `
            SELECT
              ${selectClause}
            ${
              // CROSS JOIN pins the join order so that SQLite always drives the query from the most selective
              // id set, instead of picking a full table scan based on iModel statistics
              parentIds
                ? `
                  FROM IdSet(?) parentIdSet
                  CROSS JOIN ${instanceFilterClauses.from} this ON this.Parent.Id = parentIdSet.id
                  CROSS JOIN IdSet(?) categoryIdSet ON this.Category.Id = categoryIdSet.id
                `
                : `
                  FROM IdSet(?) categoryIdSet
                  CROSS JOIN ${instanceFilterClauses.from} this ON this.Category.Id = categoryIdSet.id
                  `
            }
            CROSS JOIN IdSet(?) modelIdSet ON this.Model.Id = modelIdSet.id
            ${instanceFilterClauses.joins}
            ${createWhereClause({
              conditions: [
                !parentIds && "this.Parent.Id IS NULL",
                createExcludedClassesClause({
                  alias: "this",
                  excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                }),
                elementsHiddenClassesFilter.createWhereClause("this"),
                instanceFilterClauses.where,
              ],
            })}
          `,
          bindings: [
            ...bindings,
            ...(parentIds ? [{ type: "idset" as const, value: parentIds }] : []),
            { type: "idset", value: categoryIds },
            { type: "idset", value: modelIds },
          ],
        },
      },
    ];
  }

  private async createGeometricElement3dChildrenQuery({
    elementIds,
    categoryId: parentCategoryId,
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: ModelsTreeChildrenQueryProps & {
    elementIds: Id64String[];
    categoryId: Id64String;
  }): Promise<HierarchyLevelDefinition> {
    const [elementInstanceFilterClauses, categoryInstanceFilterClauses, allSubModels, elementsHiddenClassesFilter] =
      await Promise.all([
        createFilterClauses({
          filter: instanceFilter,
          contentClass: { fullName: this.#hierarchyConfig.elements.baseClass, alias: "this" },
        }),
        createFilterClauses({
          filter: instanceFilter,
          contentClass: { fullName: CLASS_NAMES.SpatialCategory, alias: "this" },
        }),
        this.#idsProvider.subModeledElements.state === "loaded"
          ? toPromise(
              this.#idsProvider.subModeledElements.getAllSubModeledElements({ excludeIfOnlyExcludedClasses: true }),
            )
          : undefined,
        ECSql.createHiddenClassesFilter({
          schemaProvider: this.#schemaProvider,
          baseClassName: this.#hierarchyConfig.elements.baseClass,
        }),
      ]);

    const { selectClause, bindings } = await this.createElementNodeSelectClause({
      createSelectClause,
      elementsHiddenClassesFilter,
      allSubModels: allSubModels ? [...allSubModels] : undefined,
    });
    return [
      {
        fullClassName: this.#hierarchyConfig.elements.baseClass,
        query: {
          ecsql: `
          SELECT
            ${selectClause}
          FROM ${elementInstanceFilterClauses.from} this
          JOIN IdSet(?) elementIdSet ON this.Parent.Id = elementIdSet.id
          ${elementInstanceFilterClauses.joins}
          ${createWhereClause({
            conditions: [
              `this.Category.Id = ?`,
              createExcludedClassesClause({
                alias: "this",
                excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
              }),
              elementsHiddenClassesFilter.createWhereClause("this"),
              elementInstanceFilterClauses.where,
            ],
          })}
        `,
          bindings: [...bindings, { type: "idset", value: elementIds }, { type: "id", value: parentCategoryId }],
        },
      },
      {
        fullClassName: CLASS_NAMES.SpatialCategory,
        query: {
          // Parent-specific ids (`modelIds`, `parentElementIds`) are set in `preProcessNode` rather than inlined into
          // the query, so that the query text stays the same for every parent element and prepared statements get reused.
          ecsql: `
          SELECT
            ${await this.createCategoryNodeSelectClause({ createSelectClause })}
          FROM ${categoryInstanceFilterClauses.from} this
          ${categoryInstanceFilterClauses.joins ? `${categoryInstanceFilterClauses.joins}` : ""}
          ${createWhereClause({
            conditions: [
              `this.ECInstanceId <> ?`,
              `this.ECInstanceId IN (
                SELECT DISTINCT ce.Category.Id
                FROM ${this.#hierarchyConfig.elements.baseClass} ce
                JOIN IdSet(?) parentIdSet ON ce.Parent.Id = parentIdSet.id
                ${createWhereClause({
                  conditions: [
                    createExcludedClassesClause({
                      alias: "ce",
                      excludedClassNames: this.#hierarchyConfig.elements.excludedClasses,
                    }),
                    elementsHiddenClassesFilter.createWhereClause("ce"),
                  ],
                })}
              )`,
              categoryInstanceFilterClauses.where,
            ],
          })}
        `,
          bindings: [
            { type: "id", value: parentCategoryId },
            { type: "idset", value: elementIds },
          ],
        },
      },
    ];
  }

  /**
   * Yields hierarchy paths to instances or grouping nodes matching the supplied search.
   * @throws An error if the configured search limit is exceeded.
   */
  public static createInstanceKeyPaths(
    props: ModelsTreeInstanceKeyPathsProps,
  ): AsyncIterableIterator<{ path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }> {
    return eachValueFrom<{ path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }>(
      defer(() => {
        const componentInfo = { uniqueId: props.uniqueId ?? Guid.createValue(), componentName: this.#componentName };
        const hierarchyConfig = mergeWithDefaults({
          defaults: defaultHierarchyConfiguration,
          overrides: props.hierarchyConfig,
        });
        if ("label" in props) {
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ imodelAccess: props.imodelAccess });
          return createInstanceKeyPathsFromInstanceLabelObs({
            ...props,
            ...componentInfo,
            labelsFactory,
            hierarchyConfig,
          });
        }
        return createInstanceKeyPathsFromTargetItemsObs({ ...props, ...componentInfo, hierarchyConfig });
      }).pipe(props.abortSignal ? takeUntil(fromEvent(props.abortSignal, "abort")) : identity),
    );
  }

  /**
   * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
   * @throws An error if the configured search limit is exceeded.
   */
  public static async createSearchTree(
    props: ModelsTreeInstanceKeyPathsProps & { revealTargets?: boolean },
  ): Promise<ModelsTreeSearchTree[]> {
    const builder = HierarchySearchTree.createBuilder();
    await firstValueFrom(
      defer(() => {
        const componentInfo = { uniqueId: props.uniqueId ?? Guid.createValue(), componentName: this.#componentName };
        const hierarchyConfig = mergeWithDefaults({
          defaults: defaultHierarchyConfiguration,
          overrides: props.hierarchyConfig,
        });
        if ("label" in props) {
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ imodelAccess: props.imodelAccess });
          return createInstanceKeyPathsFromInstanceLabelObs({
            ...props,
            ...componentInfo,
            labelsFactory,
            hierarchyConfig,
          });
        }
        return createInstanceKeyPathsFromTargetItemsObs({ ...props, ...componentInfo, hierarchyConfig });
      }).pipe(
        props.abortSignal ? takeUntil(fromEvent(props.abortSignal, "abort")) : identity,
        releaseMainThreadOnItemsCount(1000),
        reduce((acc, { path, target }) => {
          acc.accept({
            path: {
              path,
              options: props.revealTargets
                ? {
                    reveal:
                      typeof target === "string"
                        ? true
                        : { groupingLevel: HierarchyNode.getGroupingNodeLevel(target.groupingNode) },
                  }
                : undefined,
            },
          });
          return acc;
        }, builder),
      ),
      { defaultValue: builder },
    );
    // the builder only receives `ModelsTreeSearchPath` entries, so the tree identifiers are guaranteed to be of those classes
    return builder.getTree() as ModelsTreeSearchTree[];
  }

  private supportsFiltering() {
    return this.#hierarchyConfig.hierarchyLevelFiltering === "enable";
  }

  private async isSupported() {
    return this.#schemaProvider.classDerivesFrom(
      this.#hierarchyConfig.elements.baseClass,
      CLASS_NAMES.GeometricElement3d,
    );
  }
}

const SUBJECT_TYPE_AS_NUMBER = 1;
const SUBJECT_CLASS_NAME_QUERY_ALIAS = "s";
const MODEL_TYPE_AS_NUMBER = 2;
const MODEL_CLASS_NAME_QUERY_ALIAS = "m";
const CATEGORY_TYPE_AS_NUMBER = 3;
const CATEGORY_CLASS_NAME_QUERY_ALIAS = "c";
const ELEMENT_TYPE_AS_NUMBER = 0;
const ELEMENT_CLASS_NAME_QUERY_ALIAS = "e";

/** @internal */
export function createGeometricElementInstanceKeyPaths(props: {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  idsProvider: ModelsTreeIdsProvider;
  elementClassName: EC.FullClassNameDotNotation;
  targetItems: Array<Id64String | ElementsGroupInfo>;
  uniqueId: GuidString;
  componentName: string;
  chunkIndex: number;
  excludedElementClassNames?: Array<EC.FullClassNameDotNotation>;
}): Observable<{ path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }> {
  const {
    targetItems,
    chunkIndex,
    uniqueId,
    componentName,
    elementClassName,
    idsProvider,
    imodelAccess,
    excludedElementClassNames,
  } = props;
  const elementIds = targetItems.filter((info): info is Id64String => typeof info === "string");
  const groupInfos = targetItems.filter((info): info is ElementsGroupInfo => typeof info !== "string");
  const separator = ";";
  const bindings = new Array<ECSqlBinding>();
  if (elementIds.length > 0) {
    bindings.push({ type: "idset", value: elementIds });
  }
  groupInfos.forEach(({ parent }) => {
    bindings.push({ type: "idset", value: parent.ids });
    if (parent.type !== "element") {
      bindings.push({ type: "idset", value: parent.modelIds });
    }
  });
  return from(ECSql.createHiddenClassesFilter({ schemaProvider: imodelAccess, baseClassName: elementClassName })).pipe(
    mergeMap((elementsHiddenClassesFilter) => {
      const targetElementsInfoQuery =
        elementIds.length > 0
          ? `
            SELECT e.ECInstanceId, e.ECClassId, e.Parent.Id, e.Model.Id, e.Category.Id, -1
            FROM ${elementClassName} e
            JOIN IdSet(?) elementIdSet ON e.ECInstanceId = elementIdSet.id
            ${createWhereClause({
              conditions: [
                createExcludedClassesClause({ alias: "e", excludedClassNames: excludedElementClassNames }),
                elementsHiddenClassesFilter.createWhereClause("e"),
              ],
            })}
          `
          : undefined;

      const targetGroupingNodesElementInfoQueries = groupInfos.map(
        ({ parent, groupingNode }, index) => `
          SELECT e.ECInstanceId, e.ECClassId, e.Parent.Id, e.Model.Id, e.Category.Id, ${index}
          FROM ${elementClassName} e
          JOIN IdSet(?) parentIdSet${index} ON ${parent.type === "element" ? `e.Parent.Id = parentIdSet${index}.id` : `e.Category.Id = parentIdSet${index}.id`}
          ${parent.type !== "element" ? `JOIN IdSet(?) modelIdSet${index} ON e.Model.Id = modelIdSet${index}.id` : ""}
          ${createWhereClause({
            conditions: [
              `e.ECClassId IS (${groupingNode.key.className})`,
              parent.type !== "element" && `e.Parent.Id IS NULL`,
              createExcludedClassesClause({ alias: "e", excludedClassNames: excludedElementClassNames }),
              elementsHiddenClassesFilter.createWhereClause("e"),
            ],
          })}
        `,
      );

      const ctes = [
        `InstanceElementsWithClassGroupingNodes(ECInstanceId, ECClassId, ParentId, ModelId, CategoryId, GroupingNodeIndex) AS (
          ${[...(targetElementsInfoQuery ? [targetElementsInfoQuery] : []), ...targetGroupingNodesElementInfoQueries].join(" UNION ALL ")}
        )`,
        `ModelsCategoriesElementsHierarchy(ECInstanceId, ParentId, ModelId, CategoryId, GroupingNodeIndex, Path) AS (
          SELECT
            e.ECInstanceId,
            e.ParentId,
            e.ModelId,
            e.CategoryId,
            e.GroupingNodeIndex,
            '${ELEMENT_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex([e].[ECInstanceId]) AS TEXT)
          FROM InstanceElementsWithClassGroupingNodes e

          UNION ALL

          SELECT
            pe.ECInstanceId,
            pe.Parent.Id,
            pe.Model.Id,
            pe.Category.Id,
            ce.GroupingNodeIndex,
            (
              '${ELEMENT_CLASS_NAME_QUERY_ALIAS}${separator}'
              || CAST(IdToHex([pe].[ECInstanceId]) AS TEXT)
              || IIF(ce.ParentId IS NULL,
                  '${separator}${MODEL_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex([ce].[ModelId]) AS TEXT),
                  ''
                  )
              || IIF(ce.CategoryId <> pe.Category.Id,
                  '${separator}${CATEGORY_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex(ce.CategoryId) AS TEXT),
                  ''
                  )
              || '${separator}'
              || ce.Path
            )
          FROM ModelsCategoriesElementsHierarchy ce
          JOIN ${elementClassName} pe ON (pe.ECInstanceId = ce.ParentId OR (pe.ECInstanceId = ce.ModelId AND ce.ParentId IS NULL))
          ${createWhereClause({
            conditions: [
              createExcludedClassesClause({ alias: "pe", excludedClassNames: props.excludedElementClassNames }),
              elementsHiddenClassesFilter.createWhereClause("pe"),
            ],
          })}
        )`,
      ];
      const ecsql = `
        SELECT
          (
            '${MODEL_CLASS_NAME_QUERY_ALIAS}${separator}'
            || CAST(IdToHex([mce].[ModelId]) AS TEXT)
            || '${separator}${CATEGORY_CLASS_NAME_QUERY_ALIAS}${separator}'
            || CAST(IdToHex([mce].[CategoryId]) AS TEXT)
            || '${separator}'
            || mce.Path
        ),
          mce.GroupingNodeIndex
        FROM ModelsCategoriesElementsHierarchy mce
        WHERE mce.ParentId IS NULL
      `;

      return imodelAccess.createQueryReader(
        { ctes, ecsql, bindings },
        {
          rowFormat: "Indexes",
          limit: "unbounded",
          restartToken: `${componentName}/${uniqueId}/geometric-element-paths/${chunkIndex}`,
        },
      );
    }),
    catchBeSQLiteInterrupts,
    releaseMainThreadOnItemsCount(300),
    map((row) => parseElementsQueryRow({ row, groupInfos, separator })),
    mergeMap(({ elementHierarchyPath, groupingInfo }) =>
      toObservable(idsProvider.createUpToModelInstanceKeyPaths(elementHierarchyPath[0].id)).pipe(
        map((modelPath) => {
          const path = [...modelPath, ...elementHierarchyPath];
          return { path, target: groupingInfo ?? elementHierarchyPath[elementHierarchyPath.length - 1].id };
        }),
      ),
    ),
  );
}

function parseElementsQueryRow({
  row,
  groupInfos,
  separator,
}: {
  row: ECSqlQueryRow;
  groupInfos: ElementsGroupInfo[];
  separator: string;
}) {
  const path = parseQueriedPath({ queriedPathRaw: row[0], separator });
  return { elementHierarchyPath: path, groupingInfo: row[1] === -1 ? undefined : groupInfos[row[1]] };
}

/** @internal */
export function createCategoriesSearchPaths(props: {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  idsProvider: ModelsTreeIdsProvider;
  targetCategoryIds: Id64Array;
  uniqueId: GuidString;
  componentName: string;
  elementClassName: EC.FullClassNameDotNotation;
  excludedElementClassNames?: Array<EC.FullClassNameDotNotation>;
}): Observable<{ path: ModelsTreeSearchPath; target: Id64String }> {
  const separator = ";";
  const {
    targetCategoryIds,
    uniqueId,
    componentName,
    idsProvider,
    imodelAccess,
    elementClassName,
    excludedElementClassNames,
  } = props;
  if (targetCategoryIds.length === 0) {
    return EMPTY;
  }

  return merge(
    fromWithRelease({ source: targetCategoryIds, releaseOnCount: 300 }).pipe(
      mergeMap((categoryId) =>
        toObservable(idsProvider.getSearchPathsUpToRootCategory(categoryId)).pipe(
          map((path) => ({
            path: [...path, { id: categoryId, className: CLASS_NAMES.SpatialCategory }],
            target: categoryId,
          })),
        ),
      ),
    ),
    forkJoin({
      subModelIds: toObservable(props.idsProvider.subModeledElements.getAllSubModeledElements()),
      elementsHiddenClassesFilter: from(
        ECSql.createHiddenClassesFilter({ schemaProvider: imodelAccess, baseClassName: elementClassName }),
      ),
    }).pipe(
      mergeMap(({ subModelIds, elementsHiddenClassesFilter }) => {
        const ctes = [
          `CategoriesParentsHierarchy(ECInstanceId, ParentId, ModelId, CategoryId, Path) AS (
            SELECT
              pe.ECInstanceId,
              pe.Parent.Id,
              pe.Model.Id,
              pe.Category.Id,
              (
                '${ELEMENT_CLASS_NAME_QUERY_ALIAS}${separator}'
                || CAST(IdToHex([pe].[ECInstanceId]) AS TEXT)
                || IIF(e.Parent.Id IS NULL,
                    '${separator}${MODEL_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex([e].[Model].[Id]) AS TEXT),
                    ''
                    )
                || '${separator}${CATEGORY_CLASS_NAME_QUERY_ALIAS}${separator}'
                || CAST(IdToHex([e].[Category].[Id]) AS TEXT)
              )
            FROM ${elementClassName} e
            JOIN IdSet(?) categoryIdSet ON e.Category.Id = categoryIdSet.id
            JOIN ${elementClassName} pe ON (pe.ECInstanceId = e.Parent.Id OR (pe.ECInstanceId = e.Model.Id AND e.Parent.Id IS NULL))
            ${createWhereClause({
              conditions: [
                "pe.Category.Id <> e.Category.Id",
                createExcludedClassesClause({ alias: "e", excludedClassNames: excludedElementClassNames }),
                createExcludedClassesClause({ alias: "pe", excludedClassNames: excludedElementClassNames }),
                elementsHiddenClassesFilter.createWhereClause("e"),
                elementsHiddenClassesFilter.createWhereClause("pe"),
              ],
            })}

            UNION ALL

            SELECT
              pe.ECInstanceId,
              pe.Parent.Id,
              pe.Model.Id,
              pe.Category.Id,
              (
                '${ELEMENT_CLASS_NAME_QUERY_ALIAS}${separator}'
                || CAST(IdToHex([pe].[ECInstanceId]) AS TEXT)
                || IIF(ce.ParentId IS NULL,
                    '${separator}${MODEL_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex([ce].[ModelId]) AS TEXT),
                    ''
                    )
                || IIF(ce.CategoryId <> pe.Category.Id,
                    '${separator}${CATEGORY_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex(ce.CategoryId) AS TEXT),
                    ''
                    )
                || '${separator}'
                || ce.Path
              )
            FROM CategoriesParentsHierarchy ce
            JOIN ${elementClassName} pe ON (pe.ECInstanceId = ce.ParentId OR (pe.ECInstanceId = ce.ModelId AND ce.ParentId IS NULL))
            ${createWhereClause({
              conditions: [
                createExcludedClassesClause({ alias: "pe", excludedClassNames: excludedElementClassNames }),
                elementsHiddenClassesFilter.createWhereClause("pe"),
              ],
            })}
          )`,
        ];
        const ecsql = `
          SELECT
            (
              '${MODEL_CLASS_NAME_QUERY_ALIAS}${separator}'
              || CAST(IdToHex([mce].[ModelId]) AS TEXT)
              || '${separator}${CATEGORY_CLASS_NAME_QUERY_ALIAS}${separator}'
              || CAST(IdToHex([mce].[CategoryId]) AS TEXT)
              || '${separator}'
              || mce.Path
            )
          FROM CategoriesParentsHierarchy mce
          ${createWhereClause({
            conditions: [
              "mce.ParentId IS NULL",
              subModelIds.size > 0 &&
                `NOT EXISTS (
                  SELECT 1
                  FROM IdSet(?) subModelIdSet
                  WHERE mce.ModelId = subModelIdSet.id
                  LIMIT 1
                )`,
            ],
          })}
        `;

        return imodelAccess.createQueryReader(
          {
            ctes,
            ecsql,
            bindings: [
              { type: "idset", value: targetCategoryIds },
              ...(subModelIds.size > 0 ? [{ type: "idset" as const, value: subModelIds }] : []),
            ],
          },
          { rowFormat: "Indexes", limit: "unbounded", restartToken: `${componentName}/${uniqueId}/categories-paths` },
        );
      }),
      catchBeSQLiteInterrupts,
      targetCategoryIds.length > 300 ? releaseMainThreadOnItemsCount(300) : identity,
      map((row) => parseQueriedPath({ queriedPathRaw: row[0], separator })),
      mergeMap((categoryHierarchyPath) =>
        toObservable(idsProvider.createUpToModelInstanceKeyPaths(categoryHierarchyPath[0].id)).pipe(
          map((pathUpToCategory) => {
            const path = [...pathUpToCategory, ...categoryHierarchyPath];
            return { path, target: categoryHierarchyPath[categoryHierarchyPath.length - 1].id };
          }),
        ),
      ),
    ),
  );
}

function parseQueriedPath({
  queriedPathRaw,
  separator,
}: {
  queriedPathRaw: string;
  separator: string;
}): ModelsTreeSearchPath {
  const path: ModelsTreeSearchPathKey[] = [];
  const queriedPath: string[] = queriedPathRaw.split(separator);
  for (let i = 0; i < queriedPath.length; i += 2) {
    switch (queriedPath[i]) {
      case ELEMENT_CLASS_NAME_QUERY_ALIAS:
        path.push({ className: CLASS_NAMES.GeometricElement3d, id: queriedPath[i + 1] });
        break;
      case CATEGORY_CLASS_NAME_QUERY_ALIAS:
        path.push({ className: CLASS_NAMES.SpatialCategory, id: queriedPath[i + 1] });
        break;
      case MODEL_CLASS_NAME_QUERY_ALIAS:
        path.push({ className: CLASS_NAMES.GeometricModel3d, id: queriedPath[i + 1] });
        break;
    }
  }
  return path;
}

function createInstanceKeyPathsFromTargetItemsObs(
  props: Omit<ModelsTreeInstanceKeyPathsFromTargetItemsProps, "abortSignal" | "uniqueId" | "hierarchyConfig"> & {
    uniqueId: GuidString;
    componentName: string;
    hierarchyConfig: RequiredModelsTreeHierarchyConfiguration;
  },
) {
  const { targetItems, imodelAccess, limit } = props;
  if (limit !== "unbounded" && targetItems.length > (limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT)) {
    throw new SearchLimitExceededError(limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT);
  }
  return fromWithRelease({ source: targetItems, releaseOnCount: 2000 }).pipe(
    mergeMap(async (key): Promise<{ key: Id64String; type: number } | { key: ElementsGroupInfo; type: 0 }> => {
      if ("parent" in key) {
        return { key, type: ELEMENT_TYPE_AS_NUMBER };
      }

      if (await imodelAccess.classDerivesFrom(key.className, CLASS_NAMES.Subject)) {
        return { key: key.id, type: SUBJECT_TYPE_AS_NUMBER };
      }

      if (await imodelAccess.classDerivesFrom(key.className, CLASS_NAMES.Model)) {
        return { key: key.id, type: MODEL_TYPE_AS_NUMBER };
      }

      if (await imodelAccess.classDerivesFrom(key.className, CLASS_NAMES.SpatialCategory)) {
        return { key: key.id, type: CATEGORY_TYPE_AS_NUMBER };
      }

      return { key: key.id, type: ELEMENT_TYPE_AS_NUMBER };
    }, 2),
    createSearchPathsForDifferentTypes(props),
  );
}

function createSearchPathsForDifferentTypes(
  props: Omit<ModelsTreeInstanceKeyPathsBaseProps, "uniqueId" | "hierarchyConfig"> & {
    uniqueId: GuidString;
    componentName: string;
    hierarchyConfig: RequiredModelsTreeHierarchyConfiguration;
  },
): OperatorFunction<
  { key: Id64String; type: number } | { key: ElementsGroupInfo; type: typeof ELEMENT_TYPE_AS_NUMBER },
  { path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }
> {
  return (obs) => {
    const paths = obs.pipe(
      reduce(
        (acc, value) => {
          if (value.type === SUBJECT_TYPE_AS_NUMBER) {
            acc.subjectIds.push(value.key);
            return acc;
          }
          if (value.type === MODEL_TYPE_AS_NUMBER) {
            acc.modelIds.push(value.key);
            return acc;
          }
          if (value.type === CATEGORY_TYPE_AS_NUMBER) {
            acc.categoryIds.push(value.key);
            return acc;
          }
          acc.elementIds.push(value.key);
          return acc;
        },
        {
          modelIds: new Array<Id64String>(),
          categoryIds: new Array<Id64String>(),
          subjectIds: new Array<Id64String>(),
          elementIds: new Array<Id64String | ElementsGroupInfo>(),
        },
      ),
      switchMap((ids) => {
        const { idsProvider, imodelAccess, uniqueId, componentName, limit } = props;
        const elementsLength = ids.elementIds.length;
        const totalSize = ids.subjectIds.length + ids.modelIds.length + ids.categoryIds.length + elementsLength;
        if (limit !== "unbounded" && totalSize > (limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT)) {
          throw new SearchLimitExceededError(limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT);
        }

        return merge(
          from(ids.subjectIds).pipe(
            mergeMap((id) =>
              toObservable(idsProvider.createSubjectInstanceKeysPath(id)).pipe(
                filter((path) => path.length > 0),
                map((path) => ({ path, target: id })),
              ),
            ),
          ),
          from(ids.modelIds).pipe(
            mergeMap((id) =>
              toObservable(idsProvider.createUpToModelInstanceKeyPaths(id)).pipe(
                map((path) => ({ path: [...path, { className: CLASS_NAMES.GeometricModel3d, id }], target: id })),
              ),
            ),
          ),
          createCategoriesSearchPaths({
            targetCategoryIds: ids.categoryIds,
            idsProvider,
            imodelAccess,
            elementClassName: props.hierarchyConfig.elements.baseClass,
            uniqueId,
            componentName,
            excludedElementClassNames: props.hierarchyConfig.elements.excludedClasses,
          }),
          from(ids.elementIds).pipe(
            bufferCount(getOptimalBatchSize({ totalSize: elementsLength, maximumBatchSize: 5000 })),
            releaseMainThreadOnItemsCount(1),
            mergeMap(
              (block, chunkIndex) =>
                createGeometricElementInstanceKeyPaths({
                  imodelAccess,
                  idsProvider,
                  elementClassName: props.hierarchyConfig.elements.baseClass,
                  targetItems: block,
                  uniqueId,
                  componentName,
                  chunkIndex,
                  excludedElementClassNames: props.hierarchyConfig.elements.excludedClasses,
                }),
              2,
            ),
          ),
        );
      }),
    );
    if (!props.includeOnlyVisibleNodeInstanceKeys) {
      return paths;
    }
    return defer(() => toObservable(props.idsProvider.getHiddenModelIds())).pipe(
      switchMap((hiddenModelIds) =>
        paths.pipe(
          map(({ path, target }) => {
            const targetEntry = path[path.length - 1];
            const visiblePath = path.filter((key, index) => {
              if (key.className !== CLASS_NAMES.GeometricModel3d) {
                return true;
              }
              if (hiddenModelIds.has(key.id)) {
                return false;
              }
              if (path[index - 1]?.className === CLASS_NAMES.GeometricElement3d) {
                // Sub-models follow their modeled element in the path and are always hidden in the hierarchy.
                return false;
              }
              return true;
            });
            return visiblePath[visiblePath.length - 1] === targetEntry ? { path: visiblePath, target } : undefined;
          }),
          filter((result) => result !== undefined),
        ),
      ),
    );
  };
}

function createInstanceKeyPathsFromInstanceLabelObs(
  props: Omit<ModelsTreeInstanceKeyPathsFromInstanceLabelProps, "abortSignal" | "uniqueId" | "hierarchyConfig"> & {
    labelsFactory: IInstanceLabelSelectClauseFactory;
    uniqueId: GuidString;
    componentName: string;
    hierarchyConfig: RequiredModelsTreeHierarchyConfiguration;
  },
): Observable<{ path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }> {
  const { labelsFactory, label, imodelAccess, limit, hierarchyConfig } = props;
  return defer(async () => {
    const [elementLabelSelectClause, modelsHiddenClassesFilter, elementsHiddenClassesFilter] = await Promise.all([
      labelsFactory.createSelectClause({
        classAlias: "e",
        className: CLASS_NAMES.Element,
        selectorsConcatenator: ECSql.createConcatenatedValueStringSelector,
      }),
      ECSql.createHiddenClassesFilter({ schemaProvider: imodelAccess, baseClassName: CLASS_NAMES.GeometricModel3d }),
      ECSql.createHiddenClassesFilter({
        schemaProvider: imodelAccess,
        baseClassName: hierarchyConfig.elements.baseClass,
      }),
    ]);
    const ecsql = `
        SELECT *
        FROM (
          SELECT
            IIF(e.ECClassId IS (${CLASS_NAMES.Subject}), '${SUBJECT_CLASS_NAME_QUERY_ALIAS}', IIF(e.ECClassId IS (${CLASS_NAMES.SpatialCategory}), '${CATEGORY_CLASS_NAME_QUERY_ALIAS}', '${ELEMENT_CLASS_NAME_QUERY_ALIAS}')),
            e.ECInstanceId,
            ${elementLabelSelectClause} Label
          FROM ${CLASS_NAMES.Element} e
          ${createWhereClause({
            conditions: [
              `(
                e.ECClassId IS (${CLASS_NAMES.Subject}, ${CLASS_NAMES.SpatialCategory})
                OR e.ECClassId IS (${hierarchyConfig.elements.baseClass}) AND EXISTS (
                  SELECT 1
                  FROM ${CLASS_NAMES.GeometricModel3d} m
                  ${createWhereClause({
                    conditions: [
                      "m.ECInstanceId = e.Model.Id",
                      "NOT m.IsPrivate",
                      "NOT m.IsTemplate",
                      modelsHiddenClassesFilter.createWhereClause("m"),
                    ],
                  })}
                )
              )`,
              createExcludedClassesClause({ alias: "e", excludedClassNames: hierarchyConfig.elements.excludedClasses }),
              // only restricts instances of `baseClass` sub-classes - subjects and categories are sealed
              elementsHiddenClassesFilter.createWhereClause("e"),
            ],
          })}

          UNION ALL

          SELECT
           '${MODEL_CLASS_NAME_QUERY_ALIAS}',
            m.ECInstanceId,
            ${elementLabelSelectClause} Label
          FROM ${CLASS_NAMES.GeometricModel3d} m
          JOIN ${CLASS_NAMES.Element} e ON e.ECInstanceId = m.ModeledElement.Id
          ${createWhereClause({
            conditions: [
              "NOT m.IsPrivate",
              "NOT m.IsTemplate",
              modelsHiddenClassesFilter.createWhereClause("m"),
              hierarchyConfig.models.withoutElements === "exclude" &&
                `EXISTS (
                  SELECT 1
                  FROM ${CLASS_NAMES.Element} me
                  ${createWhereClause({
                    conditions: [
                      "me.Model.Id = m.ECInstanceId",
                      `me.ECClassId IS (${hierarchyConfig.elements.baseClass})`,
                      elementsHiddenClassesFilter.createWhereClause("me"),
                    ],
                  })}
                )`,
              "json_extract(e.JsonProperties, '$.PhysicalPartition.Model.Content') IS NULL",
              "json_extract(e.JsonProperties, '$.GraphicalPartition3d.Model.Content') IS NULL",
            ],
          })}
        )
        WHERE Label LIKE '%' || ? || '%' ESCAPE '\\'
        ${limit === "unbounded" ? "" : `LIMIT ${(limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT) + 1}`}
      `;
    const bindings: ECSqlBinding[] = [{ type: "string", value: label.replace(/[%_\\]/g, "\\$&") }];
    return { ecsql, bindings };
  }).pipe(
    mergeMap((queryProps) => {
      return imodelAccess.createQueryReader(queryProps, {
        rowFormat: "Indexes",
        restartToken: `${props.componentName}/${props.uniqueId}/filter-by-label`,
        limit: "unbounded",
      });
    }),
    catchBeSQLiteInterrupts,
    map((row) => {
      const key = row[1];
      switch (row[0]) {
        case SUBJECT_CLASS_NAME_QUERY_ALIAS:
          return { key, type: SUBJECT_TYPE_AS_NUMBER };
        case MODEL_CLASS_NAME_QUERY_ALIAS:
          return { key, type: MODEL_TYPE_AS_NUMBER };
        case CATEGORY_CLASS_NAME_QUERY_ALIAS:
          return { key, type: CATEGORY_TYPE_AS_NUMBER };
        default:
          return { key, type: ELEMENT_TYPE_AS_NUMBER };
      }
    }),
    createSearchPathsForDifferentTypes(props),
  );
}
