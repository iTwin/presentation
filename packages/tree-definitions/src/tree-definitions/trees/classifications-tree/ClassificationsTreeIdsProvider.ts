/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, expand, firstValueFrom, from, map, mergeMap, reduce, shareReplay } from "rxjs";
import { Guid, Id64 } from "@itwin/core-bentley";
import { eachValueFrom, type ECSchemaProvider } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { DataStateTracker } from "../../shared/idsProviders/DataStateTracker.js";
import { fromWithRelease } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts } from "../../shared/TreeErrors.js";
import { createWhereClause, getOrCreate } from "../../shared/Utils.js";

import type { Observable } from "rxjs";
import type { Id64Arg, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { IdsProviderDataState } from "../../shared/idsProviders/SharedIdsProvider.js";
import type { ClassificationId, ClassificationTableId } from "../../shared/Types.js";
import type {
  ClassificationsTreeHierarchyConfiguration,
  ClassificationsTreeSearchPath,
  ClassificationsTreeSearchPathKey,
} from "./ClassificationsTreeDefinition.js";

interface ClassificationOrTableInfo {
  parentClassificationOrTableId: ClassificationId | ClassificationTableId | undefined;
  childClassificationIds: ClassificationId[];
}

/**
 * Query access, root classification system, and category relationships for a classifications-tree ID provider.
 * @beta
 */
interface ClassificationsTreeIdsProviderProps {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode" | "elements">;
}

interface ClassificationsTreeIdsProviderData {
  classificationOrTableInfos: Map<ClassificationId | ClassificationTableId, ClassificationOrTableInfo>;
}

/**
 * Provides classification IDs and search paths within the configured classification system.
 * Getters load data on demand, reuse cached results, and reject on failure.
 * @beta
 */
export interface ClassificationsTreeIdsProvider {
  /**
   * State of classification data. `getAllClassifications` also loads shared category data.
   */
  readonly state: IdsProviderDataState;
  /** Returns direct child classifications and whether each has child classifications. */
  getDirectChildClassifications(
    classificationOrTableIds: Id64Arg,
  ): Promise<Array<{ id: ClassificationId; hasChildClassifications: boolean }>>;
  /**
   * Yields a path from the classification table to each supplied classification, including both endpoints.
   * Empty input yields no paths. Unknown IDs yield a path containing only the supplied classification.
   */
  getClassificationsPath(classificationIds: Id64Arg): AsyncIterableIterator<ClassificationsTreeSearchPath>;
  /** Returns non-private classifications and their classification table IDs from the configured classification system. */
  getAllClassifications(): Promise<ReadonlyArray<ClassificationId>>;
}

/**
 * Creates a cached classification tree ID provider using the supplied shared provider and category relationships.
 * Recreate it together with its shared provider after relevant iModel or configuration changes.
 * @beta
 */
export function createClassificationsTreeIdsProvider({
  hierarchyConfig,
  imodelAccess,
}: ClassificationsTreeIdsProviderProps): ClassificationsTreeIdsProvider {
  let cachedData: Observable<ClassificationsTreeIdsProviderData> | undefined;
  const componentId = Guid.createValue();
  const componentName = "ClassificationsTreeIdsProvider";
  const rowLimit = 7500;
  const state = new DataStateTracker();

  function queryClassifications(): Observable<
    { id: Id64String } & (
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
      const ecsql = `
        SELECT
          cl.ClassificationId id,
          cl.ClassificationTableId tableId,
          cl.ParentClassificationId parentId
        FROM ${CLASSIFICATIONS_CTE} cl
        ${createWhereClause({ conditions: [lastClassificationId !== undefined && `cl.ClassificationId > ${lastClassificationId}`] })}
        ORDER BY cl.ClassificationId
        LIMIT ${rowLimit}
      `;
      return imodelAccess.createQueryReader(
        { ctes, ecsql, bindings: [{ type: "string", value: hierarchyConfig.rootClassificationSystemCode }] },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${componentName}/${componentId}/classifications/${lastClassificationId ?? "0"}`,
        },
      );
    };
    return from(getQueryReader()).pipe(
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
        return { id: row.id, tableId: row.tableId, parentId: row.parentId };
      }),
    );
  }

  function getData() {
    cachedData ??= defer(() =>
      queryClassifications()
        .pipe(
          reduce(
            (acc, { id, tableId, parentId }) => {
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
            },
          ),
        )
        .pipe(state.track(), shareReplay()),
    );
    return cachedData;
  }

  return {
    get state(): IdsProviderDataState {
      return state.state;
    },
    async getDirectChildClassifications(
      classificationOrTableIds: Id64Arg,
    ): Promise<Array<{ id: ClassificationId; hasChildClassifications: boolean }>> {
      const result = new Array<{ id: ClassificationId; hasChildClassifications: boolean }>();
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
                  classificationInfo.childClassificationIds.forEach((id) =>
                    acc.push({
                      id,
                      hasChildClassifications: !!classificationOrTableInfos.get(id)?.childClassificationIds.length,
                    }),
                  );
                }
                return acc;
              }, result),
            ),
          ),
        ),
      );
    },
    getClassificationsPath(classificationIds: Id64Arg): AsyncIterableIterator<ClassificationsTreeSearchPath> {
      if (Id64.sizeOf(classificationIds) === 0) {
        return (async function* () {})();
      }
      return eachValueFrom(
        getData().pipe(
          mergeMap(({ classificationOrTableInfos }) =>
            fromWithRelease({ source: classificationIds, releaseOnCount: 200 }).pipe(
              map((classificationId) => {
                const path: ClassificationsTreeSearchPathKey[] = [
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
