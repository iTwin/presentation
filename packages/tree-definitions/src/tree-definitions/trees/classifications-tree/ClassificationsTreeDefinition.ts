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
  of,
  reduce,
  switchMap,
  takeUntil,
  toArray,
} from "rxjs";
import { assert, Guid } from "@itwin/core-bentley";
import { createPredicateBasedHierarchyDefinition, HierarchySearchTree } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, eachValueFrom, ECSql } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { createBaseIdsProvider } from "../../shared/idsProviders/BaseIdsProvider.js";
import { fromWithRelease, releaseMainThreadOnItemsCount } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts, SearchLimitExceededError } from "../../shared/TreeErrors.js";
import {
  createExcludedClassesClause,
  createWhereClause,
  getOptimalBatchSize,
  ParentElementsPath,
} from "../../shared/Utils.js";
import { createClassificationsTreeIdsProvider } from "./ClassificationsTreeIdsProvider.js";
import { ClassificationsTreeNodeInternal } from "./ClassificationsTreeNodeInternal.js";

import type { Observable, ObservedValueOf, OperatorFunction } from "rxjs";
import type { GuidString, Id64Array, Id64String } from "@itwin/core-bentley";
import type {
  DefineHierarchyLevelProps,
  DefineInstanceNodeChildHierarchyLevelProps,
  DefineRootHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyLevelDefinition,
  HierarchyNodeIdentifiersPath,
  HierarchyNodesDefinition,
  InstancesNodeKey,
  LimitingECSqlQueryExecutor,
  NodePostProcessor,
} from "@itwin/presentation-hierarchies";
import type {
  EC,
  ECSchemaProvider,
  ECSqlQueryRow,
  IInstanceLabelSelectClauseFactory,
  InstanceKey,
} from "@itwin/presentation-shared";
import type { ClassificationId, ClassificationTableId, ElementId } from "../../shared/Types.js";
import type { ClassificationsTreeIdsProvider } from "./ClassificationsTreeIdsProvider.js";

const MAX_SEARCH_INSTANCE_KEY_COUNT = 100;

/**
 * Data access and classification system configuration for a classifications hierarchy.
 * @beta
 */
interface ClassificationsTreeProps {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };
  hierarchyConfig: ClassificationsTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID. */
  uniqueId?: GuidString;
}

/** @internal */
interface ClassificationsTreeDefinitionProps extends ClassificationsTreeProps {
  getIdsProvider: (imodelKey: string) => ClassificationsTreeIdsProvider;
}

/**
 * Selects the root classification system and excluded element classes for `createClassificationsTree`.
 * @beta
 */
export interface ClassificationsTreeHierarchyConfiguration {
  /**
   * The classifications' hierarchy starts at the root `ClassificationSystem` element. This attribute identifies that
   * root `ClassificationSystem`.
   */
  rootClassificationSystemCode: string;
  /**
   * Element node's configuration options.
   *
   * Defaults to `{ excludedClasses: [] }`.
   */
  elements?: {
    /**
     * Element classes to exclude from the hierarchy.
     *
     * Elements, whose class is or derives from one of the classes in this list, are not loaded into the hierarchy.
     * Children of such nodes are also not shown.
     *
     * Defaults to `[]`.
     */
    excludedClasses?: EC.FullClassNameDotNotation[];
  };
}

/**
 * Limits and cancellation options for classifications hierarchy searches.
 * @beta
 */
interface ClassificationsTreeSearchOptions {
  /** Maximum number of matching instances. Defaults to 100; use `"unbounded"` to disable the limit. */
  limit?: number | "unbounded";
  /** Stops loading further paths when aborted. */
  abortSignal?: AbortSignal;
}

/** @internal */
interface ClassificationsTreeInstanceKeyPathsBaseProps extends ClassificationsTreeSearchOptions {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  idsProvider: ClassificationsTreeIdsProvider;
  hierarchyConfig: ClassificationsTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID for each search. */
  uniqueId?: GuidString;
}

/**
 * Search targets selected by a substring of their instance label.
 * @internal
 */
interface ClassificationsTreeInstanceKeyPathsFromInstanceLabelProps extends ClassificationsTreeInstanceKeyPathsBaseProps {
  label: string;
}

/**
 * Search targets specified as classification table, classification, or geometric element instance keys.
 * @internal
 */
interface ClassificationsTreeInstanceKeyPathsFromInstanceKeysProps extends ClassificationsTreeInstanceKeyPathsBaseProps {
  targetItems: Array<InstanceKey>;
}

/**
 * Options for locating classifications hierarchy paths by label or instance keys.
 * @internal
 */
type ClassificationsTreeInstanceKeyPathsProps =
  | ClassificationsTreeInstanceKeyPathsFromInstanceLabelProps
  | ClassificationsTreeInstanceKeyPathsFromInstanceKeysProps;

/**
 * Search-specific options for a classifications tree with shared data access and configuration.
 * @beta
 */
type ClassificationsTreeSearchProps = ClassificationsTreeSearchOptions &
  ({ label: string } | { targetItems: Array<InstanceKey> });

/**
 * Creates a classifications hierarchy definition and search helpers that share data access, hierarchy configuration, and a unique ID.
 * Pass the returned `definition` to `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @beta
 */
export function createClassificationsTree(props: ClassificationsTreeProps) {
  const idsProvider = createClassificationsTreeIdsProvider({
    queryExecutor: props.imodelAccess,
    hierarchyConfig: props.hierarchyConfig,
    baseIdsProvider: createBaseIdsProvider({
      queryExecutor: props.imodelAccess,
      elementClassName: CLASS_NAMES.GeometricElement3d,
      excludedElementClassNames: props.hierarchyConfig.elements?.excludedClasses,
    }),
  });
  const sharedProps = {
    imodelAccess: props.imodelAccess,
    hierarchyConfig: props.hierarchyConfig,
    idsProvider,
    uniqueId: props.uniqueId ?? Guid.createValue(),
  };
  const definition: HierarchyDefinition = new ClassificationsTreeDefinition({
    ...sharedProps,
    getIdsProvider: () => idsProvider,
  });
  return {
    definition,
    /**
     * Yields hierarchy paths to instances matching the supplied label or instance keys.
     * @throws An error if the configured search limit is exceeded.
     */
    createInstanceKeyPaths: (searchProps: ClassificationsTreeSearchProps) =>
      ClassificationsTreeDefinition.createInstanceKeyPaths({ ...searchProps, ...sharedProps }),
    /**
     * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
     * @throws An error if the configured search limit is exceeded.
     */
    createSearchTree: async (searchProps: ClassificationsTreeSearchProps & { revealTargets?: boolean }) =>
      ClassificationsTreeDefinition.createSearchTree({ ...searchProps, ...sharedProps }),
  };
}

/**
 * Defines a hierarchy of classification tables, classifications, and related geometric elements.
 * Use with `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @internal
 */
export class ClassificationsTreeDefinition implements HierarchyDefinition {
  #impl: HierarchyDefinition;
  #props: ClassificationsTreeDefinitionProps;
  static #componentName = "ClassificationsTreeDefinition";

  public constructor(props: ClassificationsTreeDefinitionProps) {
    this.#props = props;
    this.#impl = createPredicateBasedHierarchyDefinition({
      imodelAccess: props.imodelAccess,
      hierarchy: {
        rootNodes: async (requestProps: DefineRootHierarchyLevelProps) =>
          this.#createClassificationTablesQuery(requestProps),
        childNodes: [
          {
            parentInstancesNodePredicate: CLASS_NAMES.ClassificationTable,
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) =>
              this.#createClassificationTableChildrenQuery(requestProps),
          },
          {
            parentInstancesNodePredicate: CLASS_NAMES.Classification,
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) =>
              this.#createClassificationChildrenQuery(requestProps),
          },
          {
            parentInstancesNodePredicate: CLASS_NAMES.GeometricElement,
            definitions: async (requestProps: DefineInstanceNodeChildHierarchyLevelProps) =>
              this.#createGeometricElementChildrenQuery(requestProps),
          },
        ],
      },
    });
  }

  public postProcessNode: NodePostProcessor = async ({ node, parentNode }) => {
    if (!ClassificationsTreeNodeInternal.isGeometricElementNode(node)) {
      return node;
    }
    assert(parentNode !== undefined);

    if (ClassificationsTreeNodeInternal.isClassificationNode(parentNode)) {
      node.extendedData = { ...node.extendedData, parentElementsPath: [] };
      return node;
    }
    assert(ClassificationsTreeNodeInternal.isGeometricElementNode(parentNode));
    node.extendedData = {
      ...node.extendedData,
      parentElementsPath: ParentElementsPath.appendToPath({
        path: parentNode.extendedData.parentElementsPath,
        ids: parentNode.key.instanceKeys.map(({ id }) => id),
        categoryId: parentNode.extendedData.categoryId,
      }),
    };
    return node;
  };

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps) {
    return this.#impl.defineHierarchyLevel(props);
  }

  async #createClassificationTablesQuery({
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: DefineRootHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const instanceFilterClauses = await createFilterClauses({
      filter: instanceFilter,
      contentClass: { fullName: CLASS_NAMES.ClassificationTable, alias: "this" },
    });
    return [
      {
        fullClassName: CLASS_NAMES.ClassificationTable,
        query: {
          ecsql: `
            SELECT
              ${await createSelectClause({
                ecClassId: { selector: ECSql.createRawPropertyValueSelector("this", "ECClassId") },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { of: { classAlias: "this", className: CLASS_NAMES.ClassificationTable } },
                hasChildren: {
                  selector: `
                    IFNULL((
                      SELECT 1
                      FROM ${CLASS_NAMES.Classification} classification
                      WHERE classification.Model.Id = this.ECInstanceId
                      LIMIT 1
                    ), 0)
                  `,
                },
                extendedData: { type: "classification-table" },
                supportsFiltering: true,
              })}
            FROM
              ${instanceFilterClauses.from} this
            JOIN ${CLASS_NAMES.ClassificationSystem} system ON system.ECInstanceId = this.Parent.Id
            ${instanceFilterClauses.joins}
            ${createWhereClause({ conditions: ["system.CodeValue = ?", "NOT this.IsPrivate", instanceFilterClauses.where] })}
          `,
          bindings: [{ type: "string", value: this.#props.hierarchyConfig.rootClassificationSystemCode }],
        },
      },
    ];
  }

  async #createClassificationTableChildrenQuery({
    parentNodeInstanceIds: classificationTableIds,
    instanceFilter,
    parentNode,
    createSelectClause,
    createFilterClauses,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const imodelKey = getParentNodeIModelKey(parentNode.key);
    if (!imodelKey) {
      return [];
    }
    const idsProvider = this.#props.getIdsProvider(imodelKey);
    const childClassificationsDefinition = idsProvider.isDataLoaded
      ? await this.#createCachedChildClassificationsQuery({
          parentIds: classificationTableIds,
          idsProvider,
          instanceFilter,
          createSelectClause,
          createFilterClauses,
        })
      : await this.#createUncachedChildClassificationsQuery({
          parentIds: classificationTableIds,
          parentType: "classification-table",
          instanceFilter,
          createSelectClause,
          createFilterClauses,
        });
    return childClassificationsDefinition ? [childClassificationsDefinition] : [];
  }

  async #createClassificationChildrenQuery({
    parentNodeInstanceIds: parentClassificationIds,
    instanceFilter,
    parentNode,
    createSelectClause,
    createFilterClauses,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const parentImodelKey = getParentNodeIModelKey(parentNode.key);
    if (!parentImodelKey) {
      return [];
    }
    const idsProvider = this.#props.getIdsProvider(parentImodelKey);
    const [elementsInstanceFilterClauses, childClassificationsDefinition] = await Promise.all([
      createFilterClauses({
        filter: instanceFilter,
        contentClass: { fullName: CLASS_NAMES.GeometricElement3d, alias: "this" },
      }),
      idsProvider.isDataLoaded
        ? this.#createCachedChildClassificationsQuery({
            parentIds: parentClassificationIds,
            idsProvider,
            instanceFilter,
            createSelectClause,
            createFilterClauses,
          })
        : this.#createUncachedChildClassificationsQuery({
            parentIds: parentClassificationIds,
            parentType: "classification",
            instanceFilter,
            createSelectClause,
            createFilterClauses,
          }),
    ]);
    return [
      // load classification elements
      {
        fullClassName: CLASS_NAMES.GeometricElement3d,
        query: {
          ecsql: `
            SELECT ${await this.#createElementSelectClause({ createSelectClause })}
            FROM ${elementsInstanceFilterClauses.from} this
            JOIN ${CLASS_NAMES.ElementHasClassifications} ehc ON ehc.SourceECInstanceId = this.ECInstanceId
            JOIN IdSet(?) parentClassificationIdSet ON ehc.TargetECInstanceId = parentClassificationIdSet.id
            ${elementsInstanceFilterClauses.joins}
            ${createWhereClause({
              conditions: [
                "this.Parent.Id IS NULL",
                createExcludedClassesClause({
                  alias: "this",
                  excludedClassNames: this.#props.hierarchyConfig.elements?.excludedClasses,
                }),
                elementsInstanceFilterClauses.where,
              ],
            })}
          `,
          bindings: [{ type: "idset", value: parentClassificationIds }],
        },
      },
      // load child classifications
      ...(childClassificationsDefinition ? [childClassificationsDefinition] : []),
    ];
  }

  /** Returns `undefined` when cached data indicates that there are no child classifications. */
  async #createCachedChildClassificationsQuery({
    parentIds,
    idsProvider,
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: {
    parentIds: Id64Array;
    idsProvider: ClassificationsTreeIdsProvider;
    instanceFilter: DefineHierarchyLevelProps["instanceFilter"];
    createSelectClause: DefineHierarchyLevelProps["createSelectClause"];
    createFilterClauses: DefineHierarchyLevelProps["createFilterClauses"];
  }): Promise<HierarchyNodesDefinition | undefined> {
    const [instanceFilterClauses, { childClassifications, childClassificationsWithChildren }] = await Promise.all([
      createFilterClauses({
        filter: instanceFilter,
        contentClass: { fullName: CLASS_NAMES.Classification, alias: "this" },
      }),
      getChildClassifications({ classificationOrTableIds: parentIds, idsProvider }),
    ]);
    if (childClassifications.length === 0) {
      return undefined;
    }
    return {
      fullClassName: CLASS_NAMES.Classification,
      query: {
        ecsql: `
          SELECT
            ${await this.#createClassificationNodeSelectClause({
              createSelectClause,
              hasChildren:
                childClassificationsWithChildren.length > 0
                  ? { selector: createClassificationHasChildrenSelector("this") }
                  : false,
            })}
          FROM ${instanceFilterClauses.from} this
          JOIN IdSet(?) classificationIdSet ON this.ECInstanceId = classificationIdSet.id
          ${instanceFilterClauses.joins}
          ${createWhereClause({ conditions: [instanceFilterClauses.where] })}
        `,
        bindings: [
          ...(childClassificationsWithChildren.length > 0
            ? [{ type: "idset" as const, value: childClassificationsWithChildren }]
            : []),
          { type: "idset", value: childClassifications },
        ],
      },
    };
  }

  async #createUncachedChildClassificationsQuery({
    parentIds,
    parentType,
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: {
    parentIds: Id64Array;
    parentType: "classification-table" | "classification";
    instanceFilter: DefineHierarchyLevelProps["instanceFilter"];
    createSelectClause: DefineHierarchyLevelProps["createSelectClause"];
    createFilterClauses: DefineHierarchyLevelProps["createFilterClauses"];
  }): Promise<HierarchyNodesDefinition> {
    const instanceFilterClauses = await createFilterClauses({
      filter: instanceFilter,
      contentClass: { fullName: CLASS_NAMES.Classification, alias: "this" },
    });
    const hasChildClassifications = `
      SELECT 1
      FROM ${CLASS_NAMES.Classification} cc
      ${createWhereClause({ conditions: ["cc.Parent.Id = this.ECInstanceId", "NOT cc.IsPrivate"] })}
      LIMIT 1
    `;
    const hasElements = `
      SELECT 1
      FROM ${CLASS_NAMES.GeometricElement3d} e
      JOIN ${CLASS_NAMES.ElementHasClassifications} ehc ON ehc.SourceECInstanceId = e.ECInstanceId
      ${createWhereClause({
        conditions: [
          "ehc.TargetECInstanceId = this.ECInstanceId",
          "e.Parent.Id IS NULL",
          createExcludedClassesClause({
            alias: "e",
            excludedClassNames: this.#props.hierarchyConfig.elements?.excludedClasses,
          }),
        ],
      })}
      LIMIT 1
    `;
    return {
      fullClassName: CLASS_NAMES.Classification,
      query: {
        ecsql: `
          SELECT
            ${await this.#createClassificationNodeSelectClause({
              createSelectClause,
              hasChildren: { selector: `IFNULL((${hasChildClassifications}), IFNULL((${hasElements}), 0))` },
            })}
          FROM ${instanceFilterClauses.from} this
          JOIN IdSet(?) parentIdSet ON ${parentType === "classification-table" ? "this.Model.Id" : "this.Parent.Id"} = parentIdSet.id
          ${instanceFilterClauses.joins}
          ${createWhereClause({
            conditions: [
              parentType === "classification-table" && "this.Parent.Id IS NULL",
              "NOT this.IsPrivate",
              instanceFilterClauses.where,
            ],
          })}
        `,
        bindings: [{ type: "idset", value: parentIds }],
      },
    };
  }

  async #createClassificationNodeSelectClause({
    createSelectClause,
    hasChildren,
  }: {
    createSelectClause: DefineHierarchyLevelProps["createSelectClause"];
    hasChildren: boolean | { selector: string };
  }): Promise<string> {
    return createSelectClause({
      ecClassId: { selector: ECSql.createRawPropertyValueSelector("this", "ECClassId") },
      ecInstanceId: { selector: "this.ECInstanceId" },
      nodeLabel: { of: { classAlias: "this", className: CLASS_NAMES.Classification } },
      hasChildren,
      extendedData: { type: "classification" },
      supportsFiltering: true,
    });
  }

  async #createGeometricElementChildrenQuery({
    parentNodeInstanceIds: parentElementIds,
    instanceFilter,
    createSelectClause,
    createFilterClauses,
  }: DefineInstanceNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const instanceFilterClauses = await createFilterClauses({
      filter: instanceFilter,
      contentClass: { fullName: CLASS_NAMES.GeometricElement3d, alias: "this" },
    });
    return [
      {
        fullClassName: CLASS_NAMES.GeometricElement3d,
        query: {
          ecsql: `
          SELECT ${await this.#createElementSelectClause({ createSelectClause })}
          FROM ${instanceFilterClauses.from} this
          JOIN IdSet(?) parentElementIdSet ON this.Parent.Id = parentElementIdSet.id
          ${instanceFilterClauses.joins}
          ${createWhereClause({
            conditions: [
              createExcludedClassesClause({
                alias: "this",
                excludedClassNames: this.#props.hierarchyConfig.elements?.excludedClasses,
              }),
              instanceFilterClauses.where,
            ],
          })}
        `,
          bindings: [{ type: "idset", value: parentElementIds }],
        },
      },
    ];
  }

  async #createElementSelectClause({
    createSelectClause,
  }: {
    createSelectClause: DefineHierarchyLevelProps["createSelectClause"];
  }): Promise<string> {
    return createSelectClause({
      ecClassId: { selector: "this.ECClassId" },
      ecInstanceId: { selector: "this.ECInstanceId" },
      nodeLabel: { of: { classAlias: "this", className: CLASS_NAMES.GeometricElement3d } },
      hasChildren: {
        selector: `
          IFNULL((
            SELECT 1
            FROM ${CLASS_NAMES.Element} ce
            ${createWhereClause({
              conditions: [
                "ce.Parent.Id = this.ECInstanceId",
                createExcludedClassesClause({
                  alias: "ce",
                  excludedClassNames: this.#props.hierarchyConfig.elements?.excludedClasses,
                }),
              ],
            })}
            LIMIT 1
          ), 0)
        `,
      },
      extendedData: {
        type: "element",
        modelId: { selector: "IdToHex(this.Model.Id)" },
        categoryId: { selector: "IdToHex(this.Category.Id)" },
      },
      supportsFiltering: true,
    });
  }

  /**
   * Yields hierarchy paths to instances matching the supplied label or instance keys.
   * @throws An error if the configured search limit is exceeded.
   */
  public static createInstanceKeyPaths(props: ClassificationsTreeInstanceKeyPathsProps) {
    return eachValueFrom<{ path: HierarchyNodeIdentifiersPath; target: Id64String }>(
      defer(() => {
        const componentInfo = { uniqueId: props.uniqueId ?? Guid.createValue(), componentName: this.#componentName };
        if ("label" in props) {
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ imodelAccess: props.imodelAccess });
          return createInstanceKeyPathsFromInstanceLabelObs({ ...props, ...componentInfo, labelsFactory });
        }
        return createInstanceKeyPathsFromTargetItemsObs({ ...props, ...componentInfo });
      }).pipe(props.abortSignal ? takeUntil(fromEvent(props.abortSignal, "abort")) : identity),
    );
  }

  /**
   * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
   * @throws An error if the configured search limit is exceeded.
   */
  public static async createSearchTree(props: ClassificationsTreeInstanceKeyPathsProps & { revealTargets?: boolean }) {
    const builder = HierarchySearchTree.createBuilder();
    await firstValueFrom(
      defer(() => {
        const componentInfo = { uniqueId: props.uniqueId ?? Guid.createValue(), componentName: this.#componentName };
        if ("label" in props) {
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ imodelAccess: props.imodelAccess });
          return createInstanceKeyPathsFromInstanceLabelObs({ ...props, ...componentInfo, labelsFactory });
        }
        return createInstanceKeyPathsFromTargetItemsObs({ ...props, ...componentInfo });
      }).pipe(
        props.abortSignal ? takeUntil(fromEvent(props.abortSignal, "abort")) : identity,
        releaseMainThreadOnItemsCount(1000),
        reduce((acc, { path }) => {
          acc.accept({ path: { path, options: props.revealTargets ? { reveal: true } : undefined } });
          return acc;
        }, builder),
      ),
      { defaultValue: builder },
    );
    return builder.getTree();
  }
}

function getParentNodeIModelKey(instanceKey: InstancesNodeKey): string | undefined {
  return instanceKey.instanceKeys[0]?.imodelKey;
}

async function getChildClassifications({
  classificationOrTableIds,
  idsProvider,
}: {
  classificationOrTableIds: Id64Array;
  idsProvider: ClassificationsTreeIdsProvider;
}): Promise<{ childClassifications: Id64Array; childClassificationsWithChildren: Id64Array }> {
  return firstValueFrom(
    from(idsProvider.getDirectChildClassifications(classificationOrTableIds)).pipe(
      mergeMap((classifications) =>
        from(classifications).pipe(
          mergeMap((classificationId) =>
            forkJoin({
              hasChildren: idsProvider.hasChildren(classificationId),
              classificationId: of(classificationId),
            }),
          ),
          mergeMap(({ classificationId, hasChildren }) => (hasChildren ? of(classificationId) : EMPTY)),
          toArray(),
          map((nonEmptyClassifications) => ({
            childClassifications: classifications,
            childClassificationsWithChildren: nonEmptyClassifications,
          })),
        ),
      ),
    ),
  );
}

function createClassificationHasChildrenSelector(classificationAlias: string) {
  return `
    IFNULL(
      (
        SELECT 1
        FROM IdSet(?) hasChildrenIdSet
        WHERE hasChildrenIdSet.id = ${classificationAlias}.ECInstanceId
        LIMIT 1
      ),
      0
    )
  `;
}

const CLASSIFICATION_TABLE_TYPE_AS_NUMBER = 0;
const CLASSIFICATION_TABLE_CLASS_NAME_QUERY_ALIAS = "ct";
const CLASSIFICATION_TYPE_AS_NUMBER = 1;
const CLASSIFICATION_CLASS_NAME_QUERY_ALIAS = "c";
const ELEMENT_TYPE_AS_NUMBER = 2;
const ELEMENT_CLASS_NAME_QUERY_ALIAS = "e";

function createInstanceKeyPathsFromInstanceLabelObs({
  label,
  ...props
}: Omit<ClassificationsTreeInstanceKeyPathsFromInstanceLabelProps, "uniqueId" | "componentName" | "abortSignal"> & {
  labelsFactory: IInstanceLabelSelectClauseFactory;
  componentName: string;
  uniqueId: string;
}) {
  const adjustedLabel = label.replace(/[%_\\]/g, "\\$&");

  const CLASSIFICATION_TABLES_WITH_LABELS_CTE = "ClassificationTablesWithLabels";
  const CLASSIFICATIONS_WITH_LABELS_CTE = "ClassificationsWithLabels";
  const ELEMENTS_WITH_LABELS_CTE = "ElementsWithLabels";
  return defer(async () => {
    const [classificationTableLabelSelectClause, classificationLabelSelectClause, elementLabelSelectClause] =
      await Promise.all(
        [CLASS_NAMES.ClassificationTable, CLASS_NAMES.Classification, CLASS_NAMES.GeometricElement3d].map(
          async (className) =>
            props.labelsFactory.createSelectClause({
              classAlias: "this",
              className,
              selectorsConcatenator: ECSql.createConcatenatedValueStringSelector,
            }),
        ),
      );
    const classificationIds = await props.idsProvider.getAllClassifications();
    const ctes = [
      `
        ${CLASSIFICATION_TABLES_WITH_LABELS_CTE}(ClassName, ECInstanceId, DisplayLabel) AS (
          SELECT
            '${CLASSIFICATION_TABLE_CLASS_NAME_QUERY_ALIAS}',
            this.ECInstanceId,
            ${classificationTableLabelSelectClause}
          FROM ${CLASS_NAMES.ClassificationTable} this
          JOIN ${CLASS_NAMES.ClassificationSystem} system ON system.ECInstanceId = this.Parent.Id
          ${createWhereClause({ conditions: ["system.CodeValue = ?", "NOT this.IsPrivate"] })}
        )
      `,
      ...(classificationIds.length > 0
        ? [
            `${CLASSIFICATIONS_WITH_LABELS_CTE}(ClassName, ECInstanceId, DisplayLabel) AS (
              SELECT
                '${CLASSIFICATION_CLASS_NAME_QUERY_ALIAS}',
                this.ECInstanceId,
                ${classificationLabelSelectClause}
              FROM ${CLASS_NAMES.Classification} this
              JOIN IdSet(?) classificationIdSet ON this.ECInstanceId = classificationIdSet.id
            )`,
            `${ELEMENTS_WITH_LABELS_CTE}(ClassName, ECInstanceId, DisplayLabel) AS (
              SELECT
                '${ELEMENT_CLASS_NAME_QUERY_ALIAS}',
                this.ECInstanceId,
                ${elementLabelSelectClause}
              FROM ${CLASS_NAMES.GeometricElement3d} this
              JOIN ${CLASS_NAMES.ElementHasClassifications} ehc ON ehc.SourceECInstanceId = this.ECInstanceId
              JOIN IdSet(?) classificationIdSet ON ehc.TargetECInstanceId = classificationIdSet.id
              ${createWhereClause({ conditions: ["this.Parent.Id IS NULL", createExcludedClassesClause({ alias: "this", excludedClassNames: props.hierarchyConfig.elements?.excludedClasses })] })}

              UNION ALL

              SELECT
                '${ELEMENT_CLASS_NAME_QUERY_ALIAS}',
                this.ECInstanceId,
                ${elementLabelSelectClause}
              FROM
                ${CLASS_NAMES.GeometricElement3d} this
                JOIN ${ELEMENTS_WITH_LABELS_CTE} pe ON pe.ECInstanceId = this.Parent.Id
              ${createWhereClause({ conditions: [createExcludedClassesClause({ alias: "this", excludedClassNames: props.hierarchyConfig.elements?.excludedClasses })] })}
            )`,
          ]
        : []),
    ];
    const ecsql = `
      SELECT * FROM (
        SELECT
          ct.ClassName AS ClassName,
          ct.ECInstanceId AS ECInstanceId
        FROM
          ${CLASSIFICATION_TABLES_WITH_LABELS_CTE} ct
        WHERE
          ct.DisplayLabel LIKE '%' || ? || '%' ESCAPE '\\'

        ${
          classificationIds.length > 0
            ? `
              UNION ALL

              SELECT
                c.ClassName AS ClassName,
                c.ECInstanceId AS ECInstanceId
              FROM
                ${CLASSIFICATIONS_WITH_LABELS_CTE} c
              WHERE
                c.DisplayLabel LIKE '%' || ? || '%' ESCAPE '\\'

              UNION ALL

              SELECT
                e.ClassName AS ClassName,
                e.ECInstanceId AS ECInstanceId
              FROM
                ${ELEMENTS_WITH_LABELS_CTE} e
              WHERE
                e.DisplayLabel LIKE '%' || ? || '%' ESCAPE '\\'
            `
            : ""
        }
      )
      ${props.limit === "unbounded" ? "" : `LIMIT ${(props.limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT) + 1}`}
    `;
    const bindings = [
      { type: "string" as const, value: props.hierarchyConfig.rootClassificationSystemCode },
      ...(classificationIds.length > 0
        ? [
            { type: "idset" as const, value: classificationIds },
            { type: "idset" as const, value: classificationIds },
          ]
        : []),
      { type: "string" as const, value: adjustedLabel },
      ...(classificationIds.length > 0
        ? [
            { type: "string" as const, value: adjustedLabel },
            { type: "string" as const, value: adjustedLabel },
          ]
        : []),
    ];
    return { ctes, ecsql, bindings };
  }).pipe(
    mergeMap((queryProps) =>
      props.imodelAccess.createQueryReader(queryProps, {
        restartToken: `${props.componentName}/${props.uniqueId}/filter-by-label`,
        limit: "unbounded",
      }),
    ),
    catchBeSQLiteInterrupts,
    map((row): { key: Id64String; type: number } => {
      let type: 0 | 1 | 2;
      switch (row.ClassName) {
        case CLASSIFICATION_TABLE_CLASS_NAME_QUERY_ALIAS:
          type = CLASSIFICATION_TABLE_TYPE_AS_NUMBER;
          break;
        case CLASSIFICATION_CLASS_NAME_QUERY_ALIAS:
          type = CLASSIFICATION_TYPE_AS_NUMBER;
          break;
        default:
          type = ELEMENT_TYPE_AS_NUMBER;
          break;
      }
      return { type, key: row.ECInstanceId };
    }),
    createSearchPathsForDifferentTypes(props),
  );
}
function createInstanceKeyPathsFromTargetItemsObs(
  props: Omit<ClassificationsTreeInstanceKeyPathsFromInstanceKeysProps, "abortSignal" | "uniqueId"> & {
    uniqueId: GuidString;
    componentName: string;
  },
) {
  const { targetItems, imodelAccess, limit } = props;
  if (limit !== "unbounded" && targetItems.length > (limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT)) {
    throw new SearchLimitExceededError(limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT);
  }
  return fromWithRelease({ source: targetItems, releaseOnCount: 2000 }).pipe(
    mergeMap(async (key): Promise<{ key: Id64String; type: number }> => {
      if (await imodelAccess.classDerivesFrom(key.className, CLASS_NAMES.ClassificationTable)) {
        return { key: key.id, type: CLASSIFICATION_TABLE_TYPE_AS_NUMBER };
      }

      if (await imodelAccess.classDerivesFrom(key.className, CLASS_NAMES.Classification)) {
        return { key: key.id, type: CLASSIFICATION_TYPE_AS_NUMBER };
      }

      return { key: key.id, type: ELEMENT_TYPE_AS_NUMBER };
    }, 2),
    createSearchPathsForDifferentTypes(props),
  );
}

function createSearchPathsForDifferentTypes(
  props: Omit<ClassificationsTreeInstanceKeyPathsBaseProps, "uniqueId"> & {
    uniqueId: GuidString;
    componentName: string;
  },
): OperatorFunction<
  { key: Id64String; type: number },
  ObservedValueOf<ReturnType<typeof createGeometricElementInstanceKeyPaths>>
> {
  return (obs) =>
    obs.pipe(
      reduce(
        (acc, { key, type }) => {
          switch (type) {
            case CLASSIFICATION_TABLE_TYPE_AS_NUMBER:
              acc.classificationTableIds.push(key);
              break;
            case CLASSIFICATION_TYPE_AS_NUMBER:
              acc.classificationIds.push(key);
              break;
            case ELEMENT_TYPE_AS_NUMBER:
              acc.elementIds.push(key);
              break;
          }
          return acc;
        },
        {
          classificationTableIds: new Array<ClassificationTableId>(),
          classificationIds: new Array<ClassificationId>(),
          elementIds: new Array<ElementId>(),
        },
      ),
      switchMap((ids) => {
        const { idsProvider, imodelAccess, uniqueId, componentName, limit } = props;
        const elementsLength = ids.elementIds.length;
        const totalSize = ids.classificationTableIds.length + ids.classificationIds.length + elementsLength;
        if (limit !== "unbounded" && totalSize > (limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT)) {
          throw new SearchLimitExceededError(limit ?? MAX_SEARCH_INSTANCE_KEY_COUNT);
        }

        return merge(
          from(ids.classificationTableIds).pipe(
            map((id) => ({ path: [{ id, className: CLASS_NAMES.ClassificationTable }], target: id })),
          ),
          from(idsProvider.getClassificationsPath(ids.classificationIds)).pipe(
            filter((path) => path.length > 0),
            map((path) => ({ path, target: path[path.length - 1].id })),
          ),
          from(ids.elementIds).pipe(
            bufferCount(getOptimalBatchSize({ totalSize: elementsLength, maximumBatchSize: 5000 })),
            releaseMainThreadOnItemsCount(1),
            mergeMap(
              (block, chunkIndex) =>
                createGeometricElementInstanceKeyPaths({
                  idsProvider,
                  imodelAccess,
                  targetItems: block,
                  chunkIndex,
                  uniqueId,
                  componentName,
                  excludedElementClassNames: props.hierarchyConfig.elements?.excludedClasses,
                }),
              2,
            ),
          ),
        );
      }),
    );
}

function createGeometricElementInstanceKeyPaths(props: {
  idsProvider: ClassificationsTreeIdsProvider;
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  targetItems: Id64Array;
  uniqueId: GuidString;
  componentName: string;
  chunkIndex: number;
  excludedElementClassNames?: Array<EC.FullClassNameDotNotation>;
}): Observable<{ path: HierarchyNodeIdentifiersPath; target: Id64String }> {
  const { targetItems, imodelAccess, idsProvider, uniqueId, componentName, chunkIndex, excludedElementClassNames } =
    props;
  if (targetItems.length === 0) {
    return EMPTY;
  }

  const separator = ";";

  return defer(() => {
    const ctes = [
      `ElementsHierarchy(ECInstanceId, ParentId, Path) AS (
        SELECT
          e.ECInstanceId,
          e.Parent.Id,
          '${ELEMENT_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex([e].[ECInstanceId]) AS TEXT)
        FROM  ${CLASS_NAMES.Element} e
        JOIN IdSet(?) targetItemIdSet ON e.ECInstanceId = targetItemIdSet.id
        ${createWhereClause({ conditions: [createExcludedClassesClause({ alias: "e", excludedClassNames: excludedElementClassNames })] })}

        UNION ALL

        SELECT
          pe.ECInstanceId,
          pe.Parent.Id,
          '${ELEMENT_CLASS_NAME_QUERY_ALIAS}${separator}' || CAST(IdToHex([pe].[ECInstanceId]) AS TEXT) || '${separator}' || ce.Path
        FROM ElementsHierarchy ce
        JOIN ${CLASS_NAMES.Element} pe ON pe.ECInstanceId = ce.ParentId
        ${createWhereClause({ conditions: [createExcludedClassesClause({ alias: "pe", excludedClassNames: excludedElementClassNames })] })}
      )`,
    ];
    const ecsql = `
      SELECT
        e.Path path,
        c.ECInstanceId classificationId
      FROM
        ${CLASS_NAMES.Classification} c
        JOIN ${CLASS_NAMES.ElementHasClassifications} ehc ON ehc.TargetECInstanceId = c.ECInstanceId
        JOIN ElementsHierarchy e ON ehc.SourceECInstanceId = e.ECInstanceId
      WHERE e.ParentId IS NULL
    `;

    return imodelAccess.createQueryReader(
      { ctes, ecsql, bindings: [{ type: "idset", value: targetItems }] },
      {
        rowFormat: "ECSqlPropertyNames",
        limit: "unbounded",
        restartToken: `${componentName}/${uniqueId}/elements-filter-paths/${chunkIndex}`,
      },
    );
  }).pipe(
    catchBeSQLiteInterrupts,
    targetItems.length > 300 ? releaseMainThreadOnItemsCount(300) : identity,
    map((row) => parseQueryRow(row, separator)),
    mergeMap(({ path, parentClassificationId }) => {
      const target = path[path.length - 1].id;
      if (parentClassificationId) {
        return from(idsProvider.getClassificationsPath(parentClassificationId)).pipe(
          map((parentClassificationPath) => ({ path: parentClassificationPath.concat(path), target })),
        );
      }
      return of({ path, target });
    }),
  );
}

function parseQueryRow(
  row: ECSqlQueryRow,
  separator: string,
): { path: HierarchyNodeIdentifiersPath; parentClassificationId: Id64String | undefined } {
  const rowElements: string[] = row.path.split(separator);
  const path: HierarchyNodeIdentifiersPath = [];
  for (let i = 0; i < rowElements.length; i += 2) {
    switch (rowElements[i]) {
      case ELEMENT_CLASS_NAME_QUERY_ALIAS:
        path.push({ className: CLASS_NAMES.GeometricElement3d, id: rowElements[i + 1] });
        break;
    }
  }

  return { path, parentClassificationId: row.classificationId };
}
