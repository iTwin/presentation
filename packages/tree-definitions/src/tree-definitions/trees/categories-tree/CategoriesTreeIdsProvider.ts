/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, forkJoin, from, map, mergeMap, of, reduce, shareReplay, tap, toArray } from "rxjs";
import { Guid, Id64 } from "@itwin/core-bentley";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { BaseIdsProviderImpl } from "../../shared/idsProviders/BaseIdsProvider.js";
import { fromWithRelease, toVoidPromise } from "../../shared/Rxjs.js";
import { catchBeSQLiteInterrupts } from "../../shared/TreeErrors.js";
import { createWhereClause, getClassesByView, getOrCreate } from "../../shared/Utils.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Arg, Id64Array, Id64String } from "@itwin/core-bentley";
import type { HierarchyNodeIdentifiersPath, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC } from "@itwin/presentation-shared";
import type { BaseIdsProviderImplProps } from "../../shared/idsProviders/BaseIdsProvider.js";
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

/** @internal */
export interface CachedCategoryInfo {
  id: CategoryId;
  subCategoryChildCount: number;
  hasElements: boolean;
  hasElementsFromNonExcludedClasses: boolean;
}

interface CategoriesTreeIdsProviderProps extends BaseIdsProviderImplProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  type: "2d" | "3d";
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
}

type DefinitionContainersData = Map<DefinitionContainerId, DefinitionContainerInfo>;

interface CategoriesData {
  categoriesGroupedByModel: Map<ModelId, CategoriesInfo>;
  categoriesWithModel: Map<CategoryId, { modelId: ModelId; isDefinitionContainer: boolean }>;
}

/** @internal */
export class CategoriesTreeIdsProvider extends BaseIdsProviderImpl {
  #cachedData: {
    definitionContainersData: Observable<DefinitionContainersData> | undefined;
    categoriesData: Observable<CategoriesData> | undefined;
    isDefinitionContainerSupported: Observable<boolean> | undefined;
  } = { definitionContainersData: undefined, categoriesData: undefined, isDefinitionContainerSupported: undefined };
  #definitionContainerInstanceKeyPaths: Map<DefinitionContainerId, Observable<HierarchyNodeIdentifiersPath>> =
    new Map();
  #categoryClass: EC.FullClassNameDotNotation;
  #queryExecutor: LimitingECSqlQueryExecutor;
  #defContainersDataLoaded = false;
  #categoriesDataLoaded = false;
  #componentId: GuidString;
  #componentName: string;

  constructor(props: CategoriesTreeIdsProviderProps) {
    super(props);
    this.#queryExecutor = props.queryExecutor;
    const { categoryClass } = getClassesByView(props.type);
    this.#categoryClass = categoryClass;
    this.#componentId = Guid.createValue();
    this.#componentName = "CategoriesTreeIdsProvider";
  }

  private queryCategories(): Observable<{
    id: CategoryId;
    modelId: Id64String;
    parentDefinitionContainerExists: boolean;
  }> {
    return this.getIsDefinitionContainerSupported().pipe(
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
              ${this.#categoryClass} this
              JOIN ${CLASS_NAMES.Model} m ON m.ECInstanceId = this.Model.Id
            ${createWhereClause({ conditions: ["NOT this.IsPrivate", "NOT m.IsPrivate OR m.ECClassId IS (BisCore.DictionaryModel)"] })}
            GROUP BY this.ECInstanceId
          `;
          return this.#queryExecutor.createQueryReader(
            { ecsql: categoriesQuery },
            {
              rowFormat: "ECSqlPropertyNames",
              limit: "unbounded",
              restartToken: `${this.#componentName}/${this.#componentId}/categories`,
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

  private queryIsDefinitionContainersSupported(): Observable<boolean> {
    return defer(() => {
      const query = `
        SELECT
          1
        FROM
          ECDbMeta.ECSchemaDef s
          JOIN ECDbMeta.ECClassDef c ON c.Schema.Id = s.ECInstanceId
        ${createWhereClause({ conditions: ["s.Name = 'BisCore'", "c.Name = 'DefinitionContainer'"] })}
      `;

      return this.#queryExecutor.createQueryReader(
        { ecsql: query },
        { restartToken: `${this.#componentName}/${this.#componentId}/is-definition-container-supported` },
      );
    }).pipe(
      catchBeSQLiteInterrupts,
      toArray(),
      map((rows) => rows.length > 0),
    );
  }

  private queryDefinitionContainers({
    categoryIds,
  }: {
    categoryIds: Id64Array;
  }): Observable<{ id: DefinitionContainerId; modelId: Id64String }> {
    return defer(() => {
      // DefinitionModel ECInstanceId will always be the same as modeled DefinitionContainer ECInstanceId, if this wasn't the case, we would need to do something like:
      //  JOIN BisCore.DefinitionModel dm ON dm.ECInstanceId = ${modelIdAccessor}
      //  JOIN BisCore.DefinitionModelBreaksDownDefinitionContainer dr ON dr.SourceECInstanceId = dm.ECInstanceId
      //  JOIN BisCore.DefinitionContainer dc ON dc.ECInstanceId = dr.TargetECInstanceId
      const DEFINITION_CONTAINERS_CTE = "DefinitionContainers";
      const ctes = [
        `
          ${DEFINITION_CONTAINERS_CTE}(ECInstanceId, ModelId) AS (
            SELECT
              dc.ECInstanceId,
              dc.Model.Id
            FROM ${CLASS_NAMES.DefinitionContainer} dc
            JOIN ${this.#categoryClass} c ON c.Model.Id = dc.ECInstanceId
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
      return this.#queryExecutor.createQueryReader(
        { ctes, ecsql: definitionsQuery, bindings: [{ type: "idset", value: categoryIds }] },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${this.#componentName}/${this.#componentId}/definition-containers`,
        },
      );
    }).pipe(
      catchBeSQLiteInterrupts,
      map((row) => {
        return { id: row.id, modelId: row.modelId };
      }),
    );
  }

  private getCategoryData() {
    this.#cachedData.categoriesData ??= forkJoin({
      categoriesContainingNonExcludedElements: this.getCategoriesContainingNonExcludedElements(),
      allCategories: this.getAllCategoriesOfElements(),
      categorySubCategoriesMap: this.getCategorySubCategoriesMap(),
    })
      .pipe(
        mergeMap(({ categoriesContainingNonExcludedElements, allCategories, categorySubCategoriesMap }) =>
          this.queryCategories().pipe(
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
          this.#categoriesDataLoaded = true;
        }),
        shareReplay(),
      );
    return this.#cachedData.categoriesData;
  }

  private getDefinitionContainersInfo() {
    this.#cachedData.definitionContainersData ??= forkJoin({
      isDefinitionContainerSupported: this.getIsDefinitionContainerSupported(),
      cachedCategoryData: this.getCategoryData(),
    })
      .pipe(
        mergeMap(({ isDefinitionContainerSupported, cachedCategoryData }) => {
          const definitionContainersInfo = new Map<DefinitionContainerId, DefinitionContainerInfo>();
          const categoriesGroupedByModel = cachedCategoryData.categoriesGroupedByModel;
          if (!isDefinitionContainerSupported || categoriesGroupedByModel.size === 0) {
            return of(definitionContainersInfo);
          }
          return this.queryDefinitionContainers({
            categoryIds: [...cachedCategoryData.categoriesWithModel.keys()],
          }).pipe(
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
                this.setDefinitionContainerParentInfo({
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
          this.#defContainersDataLoaded = true;
        }),
        shareReplay(),
      );
    return this.#cachedData.definitionContainersData;
  }

  private setDefinitionContainerParentInfo({
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
    this.setDefinitionContainerParentInfo({
      parentDefinitionContainerId: parentDefinitionContainerInfo.modelId,
      definitionContainersInfo,
      hasElements,
    });
  }

  public async preloadDefinitionContainers(): Promise<void> {
    if (this.#cachedData.definitionContainersData !== undefined) {
      return;
    }
    try {
      await toVoidPromise(this.getDefinitionContainersInfo());
    } catch {}
  }

  public getDirectChildDefinitionContainersAndCategories({
    parentDefinitionContainerIds,
    includeEmpty,
  }: {
    parentDefinitionContainerIds: Id64Arg;
    includeEmpty?: boolean;
  }): Observable<{ categories: CachedCategoryInfo[]; definitionContainers: Array<DefinitionContainerId> }> {
    return this.getDefinitionContainersInfo().pipe(
      mergeMap((definitionContainersInfo) =>
        from(Id64.iterable(parentDefinitionContainerIds)).pipe(
          reduce(
            (acc, parentDefinitionContainerId) => {
              const parentDefinitionContainerInfo = definitionContainersInfo.get(parentDefinitionContainerId);
              if (parentDefinitionContainerInfo !== undefined) {
                applyElementsFilter(parentDefinitionContainerInfo.childDefinitionContainers, includeEmpty).forEach(
                  (dc) => acc.definitionContainers.push(dc.id),
                );
                applyElementsFilter(parentDefinitionContainerInfo.childCategories, includeEmpty).forEach((category) =>
                  acc.categories.push(category),
                );
              }
              return acc;
            },
            { definitionContainers: new Array<Id64String>(), categories: new Array<CachedCategoryInfo>() },
          ),
        ),
      ),
    );
  }

  public getSubCategoriesSearchPaths({
    subCategoryIds,
  }: {
    subCategoryIds: Id64Arg;
  }): Observable<HierarchyNodeIdentifiersPath> {
    if (Id64.sizeOf(subCategoryIds) === 0) {
      return EMPTY;
    }
    return this.getSubCategoryCategories({ subCategoryIds }).pipe(
      mergeMap((categorySubCategories) => categorySubCategories.entries()),
      mergeMap(([categoryId, categorySubCategories]) => {
        return this.getSearchPathsUpToRootCategory({ categoryId }).pipe(
          mergeMap((pathsUpToCategory) =>
            fromWithRelease({ source: categorySubCategories, releaseOnCount: 300 }).pipe(
              map((subCategoryId) => [
                ...pathsUpToCategory,
                { id: categoryId, className: this.#categoryClass },
                { id: subCategoryId, className: CLASS_NAMES.SubCategory },
              ]),
            ),
          ),
        );
      }),
    );
  }

  public getDefinitionContainersSearchPaths({
    definitionContainerIds,
  }: {
    definitionContainerIds: Id64Arg;
  }): Observable<HierarchyNodeIdentifiersPath> {
    return this.getDefinitionContainersInfo().pipe(
      mergeMap((definitionContainersInfo) =>
        fromWithRelease({ source: definitionContainerIds, releaseOnCount: 200 }).pipe(
          mergeMap((definitionContainerId) => {
            let entry = this.#definitionContainerInstanceKeyPaths.get(definitionContainerId);
            if (!entry) {
              const definitionContainerInfo = definitionContainersInfo.get(definitionContainerId);
              if (definitionContainerInfo === undefined) {
                entry = of([]).pipe(shareReplay());
                this.#definitionContainerInstanceKeyPaths.set(definitionContainerId, entry);
                return entry;
              }
              const instanceKey = { id: definitionContainerId, className: CLASS_NAMES.DefinitionContainer };
              if (!definitionContainerInfo.parentDefinitionContainerExists) {
                entry = of([instanceKey]).pipe(shareReplay());
                this.#definitionContainerInstanceKeyPaths.set(definitionContainerId, entry);
                return entry;
              }
              entry = this.getDefinitionContainersSearchPaths({
                definitionContainerIds: definitionContainerInfo.modelId,
              }).pipe(
                map((pathToParentDefinitionContainer) => [...pathToParentDefinitionContainer, instanceKey]),
                shareReplay(),
              );
              this.#definitionContainerInstanceKeyPaths.set(definitionContainerId, entry);
            }
            return entry;
          }),
        ),
      ),
    );
  }

  public getSearchPathsUpToRootCategory({
    categoryId,
  }: {
    categoryId: Id64String;
  }): Observable<HierarchyNodeIdentifiersPath> {
    return this.getCategoryData().pipe(
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
        return this.getDefinitionContainersSearchPaths({ definitionContainerIds: entry.modelId });
      }),
    );
  }

  public getAllDefinitionContainersAndCategories(props?: {
    includeEmpty?: boolean;
  }): Observable<{ categories: Array<CategoryId>; definitionContainers: Array<DefinitionContainerId> }> {
    return forkJoin({
      categories: this.getCategoryData().pipe(
        mergeMap(({ categoriesGroupedByModel }) => categoriesGroupedByModel.values()),
        reduce((acc, modelCategoriesInfo) => {
          applyElementsFilter(modelCategoriesInfo.childCategories, props?.includeEmpty).forEach((categoryInfo) =>
            acc.push(categoryInfo.id),
          );
          return acc;
        }, new Array<Id64String>()),
      ),
      definitionContainers: this.getDefinitionContainersInfo().pipe(
        mergeMap((definitionContainersInfo) => definitionContainersInfo.entries()),
        reduce((acc, [definitionContainerId, definitionContainerInfo]) => {
          if (!!props?.includeEmpty || definitionContainerInfo.hasElements) {
            acc.push(definitionContainerId);
          }
          return acc;
        }, new Array<Id64String>()),
      ),
    });
  }

  public getRootDefinitionContainersAndCategories(props?: {
    includeEmpty?: boolean;
  }): Observable<{ categories: CachedCategoryInfo[]; definitionContainers: Array<DefinitionContainerId> }> {
    return forkJoin({
      categories: this.getCategoryData().pipe(
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
      definitionContainers: this.getDefinitionContainersInfo().pipe(
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
    });
  }

  public get isDataLoaded(): boolean {
    return this.#defContainersDataLoaded && this.#categoriesDataLoaded;
  }

  public getIsDefinitionContainerSupported(): Observable<boolean> {
    this.#cachedData.isDefinitionContainerSupported ??= this.queryIsDefinitionContainersSupported().pipe(shareReplay());
    return this.#cachedData.isDefinitionContainerSupported;
  }
}

function applyElementsFilter<T extends { hasElements: boolean }>(list: T[], includeEmpty: boolean | undefined): T[] {
  return includeEmpty ? list : list.filter(({ hasElements }) => !!hasElements);
}
