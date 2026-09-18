/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, expand, firstValueFrom, from, map, mergeMap, reduce, shareReplay, tap } from "rxjs";
import { Guid, Id64 } from "@itwin/core-bentley";
import { eachValueFrom, type EC } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { fromWithRelease, toVoidPromise } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts } from "../../shared/TreeErrors.js";
import { createWhereClause, getOrCreate } from "../../shared/Utils.js";

import type { Observable } from "rxjs";
import type { Id64Arg, Id64String } from "@itwin/core-bentley";
import type { HierarchyNodeIdentifiersPath, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { BaseIdsProvider } from "../../shared/idsProviders/BaseIdsProvider.js";
import type { CategoryId, ClassificationId, ClassificationTableId } from "../../shared/Types.js";
import type { ClassificationsTreeHierarchyConfiguration } from "./ClassificationsTreeDefinition.js";

/**
 * Relationship used to determine related categories for classifications.
 *
 * By default, categories are determined using `ClassificationSystems.ElementHasClassifications` and `BisCore.GeometricElement3dIsInCategory` relationships.
 *
 * @beta
 */
export interface ClassificationToCategoriesRelationshipSpecification {
  /**
   * Full class name of the relationship which links classifications to categories. Format: `{SchemaName}.{RelationshipClassName}`.
   */
  fullClassName: EC.FullClassNameDotNotation;
  /**
   * Describes the relationship direction by specifying its source.
   * E.g. whether it's a `classification` -> `categories` or `category` -> `classifications` relationship.
   */
  source: "classification" | "category";
}

interface ClassificationOrTableInfo {
  parentClassificationOrTableId: ClassificationId | ClassificationTableId | undefined;
  childClassificationIds: ClassificationId[];
}

interface ClassificationsTreeIdsProviderProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode" | "elements">;
  classificationToCategoriesRelationshipSpecification?: ClassificationToCategoriesRelationshipSpecification;
  baseIdsProvider: BaseIdsProvider;
}

interface ClassificationsTreeIdsProviderData {
  classificationOrTableInfos: Map<ClassificationId | ClassificationTableId, ClassificationOrTableInfo>;
  classificationsWithNonExcludedChildren: Set<ClassificationId>;
}

/**
 * Provides classification IDs and search paths within the configured classification system.
 * @beta
 */
export interface ClassificationsTreeIdsProvider extends BaseIdsProvider {
  /** Starts loading classification data if it has not been requested yet. Loading errors are ignored. */
  preloadClassifications(): Promise<void>;
  /** Indicates whether classification data has finished loading. */
  readonly isDataLoaded: boolean;
  /** Indicates whether a classification has child classifications or related categories containing non-excluded elements. */
  hasChildren(classificationId: ClassificationId): Promise<boolean>;
  /** Returns direct child classification IDs for the supplied classifications or tables. */
  getDirectChildClassifications(classificationOrTableIds: Id64Arg): Promise<ClassificationId[]>;
  /**
   * Yields a path from the classification table to each supplied classification, including both endpoints.
   * Empty input yields no paths. Unknown IDs yield a path containing only the supplied classification.
   */
  getClassificationsPath(classificationIds: Id64Arg): AsyncIterableIterator<HierarchyNodeIdentifiersPath>;
  /** Returns non-private classifications and their classification table IDs from the configured classification system. */
  getAllClassifications(): Promise<ClassificationId[]>;
}

/**
 * Creates a cached classification tree ID provider using the supplied base provider and category relationships.
 * @beta
 */
export function createClassificationsTreeIdsProvider({
  baseIdsProvider,
  hierarchyConfig,
  queryExecutor,
  classificationToCategoriesRelationshipSpecification,
}: ClassificationsTreeIdsProviderProps): ClassificationsTreeIdsProvider {
  let cachedData: Observable<ClassificationsTreeIdsProviderData> | undefined;
  const componentId = Guid.createValue();
  const componentName = "ClassificationsTreeIdsProvider";
  const rowLimit = 7500;
  let cachedDataLoaded = false;

  function queryClassifications(): Observable<
    { id: Id64String; relatedCategories: CategoryId[] } & (
      | { tableId: ClassificationTableId; parentId: undefined }
      | { tableId: undefined; parentId: ClassificationId }
    )
  > {
    const getQueryReader = (lastClassificationId?: ClassificationId) => {
      const CLASSIFICATIONS_CTE = "Classifications";
      const ctes = [
        `
          ${CLASSIFICATIONS_CTE}(ClassificationId, ClassificationTableId, ParentClassificationId) AS (
            SELECT
              cl.ECInstanceId,
              ct.ECInstanceId,
              NULL
            FROM ${CLASS_NAMES.Classification} cl
            JOIN ${CLASS_NAMES.ClassificationTable} ct ON ct.ECInstanceId = cl.Model.Id
            JOIN ${CLASS_NAMES.ClassificationSystem} cs ON cs.ECInstanceId = ct.Parent.Id
            ${createWhereClause({
              conditions: ["cs.CodeValue = ?", "NOT ct.IsPrivate", "NOT cl.IsPrivate", "cl.Parent.Id IS NULL"],
            })}

            UNION ALL

            SELECT
              cl.ECInstanceId,
              NULL,
              cl.Parent.Id
            FROM
              ${CLASSIFICATIONS_CTE} cte
              JOIN ${CLASS_NAMES.Classification} cl ON cl.Parent.Id = cte.ClassificationId
            WHERE
              NOT cl.IsPrivate
          )
        `,
      ];
      let categoriesOfClassificationSelector: string;
      if (classificationToCategoriesRelationshipSpecification) {
        const relationship = classificationToCategoriesRelationshipSpecification.fullClassName;
        const { categoryAccessor, classificationAccessor } =
          classificationToCategoriesRelationshipSpecification.source === "classification"
            ? { classificationAccessor: "SourceECInstanceId", categoryAccessor: "TargetECInstanceId" }
            : { classificationAccessor: "TargetECInstanceId", categoryAccessor: "SourceECInstanceId" };
        categoriesOfClassificationSelector = `
          SELECT group_concat(IdToHex(cat.ECInstanceId))
          FROM ${CLASS_NAMES.SpatialCategory} cat
          JOIN ${relationship} rel ON rel.${categoryAccessor} = cat.ECInstanceId
          ${createWhereClause({ conditions: ["NOT cat.IsPrivate", `rel.${classificationAccessor} = cl.ClassificationId`] })}
          GROUP BY rel.${classificationAccessor}
        `;
      } else {
        categoriesOfClassificationSelector = `
          SELECT group_concat(IdToHex(cat.ECInstanceId))
          FROM ${CLASS_NAMES.GeometricElement3d} e
          JOIN ${CLASS_NAMES.SpatialCategory} cat ON cat.ECInstanceId = e.Category.Id
          JOIN ${CLASS_NAMES.ElementHasClassifications} ehc ON ehc.SourceECInstanceId = e.ECInstanceId
          ${createWhereClause({
            conditions: ["e.Parent.Id IS NULL", "NOT cat.IsPrivate", "ehc.TargetECInstanceId = cl.ClassificationId"],
          })}
          GROUP BY ehc.TargetECInstanceId
        `;
      }
      const ecsql = `
        SELECT
          cl.ClassificationId id,
          cl.ClassificationTableId tableId,
          cl.ParentClassificationId parentId,
          (${categoriesOfClassificationSelector}) relatedCategories
        FROM ${CLASSIFICATIONS_CTE} cl
        ${createWhereClause({ conditions: [lastClassificationId !== undefined && `cl.ClassificationId > ${lastClassificationId}`] })}
        ORDER BY cl.ClassificationId
        LIMIT ${rowLimit}
      `;
      return queryExecutor.createQueryReader(
        { ctes, ecsql, bindings: [{ type: "string", value: hierarchyConfig.rootClassificationSystemCode }] },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${componentName}/${componentId}/classifications/${lastClassificationId ?? "0"}`,
        },
      );
    };
    return defer(() => getQueryReader()).pipe(
      // Note: if the total row count is an exact multiple of `rowLimit`, an extra request that returns
      // 0 rows will be sent. This is acceptable to keep the implementation simple.
      expand((row, idx) => {
        if (idx % rowLimit === rowLimit - 1) {
          return getQueryReader(row.id);
        }
        return EMPTY;
      }),
      catchBeSQLiteInterrupts,
      map((row) => {
        const relatedCategories = row.relatedCategories ? (row.relatedCategories as string).split(",") : [];
        return { id: row.id, tableId: row.tableId, parentId: row.parentId, relatedCategories };
      }),
    );
  }

  function getData() {
    cachedData ??= from(baseIdsProvider.getCategoriesContainingNonExcludedElements()).pipe(
      mergeMap((categoriesContainingNonExcludedElements) =>
        queryClassifications().pipe(
          reduce(
            (acc, { id, tableId, parentId, relatedCategories }) => {
              if (parentId !== undefined) {
                acc.classificationsWithNonExcludedChildren.add(parentId);
              }
              if (relatedCategories.length > 0) {
                if (relatedCategories.some((categoryId) => categoriesContainingNonExcludedElements.has(categoryId))) {
                  acc.classificationsWithNonExcludedChildren.add(id);
                }
              }
              const tableOrParentId = tableId ?? parentId;
              const parentInfo = getOrCreate({
                map: acc.classificationOrTableInfos,
                key: tableOrParentId,
                createFunc: () => ({ childClassificationIds: [], parentClassificationOrTableId: undefined }),
              });
              parentInfo.childClassificationIds.push(id);
              const classificationEntry = getOrCreate({
                map: acc.classificationOrTableInfos,
                key: id,
                createFunc: () => ({ childClassificationIds: [], parentClassificationOrTableId: tableOrParentId }),
              });
              classificationEntry.parentClassificationOrTableId = tableOrParentId;
              return acc;
            },
            {
              classificationOrTableInfos: new Map<
                ClassificationId | ClassificationTableId,
                ClassificationOrTableInfo
              >(),
              classificationsWithNonExcludedChildren: new Set<ClassificationId>(),
            },
          ),
        ),
      ),
      tap(() => {
        cachedDataLoaded = true;
      }),
      shareReplay(),
    );
    return cachedData;
  }

  return {
    ...baseIdsProvider,
    async preloadClassifications(): Promise<void> {
      if (cachedData !== undefined) {
        return;
      }
      try {
        await toVoidPromise(getData());
      } catch {}
    },
    get isDataLoaded(): boolean {
      return cachedDataLoaded;
    },
    async hasChildren(classificationId: ClassificationId): Promise<boolean> {
      return firstValueFrom(
        getData().pipe(
          map(({ classificationsWithNonExcludedChildren }) =>
            classificationsWithNonExcludedChildren.has(classificationId),
          ),
        ),
      );
    },
    async getDirectChildClassifications(classificationOrTableIds: Id64Arg): Promise<ClassificationId[]> {
      const result = new Array<ClassificationId>();
      if (Id64.sizeOf(classificationOrTableIds) === 0) {
        return result;
      }
      return firstValueFrom(
        getData().pipe(
          mergeMap(({ classificationOrTableInfos }) =>
            from(Id64.iterable(classificationOrTableIds)).pipe(
              reduce((acc, classificationOrTableId) => {
                const classificationInfo = classificationOrTableInfos.get(classificationOrTableId);
                if (classificationInfo !== undefined) {
                  classificationInfo.childClassificationIds.forEach((id) => acc.push(id));
                }
                return acc;
              }, result),
            ),
          ),
        ),
      );
    },
    getClassificationsPath(classificationIds: Id64Arg): AsyncIterableIterator<HierarchyNodeIdentifiersPath> {
      if (Id64.sizeOf(classificationIds) === 0) {
        return (async function* () {})();
      }
      return eachValueFrom(
        getData().pipe(
          mergeMap(({ classificationOrTableInfos }) =>
            fromWithRelease({ source: classificationIds, releaseOnCount: 200 }).pipe(
              map((classificationId) => {
                const path: HierarchyNodeIdentifiersPath = [
                  { id: classificationId, className: CLASS_NAMES.Classification },
                ];
                let parentId = classificationOrTableInfos.get(classificationId)?.parentClassificationOrTableId;
                while (parentId !== undefined) {
                  const parentIdOfParent = classificationOrTableInfos.get(parentId)?.parentClassificationOrTableId;
                  if (parentIdOfParent) {
                    path.push({ className: CLASS_NAMES.Classification, id: parentId });
                  } else {
                    path.push({ className: CLASS_NAMES.ClassificationTable, id: parentId });
                  }
                  parentId = parentIdOfParent;
                }
                return path.reverse();
              }),
            ),
          ),
        ),
      );
    },
    async getAllClassifications(): Promise<ClassificationId[]> {
      return firstValueFrom(
        getData().pipe(map(({ classificationOrTableInfos }) => [...classificationOrTableInfos.keys()])),
      );
    },
  };
}
