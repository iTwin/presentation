/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, expand, from, map, mergeMap, of, reduce, shareReplay, tap } from "rxjs";
import { Guid, Id64 } from "@itwin/core-bentley";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { BaseIdsProviderImpl } from "../../shared/idsProviders/BaseIdsProvider.js";
import { fromWithRelease, toVoidPromise } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts } from "../../shared/TreeErrors.js";
import { createWhereClause, getOrCreate } from "../../shared/Utils.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Arg, Id64String } from "@itwin/core-bentley";
import type { HierarchyNodeIdentifiersPath, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC } from "@itwin/presentation-shared";
import type { BaseIdsProviderImplProps } from "../../shared/idsProviders/BaseIdsProvider.js";
import type { CategoryId, ClassificationId, ClassificationTableId } from "../../shared/Types.js";
import type { ClassificationsTreeHierarchyConfiguration } from "./ClassificationsTreeDefinition.js";

/**
 * Hierarchy config props needed for ids cache.
 * @internal
 */
export type HierarchyConfigForClassificationsCache = Pick<
  ClassificationsTreeHierarchyConfiguration,
  "rootClassificationSystemCode" | "elements"
>;

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

interface ClassificationsTreeIdsProviderProps extends BaseIdsProviderImplProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  hierarchyConfig: HierarchyConfigForClassificationsCache;
  classificationToCategoriesRelationshipSpecification?: ClassificationToCategoriesRelationshipSpecification;
}

interface ClassificationsTreeIdsProviderData {
  classificationOrTableInfos: Map<ClassificationId | ClassificationTableId, ClassificationOrTableInfo>;
  classificationsWithNonExcludedChildren: Set<ClassificationId>;
}

/** @internal */
export class ClassificationsTreeIdsProvider extends BaseIdsProviderImpl {
  #cachedData: Observable<ClassificationsTreeIdsProviderData> | undefined;
  #props: ClassificationsTreeIdsProviderProps;
  #componentId: GuidString;
  #componentName: string;
  #rowLimit = 7500;
  #cachedDataLoaded = false;

  constructor(props: ClassificationsTreeIdsProviderProps) {
    super(props);
    this.#props = props;
    this.#componentId = Guid.createValue();
    this.#componentName = "ClassificationsTreeIdsProvider";
  }

  private queryClassifications(): Observable<
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
      if (this.#props.classificationToCategoriesRelationshipSpecification) {
        const relationship = this.#props.classificationToCategoriesRelationshipSpecification.fullClassName;
        const { categoryAccessor, classificationAccessor } =
          this.#props.classificationToCategoriesRelationshipSpecification.source === "classification"
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
        LIMIT ${this.#rowLimit}
      `;
      return this.#props.queryExecutor.createQueryReader(
        {
          ctes,
          ecsql,
          bindings: [{ type: "string", value: this.#props.hierarchyConfig.rootClassificationSystemCode }],
        },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${this.#componentName}/${this.#componentId}/classifications/${lastClassificationId ?? "0"}`,
        },
      );
    };
    return defer(() => getQueryReader()).pipe(
      // Note: if the total row count is an exact multiple of `#rowLimit`, an extra request that returns
      // 0 rows will be sent. This is acceptable to keep the implementation simple.
      expand((row, idx) => {
        if (idx % this.#rowLimit === this.#rowLimit - 1) {
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

  private getData() {
    this.#cachedData ??= this.getCategoriesContainingNonExcludedElements().pipe(
      mergeMap((categoriesContainingNonExcludedElements) =>
        this.queryClassifications().pipe(
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
        this.#cachedDataLoaded = true;
      }),
      shareReplay(),
    );
    return this.#cachedData;
  }

  public async preloadClassifications(): Promise<void> {
    if (this.#cachedData !== undefined) {
      return;
    }
    try {
      await toVoidPromise(this.getData());
    } catch {}
  }

  public get isDataLoaded(): boolean {
    return this.#cachedDataLoaded;
  }

  public hasChildren(classificationId: ClassificationId): Observable<boolean> {
    return this.getData().pipe(
      map(({ classificationsWithNonExcludedChildren }) => classificationsWithNonExcludedChildren.has(classificationId)),
    );
  }

  public getDirectChildClassifications(classificationOrTableIds: Id64Arg): Observable<ClassificationId[]> {
    const result = new Array<ClassificationId>();
    if (Id64.sizeOf(classificationOrTableIds) === 0) {
      return of(result);
    }
    return this.getData().pipe(
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
    );
  }

  public getClassificationsPathObs(classificationIds: Id64Arg): Observable<HierarchyNodeIdentifiersPath> {
    return this.getData().pipe(
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
    );
  }

  public getAllClassifications(): Observable<ClassificationId[]> {
    return this.getData().pipe(map(({ classificationOrTableInfos }) => [...classificationOrTableInfos.keys()]));
  }
}
