/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, filter, from, identity, map, mergeMap, of, reduce, shareReplay, tap } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { fromWithRelease, toVoidPromise } from "../Rxjs.js";
import { getOrCreate } from "../Utils.js";
import { ElementModelCategoriesCache } from "./ElementModelCategoriesCache.js";
import { ModeledElementsCache } from "./ModeledElementsCache.js";
import { SubCategoriesCache } from "./SubCategoriesCache.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Arg, Id64Set, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC, Props } from "@itwin/presentation-shared";
import type { CategoryId, ElementId, ModelId, SubCategoryId } from "../Types.js";

/** @internal */
export interface BaseIdsCacheProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  elementClassName: EC.FullClassNameDotNotation;
  type: "2d" | "3d";
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
}

/** @internal */
export class BaseIdsCache {
  #queryExecutor: LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  readonly #subCategoriesCache: SubCategoriesCache;
  #elementClassName: EC.FullClassNameDotNotation;
  #modeledElementsCache: Observable<ModeledElementsCache> | undefined;
  #modeledElementsLoaded = false;
  readonly #elementModelCategoriesCache: ElementModelCategoriesCache;
  #categoryModelsInfoWithoutSubModels:
    | Observable<
        Map<CategoryId, { id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }[]>
      >
    | undefined;
  #subModelsWithNonExcludedElements: Observable<Set<ModelId>> | undefined;

  constructor(props: BaseIdsCacheProps) {
    this.#queryExecutor = props.queryExecutor;
    this.#elementClassName = props.elementClassName;
    this.#componentId = Guid.createValue();
    this.#subCategoriesCache = new SubCategoriesCache({
      queryExecutor: this.#queryExecutor,
      componentId: this.#componentId,
    });
    this.#elementModelCategoriesCache = new ElementModelCategoriesCache({
      queryExecutor: this.#queryExecutor,
      componentId: this.#componentId,
      elementClassName: props.elementClassName,
      excludedElementClassNames: props.excludedElementClassNames,
    });
  }

  private getModeledElementsInfo(): ReturnType<ModeledElementsCache["getModeledElementsInfo"]> {
    this.#modeledElementsCache ??= this.getAllModels().pipe(
      map(
        (allModels) =>
          new ModeledElementsCache({
            queryExecutor: this.#queryExecutor,
            componentId: this.#componentId,
            elementClassName: this.#elementClassName,
            nonEmptyModelIds: allModels,
          }),
      ),
      shareReplay(),
    );
    return this.#modeledElementsCache.pipe(
      mergeMap((modeledElementsCache) => modeledElementsCache.getModeledElementsInfo()),
      tap(() => {
        this.#modeledElementsLoaded = true;
      }),
    );
  }

  public async preloadModeledElements(): Promise<void> {
    if (this.#modeledElementsCache !== undefined) {
      return;
    }
    try {
      await toVoidPromise(this.getModeledElementsInfo());
    } catch {}
  }

  public async preloadElementModelCategories(): Promise<void> {
    if (this.#elementModelCategoriesCache.cachedDataDefined()) {
      return;
    }
    try {
      await toVoidPromise(this.#elementModelCategoriesCache.getCachedData());
    } catch {}
  }

  public getAllSubModels(props?: { excludeIfOnlyExcludedClasses?: boolean }): Observable<Id64Set> {
    if (!props?.excludeIfOnlyExcludedClasses) {
      return this.getModeledElementsInfo().pipe(map(({ allSubModels }) => allSubModels));
    }
    this.#subModelsWithNonExcludedElements ??= this.getModeledElementsInfo().pipe(
      mergeMap(({ allSubModels }) => {
        if (allSubModels.size === 0) {
          return of(allSubModels);
        }
        return this.#elementModelCategoriesCache.getCachedData().pipe(
          map(({ modelsCategoriesInfo }) => {
            const result = new Set<ElementId>();
            for (const subModelId of allSubModels) {
              const modelInfo = modelsCategoriesInfo.get(subModelId);
              if (modelInfo?.hasNonExcludedElements) {
                result.add(subModelId);
              }
            }
            return result;
          }),
        );
      }),
      shareReplay(),
    );
    return this.#subModelsWithNonExcludedElements;
  }

  // ElementModelCategoriesCache methods

  public elementModelCategoriesLoaded(): boolean {
    return this.#elementModelCategoriesCache.cachedDataLoaded();
  }

  public modeledElementsLoaded(): boolean {
    return this.#modeledElementsLoaded;
  }

  public getAllModels(): Observable<Array<ModelId>> {
    return this.#elementModelCategoriesCache
      .getCachedData()
      .pipe(map(({ modelsCategoriesInfo }) => [...modelsCategoriesInfo.keys()]));
  }

  public getPlanProjectionModels(): Observable<Id64Set> {
    return this.#elementModelCategoriesCache
      .getCachedData()
      .pipe(map(({ planProjectionModels }) => planProjectionModels));
  }

  public getCategories({ modelId }: { modelId: Id64String }): Observable<Id64Set> {
    return this.#elementModelCategoriesCache.getCachedData().pipe(
      map(({ modelsCategoriesInfo }) => {
        const modelInfo = modelsCategoriesInfo.get(modelId);
        return modelInfo?.categoriesOfTopMostNonExcludedElements ?? new Set();
      }),
    );
  }

  public getCategoriesContainingNonExcludedElements(): Observable<Id64Set> {
    return this.#elementModelCategoriesCache
      .getCachedData()
      .pipe(map(({ categoriesContainingNonExcludedElements }) => categoriesContainingNonExcludedElements));
  }

  public getAllCategoriesOfElements(): Observable<Id64Set> {
    return this.#elementModelCategoriesCache.getCachedData().pipe(map(({ allCategories }) => allCategories));
  }

  private getCategoryModelsInfoWithoutSubModels(): Observable<
    Map<CategoryId, { id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }[]>
  > {
    this.#categoryModelsInfoWithoutSubModels ??= this.getAllSubModels().pipe(
      mergeMap((allSubModels) =>
        allSubModels.size === 0
          ? this.#elementModelCategoriesCache.getCachedData().pipe(map(({ categoryModelsInfo }) => categoryModelsInfo))
          : this.#elementModelCategoriesCache.getCachedData().pipe(
              mergeMap(({ categoryModelsInfo }) => categoryModelsInfo.entries()),
              reduce((acc, [key, modelInfos]) => {
                const newModelInfos = modelInfos.filter(({ id }) => !allSubModels.has(id));
                if (newModelInfos.length > 0) {
                  acc.set(key, newModelInfos);
                }
                return acc;
              }, new Map<CategoryId, { id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }[]>()),
            ),
      ),
      shareReplay(),
    );
    return this.#categoryModelsInfoWithoutSubModels;
  }

  public getModels({
    categoryId,
    excludeSubModels,
    includeOnlyTopMostElementCategory,
    excludeIfOnlyExcludedClasses,
  }: {
    categoryId: Id64String;
    excludeSubModels?: boolean;
    includeOnlyTopMostElementCategory?: boolean;
    excludeIfOnlyExcludedClasses?: boolean;
  }): Observable<ModelId> {
    let getCategoryModelsInfo = () =>
      this.#elementModelCategoriesCache.getCachedData().pipe(map(({ categoryModelsInfo }) => categoryModelsInfo));

    if (excludeSubModels) {
      getCategoryModelsInfo = () => this.getCategoryModelsInfoWithoutSubModels();
    }
    return getCategoryModelsInfo().pipe(
      mergeMap((categoryModelsInfo) => {
        const categoryModels = categoryModelsInfo.get(categoryId);
        if (!categoryModels) {
          return EMPTY;
        }
        return from(categoryModels);
      }),
      includeOnlyTopMostElementCategory
        ? filter(({ categoryIsOfTopMostElement }) => categoryIsOfTopMostElement)
        : identity,
      excludeIfOnlyExcludedClasses
        ? filter(({ hasNonExcludedTopMostElements }) => hasNonExcludedTopMostElements)
        : identity,
      map(({ id }) => id),
    );
  }

  // SubCategoriesCache methods

  public getCategorySubCategoriesMap(): Observable<Map<CategoryId, SubCategoryId[]>> {
    return this.#subCategoriesCache
      .getSubCategoriesInfo()
      .pipe(map(({ categorySubCategories }) => categorySubCategories));
  }

  public getSubCategoryCategories({
    subCategoryIds,
  }: {
    subCategoryIds: Id64Arg;
  }): Observable<Map<CategoryId, SubCategoryId[]>> {
    return this.#subCategoriesCache.getSubCategoriesInfo().pipe(
      mergeMap(({ subCategoryCategories, categorySubCategories }) =>
        fromWithRelease({ source: subCategoryIds, releaseOnCount: 500 }).pipe(
          reduce((acc, subCategoryId) => {
            const categoryId = subCategoryCategories.get(subCategoryId);
            if (categoryId === undefined) {
              return acc;
            }
            const subCategories = categorySubCategories.get(categoryId);
            if (!subCategories || subCategories.length <= 1) {
              return acc;
            }
            const entry = getOrCreate({ map: acc, key: categoryId, createFunc: () => new Array<SubCategoryId>() });
            entry.push(subCategoryId);
            return acc;
          }, new Map<CategoryId, SubCategoryId[]>()),
        ),
      ),
    );
  }
}

/** @internal */
export interface BaseIdsCacheImplProps {
  baseIdsCache: BaseIdsCache;
}

/** @internal */
export class BaseIdsCacheImpl {
  #baseIdsCache: BaseIdsCache;
  constructor(props: BaseIdsCacheImplProps) {
    this.#baseIdsCache = props.baseIdsCache;
  }

  // Implement IBaseIdsCache by re-exporting BaseIdsCache methods

  public elementModelCategoriesLoaded(): ReturnType<BaseIdsCache["elementModelCategoriesLoaded"]> {
    return this.#baseIdsCache.elementModelCategoriesLoaded();
  }

  public modeledElementsLoaded(): ReturnType<BaseIdsCache["modeledElementsLoaded"]> {
    return this.#baseIdsCache.modeledElementsLoaded();
  }

  public getSubCategoryCategories(
    props: Props<BaseIdsCache["getSubCategoryCategories"]>,
  ): ReturnType<BaseIdsCache["getSubCategoryCategories"]> {
    return this.#baseIdsCache.getSubCategoryCategories(props);
  }

  public getAllSubModels(props?: Props<BaseIdsCache["getAllSubModels"]>): ReturnType<BaseIdsCache["getAllSubModels"]> {
    return this.#baseIdsCache.getAllSubModels(props);
  }

  public getCategoriesContainingNonExcludedElements(): ReturnType<
    BaseIdsCache["getCategoriesContainingNonExcludedElements"]
  > {
    return this.#baseIdsCache.getCategoriesContainingNonExcludedElements();
  }

  public getCategories(props: Props<BaseIdsCache["getCategories"]>): ReturnType<BaseIdsCache["getCategories"]> {
    return this.#baseIdsCache.getCategories(props);
  }

  public getModels(props: Props<BaseIdsCache["getModels"]>): ReturnType<BaseIdsCache["getModels"]> {
    return this.#baseIdsCache.getModels(props);
  }

  public getAllCategoriesOfElements(): ReturnType<BaseIdsCache["getAllCategoriesOfElements"]> {
    return this.#baseIdsCache.getAllCategoriesOfElements();
  }

  public getCategorySubCategoriesMap(): ReturnType<BaseIdsCache["getCategorySubCategoriesMap"]> {
    return this.#baseIdsCache.getCategorySubCategoriesMap();
  }
}
