/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  defaultIfEmpty,
  defer,
  EMPTY,
  firstValueFrom,
  forkJoin,
  from,
  map,
  mergeMap,
  of,
  reduce,
  shareReplay,
  tap,
  toArray,
} from "rxjs";
import { Guid, Id64 } from "@itwin/core-bentley";
import { eachValueFrom } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { fromWithRelease, toVoidPromise } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts } from "../../shared/TreeErrors.js";
import { createWhereClause, getClassesByView, getOrCreate } from "../../shared/Utils.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Arg, Id64Array, Id64String } from "@itwin/core-bentley";
import type { HierarchyNodeIdentifiersPath, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { BaseIdsProvider } from "../../shared/idsProviders/BaseIdsProvider.js";
import type { CategoryId, DefinitionContainerId, ModelId } from "../../shared/Types.js";

interface DefinitionContainerInfo {
  modelId: Id64String;
  parentDefinitionContainerExists: boolean;
  childCategories: CachedCategoryInfo[];
  childDefinitionContainers: Array<{ id: Id64String; hasElements: boolean }>;
  hasElements: boolean;
}

interface CategoriesInfo {
  childCategories: CachedCategoryInfo[];
  parentDefinitionContainerExists: boolean;
}

/**
 * Category metadata used to determine which child nodes are available in the hierarchy.
 * @internal
 */
export interface CachedCategoryInfo {
  /** The category's element ID. */
  id: Id64String;
  /** Number of non-private subcategories, including the default subcategory. */
  subCategoryChildCount: number;
  /** Whether the category contains elements of the configured class, including excluded classes. */
  hasElements: boolean;
  /** Whether the category contains elements whose classes are not excluded. */
  hasElementsFromNonExcludedClasses: boolean;
}

/**
 * Query access and view type for a categories-tree ID provider.
 * @internal
 */
interface CategoriesTreeIdsProviderProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  baseIdsProvider: BaseIdsProvider;
  type: "2d" | "3d";
}

type DefinitionContainersData = Map<DefinitionContainerId, DefinitionContainerInfo>;

interface CategoriesData {
  categoriesGroupedByModel: Map<ModelId, CategoriesInfo>;
  categoriesWithModel: Map<CategoryId, { modelId: ModelId; isDefinitionContainer: boolean }>;
}

/**
 * Provides category and definition container IDs and search paths for category tree hierarchies.
 * @internal
 */
export interface CategoriesTreeIdsProvider extends BaseIdsProvider {
  /** Starts loading definition container and category data if not already requested. Loading errors are ignored. */
  preloadDefinitionContainers(): Promise<void>;
  /** Returns direct child categories and definition container IDs, excluding empty entries unless requested. */
  getDirectChildDefinitionContainersAndCategories(props: {
    parentDefinitionContainerIds: Id64Arg;
    includeEmpty?: boolean;
  }): Promise<{ categories: CachedCategoryInfo[]; definitionContainers: Array<DefinitionContainerId> }>;
  /** Yields root-to-subcategory paths, omitting subcategories whose parent category has only one subcategory. */
  getSubCategoriesSearchPaths(props: { subCategoryIds: Id64Arg }): AsyncIterableIterator<HierarchyNodeIdentifiersPath>;
  /** Yields root-to-definition-container paths, including each container itself. Unknown IDs yield empty paths. */
  getDefinitionContainersSearchPaths(props: {
    definitionContainerIds: Id64Arg;
  }): AsyncIterableIterator<HierarchyNodeIdentifiersPath>;
  /** Returns the category's ancestor path, excluding the category itself. Returns an empty path for root or unknown categories. */
  getSearchPathsUpToRootCategory(props: { categoryId: Id64String }): Promise<HierarchyNodeIdentifiersPath>;
  /** Returns all category and definition container IDs, excluding empty entries unless requested. */
  getAllDefinitionContainersAndCategories(props?: {
    includeEmpty?: boolean;
  }): Promise<{ categories: Array<CategoryId>; definitionContainers: Array<DefinitionContainerId> }>;
  /** Returns root categories and definition container IDs, excluding empty entries unless requested. */
  getRootDefinitionContainersAndCategories(props?: {
    includeEmpty?: boolean;
  }): Promise<{ categories: CachedCategoryInfo[]; definitionContainers: Array<DefinitionContainerId> }>;
  /** Indicates whether definition container and category data has finished loading. */
  readonly isDataLoaded: boolean;
  /** Indicates whether the iModel schema supports definition containers. */
  getIsDefinitionContainerSupported(): Promise<boolean>;
}

/**
 * Creates a cached category tree ID provider for the specified view type using the supplied base provider.
 * @internal
 */
export function createCategoriesTreeIdsProvider({
  queryExecutor,
  type,
  baseIdsProvider,
}: CategoriesTreeIdsProviderProps): CategoriesTreeIdsProvider {
  const cachedData: {
    definitionContainersData: Observable<DefinitionContainersData> | undefined;
    categoriesData: Observable<CategoriesData> | undefined;
    isDefinitionContainerSupported: Observable<boolean> | undefined;
  } = { definitionContainersData: undefined, categoriesData: undefined, isDefinitionContainerSupported: undefined };
  const definitionContainerInstanceKeyPaths: Map<
    DefinitionContainerId,
    Observable<HierarchyNodeIdentifiersPath>
  > = new Map();
  const { categoryClass } = getClassesByView(type);
  let defContainersDataLoaded = false;
  let categoriesDataLoaded = false;
  const componentId: GuidString = Guid.createValue();
  const componentName: string = "CategoriesTreeIdsProvider";

  function queryCategories(): Observable<{
    id: CategoryId;
    modelId: Id64String;
    parentDefinitionContainerExists: boolean;
  }> {
    return getIsDefinitionContainerSupported().pipe(
      mergeMap((isDefinitionContainerSupported) =>
        defer(() => {
          const categoriesQuery = `
            SELECT
              this.ECInstanceId id,
              this.Model.Id modelId,
              ${
                isDefinitionContainerSupported
                  ? `
                  IIF(this.Model.Id IN (SELECT dc.ECInstanceId FROM ${CLASS_NAMES.DefinitionContainer} dc),
                    true,
                    false
                  )`
                  : "false"
              } parentDefinitionContainerExists
            FROM
              ${categoryClass} this
              JOIN ${CLASS_NAMES.Model} m ON m.ECInstanceId = this.Model.Id
            ${createWhereClause({ conditions: ["NOT this.IsPrivate", "NOT m.IsPrivate OR m.ECClassId IS (BisCore.DictionaryModel)"] })}
            GROUP BY this.ECInstanceId
          `;
          return queryExecutor.createQueryReader(
            { ecsql: categoriesQuery },
            {
              rowFormat: "ECSqlPropertyNames",
              limit: "unbounded",
              restartToken: `${componentName}/${componentId}/categories`,
            },
          );
        }).pipe(
          catchBeSQLiteInterrupts,
          map((row) => {
            return {
              id: row.id,
              modelId: row.modelId,
              parentDefinitionContainerExists: row.parentDefinitionContainerExists,
            };
          }),
        ),
      ),
    );
  }

  function queryIsDefinitionContainersSupported(): Observable<boolean> {
    return defer(() => {
      const query = `
        SELECT
          1
        FROM
          ECDbMeta.ECSchemaDef s
          JOIN ECDbMeta.ECClassDef c ON c.Schema.Id = s.ECInstanceId
        ${createWhereClause({ conditions: ["s.Name = 'BisCore'", "c.Name = 'DefinitionContainer'"] })}
      `;

      return queryExecutor.createQueryReader(
        { ecsql: query },
        { restartToken: `${componentName}/${componentId}/is-definition-container-supported` },
      );
    }).pipe(
      catchBeSQLiteInterrupts,
      toArray(),
      map((rows) => rows.length > 0),
    );
  }

  function queryDefinitionContainers({
    categoryIds,
  }: {
    categoryIds: Id64Array;
  }): Observable<{ id: DefinitionContainerId; modelId: Id64String }> {
    return defer(() => {
      // A definition model shares its ID with the definition container it models.
      const DEFINITION_CONTAINERS_CTE = "DefinitionContainers";
      const ctes = [
        `
          ${DEFINITION_CONTAINERS_CTE}(ECInstanceId, ModelId) AS (
            SELECT
              dc.ECInstanceId,
              dc.Model.Id
            FROM ${CLASS_NAMES.DefinitionContainer} dc
            JOIN ${categoryClass} c ON c.Model.Id = dc.ECInstanceId
            JOIN IdSet(?) categoryIdSet ON c.ECInstanceId = categoryIdSet.id
            WHERE NOT dc.IsPrivate

            UNION ALL

            SELECT
              pdc.ECInstanceId,
              pdc.Model.Id
            FROM
              ${DEFINITION_CONTAINERS_CTE} cdc
              JOIN ${CLASS_NAMES.DefinitionContainer} pdc ON pdc.ECInstanceId = cdc.ModelId
            WHERE NOT pdc.IsPrivate
          )
        `,
      ];
      const definitionsQuery = `
        SELECT
          dc.ECInstanceId id,
          dc.ModelId modelId
          FROM ${DEFINITION_CONTAINERS_CTE} dc
      `;
      return queryExecutor.createQueryReader(
        { ctes, ecsql: definitionsQuery, bindings: [{ type: "idset", value: categoryIds }] },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${componentName}/${componentId}/definition-containers`,
        },
      );
    }).pipe(
      catchBeSQLiteInterrupts,
      map((row) => {
        return { id: row.id, modelId: row.modelId };
      }),
    );
  }

  function getCategoryData() {
    cachedData.categoriesData ??= forkJoin({
      categoriesContainingNonExcludedElements: baseIdsProvider.getCategoriesContainingNonExcludedElements(),
      allCategories: baseIdsProvider.getAllCategoriesOfElements(),
      categorySubCategoriesMap: baseIdsProvider.getCategorySubCategoriesMap(),
    })
      .pipe(
        mergeMap(({ categoriesContainingNonExcludedElements, allCategories, categorySubCategoriesMap }) =>
          queryCategories().pipe(
            map((queriedCategory) => ({
              modelId: queriedCategory.modelId,
              parentDefinitionContainerExists: queriedCategory.parentDefinitionContainerExists,
              id: queriedCategory.id,
              subCategoryChildCount: categorySubCategoriesMap.get(queriedCategory.id)?.length ?? 0,
              hasElementsFromNonExcludedClasses: categoriesContainingNonExcludedElements.has(queriedCategory.id),
              hasElements: allCategories.has(queriedCategory.id),
            })),
          ),
        ),
        reduce(
          (acc, processedCategory) => {
            const modelCategories = getOrCreate({
              map: acc.categoriesGroupedByModel,
              key: processedCategory.modelId,
              createFunc: () => ({
                parentDefinitionContainerExists: processedCategory.parentDefinitionContainerExists,
                childCategories: new Array<CachedCategoryInfo>(),
              }),
            });
            modelCategories.childCategories.push({
              id: processedCategory.id,
              subCategoryChildCount: processedCategory.subCategoryChildCount,
              hasElements: processedCategory.hasElements,
              hasElementsFromNonExcludedClasses: processedCategory.hasElementsFromNonExcludedClasses,
            });
            acc.categoriesWithModel.set(processedCategory.id, {
              modelId: processedCategory.modelId,
              isDefinitionContainer: processedCategory.parentDefinitionContainerExists,
            });
            return acc;
          },
          {
            categoriesGroupedByModel: new Map<ModelId, CategoriesInfo>(),
            categoriesWithModel: new Map<CategoryId, { modelId: ModelId; isDefinitionContainer: boolean }>(),
          },
        ),
      )
      .pipe(
        tap(() => {
          categoriesDataLoaded = true;
        }),
        shareReplay(),
      );
    return cachedData.categoriesData;
  }

  function getDefinitionContainersInfo() {
    cachedData.definitionContainersData ??= forkJoin({
      isDefinitionContainerSupported: getIsDefinitionContainerSupported(),
      cachedCategoryData: getCategoryData(),
    })
      .pipe(
        mergeMap(({ isDefinitionContainerSupported, cachedCategoryData }) => {
          const definitionContainersInfo = new Map<DefinitionContainerId, DefinitionContainerInfo>();
          const categoriesGroupedByModel = cachedCategoryData.categoriesGroupedByModel;
          if (!isDefinitionContainerSupported || categoriesGroupedByModel.size === 0) {
            return of(definitionContainersInfo);
          }
          return queryDefinitionContainers({ categoryIds: [...cachedCategoryData.categoriesWithModel.keys()] }).pipe(
            reduce((acc, queriedDefinitionContainer) => {
              const modelCategoriesInfo = categoriesGroupedByModel.get(queriedDefinitionContainer.id);
              const childCategories = modelCategoriesInfo?.childCategories ?? [];
              acc.set(queriedDefinitionContainer.id, {
                childCategories,
                modelId: queriedDefinitionContainer.modelId,
                childDefinitionContainers: [],
                parentDefinitionContainerExists: false,
                hasElements: childCategories.some((category) => category.hasElements),
              });
              return acc;
            }, definitionContainersInfo),
            map((result) => {
              for (const [definitionContainerId, definitionContainerInfo] of result) {
                const parentDefinitionContainer = result.get(definitionContainerInfo.modelId);
                if (parentDefinitionContainer === undefined) {
                  continue;
                }
                parentDefinitionContainer.childDefinitionContainers.push({
                  id: definitionContainerId,
                  hasElements: definitionContainerInfo.hasElements,
                });
                definitionContainerInfo.parentDefinitionContainerExists = true;
                setDefinitionContainerParentInfo({
                  parentDefinitionContainerId: definitionContainerInfo.modelId,
                  definitionContainersInfo: result,
                  hasElements: definitionContainerInfo.hasElements,
                });
              }

              return result;
            }),
          );
        }),
      )
      .pipe(
        tap(() => {
          defContainersDataLoaded = true;
        }),
        shareReplay(),
      );
    return cachedData.definitionContainersData;
  }

  function setDefinitionContainerParentInfo({
    parentDefinitionContainerId,
    definitionContainersInfo,
    hasElements,
  }: {
    parentDefinitionContainerId: DefinitionContainerId;
    definitionContainersInfo: Map<DefinitionContainerId, DefinitionContainerInfo>;
    hasElements: boolean;
  }) {
    const parentDefinitionContainerInfo = definitionContainersInfo.get(parentDefinitionContainerId);
    if (parentDefinitionContainerInfo === undefined) {
      return;
    }
    parentDefinitionContainerInfo.hasElements ||= hasElements;
    setDefinitionContainerParentInfo({
      parentDefinitionContainerId: parentDefinitionContainerInfo.modelId,
      definitionContainersInfo,
      hasElements,
    });
  }

  function getDefinitionContainersSearchPaths({
    definitionContainerIds,
  }: {
    definitionContainerIds: Id64Arg;
  }): Observable<HierarchyNodeIdentifiersPath> {
    return getDefinitionContainersInfo().pipe(
      mergeMap((definitionContainersInfo) =>
        fromWithRelease({ source: definitionContainerIds, releaseOnCount: 200 }).pipe(
          mergeMap((definitionContainerId) => {
            let entry = definitionContainerInstanceKeyPaths.get(definitionContainerId);
            if (!entry) {
              const definitionContainerInfo = definitionContainersInfo.get(definitionContainerId);
              if (definitionContainerInfo === undefined) {
                entry = of([]).pipe(shareReplay());
                definitionContainerInstanceKeyPaths.set(definitionContainerId, entry);
                return entry;
              }
              const instanceKey = { id: definitionContainerId, className: CLASS_NAMES.DefinitionContainer };
              if (!definitionContainerInfo.parentDefinitionContainerExists) {
                entry = of([instanceKey]).pipe(shareReplay());
                definitionContainerInstanceKeyPaths.set(definitionContainerId, entry);
                return entry;
              }
              entry = getDefinitionContainersSearchPaths({
                definitionContainerIds: definitionContainerInfo.modelId,
              }).pipe(
                map((pathToParentDefinitionContainer) => [...pathToParentDefinitionContainer, instanceKey]),
                shareReplay(),
              );
              definitionContainerInstanceKeyPaths.set(definitionContainerId, entry);
            }
            return entry;
          }),
        ),
      ),
    );
  }

  function getSearchPathsUpToRootCategory({
    categoryId,
  }: {
    categoryId: Id64String;
  }): Observable<HierarchyNodeIdentifiersPath> {
    return getCategoryData().pipe(
      mergeMap(({ categoriesWithModel, categoriesGroupedByModel }) => {
        if (categoriesGroupedByModel.size === 0) {
          return EMPTY;
        }
        if (categoriesWithModel.size === 0) {
          return EMPTY;
        }
        const entry = categoriesWithModel.get(categoryId);
        if (!entry) {
          return EMPTY;
        }
        if (!entry.isDefinitionContainer) {
          return of([]);
        }
        return getDefinitionContainersSearchPaths({ definitionContainerIds: entry.modelId });
      }),
    );
  }

  function getIsDefinitionContainerSupported(): Observable<boolean> {
    cachedData.isDefinitionContainerSupported ??= queryIsDefinitionContainersSupported().pipe(shareReplay());
    return cachedData.isDefinitionContainerSupported;
  }

  return {
    ...baseIdsProvider,
    async preloadDefinitionContainers(): Promise<void> {
      if (cachedData.definitionContainersData !== undefined) {
        return;
      }
      try {
        await toVoidPromise(getDefinitionContainersInfo());
      } catch {}
    },
    async getDirectChildDefinitionContainersAndCategories({
      parentDefinitionContainerIds,
      includeEmpty,
    }: {
      parentDefinitionContainerIds: Id64Arg;
      includeEmpty?: boolean;
    }): Promise<{ categories: CachedCategoryInfo[]; definitionContainers: Array<DefinitionContainerId> }> {
      return firstValueFrom(
        getDefinitionContainersInfo().pipe(
          mergeMap((definitionContainersInfo) =>
            from(Id64.iterable(parentDefinitionContainerIds)).pipe(
              reduce(
                (acc, parentDefinitionContainerId) => {
                  const parentDefinitionContainerInfo = definitionContainersInfo.get(parentDefinitionContainerId);
                  if (parentDefinitionContainerInfo !== undefined) {
                    applyElementsFilter(parentDefinitionContainerInfo.childDefinitionContainers, includeEmpty).forEach(
                      (dc) => acc.definitionContainers.push(dc.id),
                    );
                    applyElementsFilter(parentDefinitionContainerInfo.childCategories, includeEmpty).forEach(
                      (category) => acc.categories.push(category),
                    );
                  }
                  return acc;
                },
                { definitionContainers: new Array<Id64String>(), categories: new Array<CachedCategoryInfo>() },
              ),
            ),
          ),
        ),
      );
    },
    getSubCategoriesSearchPaths({
      subCategoryIds,
    }: {
      subCategoryIds: Id64Arg;
    }): AsyncIterableIterator<HierarchyNodeIdentifiersPath> {
      if (Id64.sizeOf(subCategoryIds) === 0) {
        return (async function* () {})();
      }
      return eachValueFrom(
        from(baseIdsProvider.getSubCategoryCategories({ subCategoryIds })).pipe(
          mergeMap((categorySubCategories) => categorySubCategories.entries()),
          mergeMap(([categoryId, categorySubCategories]) => {
            return getSearchPathsUpToRootCategory({ categoryId }).pipe(
              mergeMap((pathsUpToCategory) =>
                fromWithRelease({ source: categorySubCategories, releaseOnCount: 300 }).pipe(
                  map((subCategoryId) => [
                    ...pathsUpToCategory,
                    { id: categoryId, className: categoryClass },
                    { id: subCategoryId, className: CLASS_NAMES.SubCategory },
                  ]),
                ),
              ),
            );
          }),
        ),
      );
    },
    getDefinitionContainersSearchPaths: (props) => eachValueFrom(getDefinitionContainersSearchPaths(props)),
    getSearchPathsUpToRootCategory: async (props) =>
      firstValueFrom(getSearchPathsUpToRootCategory(props).pipe(defaultIfEmpty([]))),
    async getAllDefinitionContainersAndCategories(props?: {
      includeEmpty?: boolean;
    }): Promise<{ categories: Array<CategoryId>; definitionContainers: Array<DefinitionContainerId> }> {
      return firstValueFrom(
        forkJoin({
          categories: getCategoryData().pipe(
            mergeMap(({ categoriesGroupedByModel }) => categoriesGroupedByModel.values()),
            reduce((acc, modelCategoriesInfo) => {
              applyElementsFilter(modelCategoriesInfo.childCategories, props?.includeEmpty).forEach((categoryInfo) =>
                acc.push(categoryInfo.id),
              );
              return acc;
            }, new Array<Id64String>()),
          ),
          definitionContainers: getDefinitionContainersInfo().pipe(
            mergeMap((definitionContainersInfo) => definitionContainersInfo.entries()),
            reduce((acc, [definitionContainerId, definitionContainerInfo]) => {
              if (!!props?.includeEmpty || definitionContainerInfo.hasElements) {
                acc.push(definitionContainerId);
              }
              return acc;
            }, new Array<Id64String>()),
          ),
        }),
      );
    },
    async getRootDefinitionContainersAndCategories(props?: {
      includeEmpty?: boolean;
    }): Promise<{ categories: CachedCategoryInfo[]; definitionContainers: Array<DefinitionContainerId> }> {
      return firstValueFrom(
        forkJoin({
          categories: getCategoryData().pipe(
            mergeMap(({ categoriesGroupedByModel }) => categoriesGroupedByModel.values()),
            reduce((acc, modelCategoriesInfo) => {
              if (!modelCategoriesInfo.parentDefinitionContainerExists) {
                applyElementsFilter(modelCategoriesInfo.childCategories, props?.includeEmpty).forEach((categoryInfo) =>
                  acc.push(categoryInfo),
                );
              }
              return acc;
            }, new Array<CachedCategoryInfo>()),
          ),
          definitionContainers: getDefinitionContainersInfo().pipe(
            mergeMap((definitionContainersInfo) => definitionContainersInfo.entries()),
            reduce((acc, [definitionContainerId, definitionContainerInfo]) => {
              if (
                !definitionContainerInfo.parentDefinitionContainerExists &&
                (!!props?.includeEmpty || definitionContainerInfo.hasElements)
              ) {
                acc.push(definitionContainerId);
              }
              return acc;
            }, new Array<Id64String>()),
          ),
        }),
      );
    },
    get isDataLoaded(): boolean {
      return defContainersDataLoaded && categoriesDataLoaded;
    },
    getIsDefinitionContainerSupported: async () => firstValueFrom(getIsDefinitionContainerSupported()),
  };
}

function applyElementsFilter<T extends { hasElements: boolean }>(list: T[], includeEmpty: boolean | undefined): T[] {
  return includeEmpty ? list : list.filter(({ hasElements }) => !!hasElements);
}
