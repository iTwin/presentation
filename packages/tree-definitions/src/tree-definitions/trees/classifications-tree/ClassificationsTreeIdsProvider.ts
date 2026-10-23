/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { defer, EMPTY, expand, filter, forkJoin, from, map, mergeMap, of, reduce, shareReplay } from "rxjs";
import { Guid, Id64 } from "@itwin/core-bentley";
import { ECSql } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { DataStateTracker } from "../../shared/idsProviders/DataStateTracker.js";
import { fromWithRelease } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts } from "../../shared/TreeErrors.js";
import { createWhereClause, getOrCreate } from "../../shared/Utils.js";

import type { Observable } from "rxjs";
import type { Id64Arg } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { DeepReadonly, ECSchemaProvider, Subscribable } from "@itwin/presentation-shared";
import type { IdsProviderDataState } from "../../shared/idsProviders/SharedIdsProvider.js";
import type { ClassificationId, ClassificationTableId, ReadonlyId64Arg } from "../../shared/Types.js";
import type { HiddenClassesFilter } from "../../shared/Utils.js";
import type {
  ClassificationsTreeHierarchyConfiguration,
  ClassificationsTreeSearchPath,
  ClassificationsTreeSearchPathKey,
} from "./ClassificationsTreeDefinition.js";

interface ClassificationOrTableInfo {
  // oxlint-disable-next-line typescript/no-duplicate-type-constituents
  parentClassificationOrTableId: ClassificationId | ClassificationTableId | undefined;
  childClassificationIds: ClassificationId[];
}

/**
 * Schema access, query access, and hierarchy configuration for a classifications-tree ID provider.
 * @beta
 */
interface ClassificationsTreeIdsProviderProps {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode">;
}

interface ClassificationsTreeIdsProviderData {
  // oxlint-disable-next-line typescript/no-duplicate-type-constituents
  classificationOrTableInfos: Map<ClassificationId | ClassificationTableId, ClassificationOrTableInfo>;
}

/**
 * Provides classification IDs and search paths within the configured classification system.
 * Getters load data on demand, reuse cached results, and reject on failure.
 * @beta
 */
export interface ClassificationsTreeIdsProvider {
  /** Readonly snapshot of the hierarchy configuration used to create this provider, including resolved defaults. */
  readonly config: DeepReadonly<Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode">>;
  /**
   * State of classification data.
   */
  readonly state: IdsProviderDataState;
  /**
   * Returns direct child classifications and whether each has child classifications.
   *
   * **NOTE:** This subscribable emits a single value and completes.
   */
  getDirectChildClassifications(
    classificationOrTableIds: ReadonlyId64Arg,
  ): Subscribable<ReadonlyArray<Readonly<{ id: ClassificationId; hasChildClassifications: boolean }>>>;
  /**
   * Emits a stream of paths, one value per supplied ID:
   * - for a classification, a path from its table to the classification, including both endpoints,
   * - for a table, a path containing only that table.
   *
   * Empty input and IDs outside the visible hierarchy emit no paths.
   */
  getClassificationsPath(classificationOrTableIds: ReadonlyId64Arg): Subscribable<ClassificationsTreeSearchPath>;
  /**
   * Returns non-private classifications and their classification table IDs from the configured classification system.
   *
   * **NOTE:** This subscribable emits a single value and completes.
   */
  getAllClassifications(): Subscribable<ReadonlyArray<ClassificationId>>;
}

/**
 * Creates a cached classification tree ID provider bound to the supplied hierarchy configuration.
 * Recreate it after relevant iModel or configuration changes.
 * @beta
 */
export function createClassificationsTreeIdsProvider({
  hierarchyConfig: configOverrides,
  imodelAccess,
}: ClassificationsTreeIdsProviderProps): ClassificationsTreeIdsProvider {
  const hierarchyConfig = createClassificationsTreeIdsProviderConfig(configOverrides);
  let cachedData: Observable<ClassificationsTreeIdsProviderData> | undefined;
  const componentId = Guid.createValue();
  const componentName = "ClassificationsTreeIdsProvider";
  const rowLimit = 7500;
  const state = new DataStateTracker();

  function queryClassificationsAndTables(): Observable<
    | { type: "table"; id: ClassificationTableId }
    | ({ type: "classification"; id: ClassificationId } & (
        | { tableId: ClassificationTableId; parentId: undefined }
        | { tableId: undefined; parentId: ClassificationId }
      ))
  > {
    const getQueryReader = (
      hiddenClassesFilters: Record<"tables" | "classifications", HiddenClassesFilter>,
      lastClassificationId?: ClassificationId,
    ) => {
      const CLASSIFICATIONS_CTE = "Classifications";
      const CLASSIFICATION_TABLES_CTE = "ClassificationTables";
      const ctes = [
        `
          ${CLASSIFICATION_TABLES_CTE}(ECInstanceId) AS (
            SELECT ct.ECInstanceId
            FROM ${CLASS_NAMES.ClassificationTable} ct
            JOIN ${CLASS_NAMES.ClassificationSystem} cs ON cs.ECInstanceId = ct.Parent.Id
            ${createWhereClause({
              conditions: ["cs.CodeValue = ?", "NOT ct.IsPrivate", hiddenClassesFilters.tables.createWhereClause("ct")],
            })}
          )
        `,
        `
          ${CLASSIFICATIONS_CTE}(ClassificationId, ClassificationTableId, ParentClassificationId) AS (
            SELECT
              cl.ECInstanceId,
              ct.ECInstanceId,
              NULL
            FROM ${CLASS_NAMES.Classification} cl
            JOIN ${CLASSIFICATION_TABLES_CTE} ct ON ct.ECInstanceId = cl.Model.Id
            ${createWhereClause({
              conditions: [
                "NOT cl.IsPrivate",
                "cl.Parent.Id IS NULL",
                hiddenClassesFilters.classifications.createWhereClause("cl"),
              ],
            })}

            UNION ALL

            SELECT
              cl.ECInstanceId,
              NULL,
              cl.Parent.Id
            FROM
              ${CLASSIFICATIONS_CTE} cte
              JOIN ${CLASS_NAMES.Classification} cl ON cl.Parent.Id = cte.ClassificationId
            ${createWhereClause({
              conditions: ["NOT cl.IsPrivate", hiddenClassesFilters.classifications.createWhereClause("cl")],
            })}
          )
        `,
      ];
      const ecsql = `
        SELECT * FROM (
          SELECT
            'cl' type,
            cl.ClassificationId id,
            cl.ClassificationTableId tableId,
            cl.ParentClassificationId parentId
          FROM ${CLASSIFICATIONS_CTE} cl

          UNION ALL

          SELECT
            'ct' type,
            ct.ECInstanceId id,
            NULL tableId,
            NULL parentId
          FROM ${CLASSIFICATION_TABLES_CTE} ct
        )
        ${createWhereClause({ conditions: [lastClassificationId !== undefined && `id > ${lastClassificationId}`] })}
        ORDER BY id
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
    return forkJoin({
      tables: ECSql.createHiddenClassesFilter({
        schemaProvider: imodelAccess,
        baseClassName: CLASS_NAMES.ClassificationTable,
      }),
      classifications: ECSql.createHiddenClassesFilter({
        schemaProvider: imodelAccess,
        baseClassName: CLASS_NAMES.Classification,
      }),
    }).pipe(
      mergeMap((hiddenClassesFilters) =>
        from(getQueryReader(hiddenClassesFilters)).pipe(
          // Note: if the total row count is an exact multiple of `rowLimit`, an extra request that returns
          // 0 rows will be sent. This is acceptable to keep the implementation simple.
          expand((row, idx) => {
            if (idx % rowLimit === rowLimit - 1) {
              return getQueryReader(hiddenClassesFilters, row.id);
            }
            return EMPTY;
          }),
        ),
      ),
      catchBeSQLiteInterrupts,
      map((row) => {
        return row.type === "ct"
          ? { type: "table" as const, id: row.id }
          : { type: "classification" as const, id: row.id, tableId: row.tableId, parentId: row.parentId };
      }),
    );
  }

  function getData() {
    cachedData ??= defer(() =>
      queryClassificationsAndTables().pipe(
        reduce(
          (acc, entry) => {
            if (entry.type === "table") {
              getOrCreate({
                map: acc.classificationOrTableInfos,
                key: entry.id,
                createFunc: () => ({ childClassificationIds: [], parentClassificationOrTableId: undefined }),
              });
              return acc;
            }

            const { id, tableId, parentId } = entry;
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
            // oxlint-disable-next-line typescript/no-duplicate-type-constituents
            classificationOrTableInfos: new Map<ClassificationId | ClassificationTableId, ClassificationOrTableInfo>(),
          },
        ),
      ),
    ).pipe(state.track(), shareReplay());
    return cachedData;
  }

  return {
    config: hierarchyConfig,
    get state(): IdsProviderDataState {
      return state.state;
    },
    getDirectChildClassifications(
      classificationOrTableIds: Id64Arg,
    ): Subscribable<Array<{ id: ClassificationId; hasChildClassifications: boolean }>> {
      if (Id64.sizeOf(classificationOrTableIds) === 0) {
        return of([]);
      }
      return getData().pipe(
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
            }, new Array<{ id: ClassificationId; hasChildClassifications: boolean }>()),
          ),
        ),
      );
    },
    getClassificationsPath(classificationOrTableIds: Id64Arg): Subscribable<ClassificationsTreeSearchPath> {
      if (Id64.sizeOf(classificationOrTableIds) === 0) {
        return of();
      }
      return getData().pipe(
        mergeMap(({ classificationOrTableInfos }) =>
          fromWithRelease({ source: classificationOrTableIds, releaseOnCount: 200 }).pipe(
            filter((classificationOrTableId) => classificationOrTableInfos.has(classificationOrTableId)),
            map((classificationOrTableId) => {
              const path: ClassificationsTreeSearchPathKey[] = [];
              let parentId = classificationOrTableInfos.get(classificationOrTableId)?.parentClassificationOrTableId;
              path.push(
                // getting a parent id means we have a classification
                parentId
                  ? { id: classificationOrTableId, className: CLASS_NAMES.Classification }
                  : { id: classificationOrTableId, className: CLASS_NAMES.ClassificationTable },
              );
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
    },

    getAllClassifications(): Subscribable<ClassificationId[]> {
      return getData().pipe(map(({ classificationOrTableInfos }) => [...classificationOrTableInfos.keys()]));
    },
  };
}

/** @internal */
export function createClassificationsTreeIdsProviderConfig(config: ClassificationsTreeHierarchyConfiguration) {
  return { rootClassificationSystemCode: config.rootClassificationSystemCode };
}
