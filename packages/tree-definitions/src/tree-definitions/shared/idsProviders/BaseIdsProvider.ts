/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, filter, firstValueFrom, from, identity, map, mergeMap, of, reduce, shareReplay, tap } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { eachValueFrom, type EC } from "@itwin/presentation-shared";
import { fromWithRelease, toVoidPromise } from "../Rxjs.js";
import { getOrCreate } from "../Utils.js";
import { ElementModelCategoriesProvider } from "./ElementModelCategoriesProvider.js";
import { ModeledElementsProvider } from "./ModeledElementsProvider.js";
import { SubCategoriesProvider } from "./SubCategoriesProvider.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Arg, Id64Array, Id64Set, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { CategoryId, ElementId, ModelId, SubCategoryId } from "../Types.js";

/**
 * Provides model, category, and subcategory IDs for tree hierarchy definitions.
 * Element data is limited to the configured element class and non-private models.
 * @internal
 */
export interface BaseIdsProvider {
  /** Starts loading modeled element data if it has not been requested yet. Loading errors are ignored. */
  preloadModeledElements(): Promise<void>;
  /** Starts loading element model and category data if it has not been requested yet. Loading errors are ignored. */
  preloadElementModelCategories(): Promise<void>;
  /** Returns IDs of elements modeling non-empty sub-models, optionally omitting sub-models with only excluded elements. */
  getAllModeledElements(props?: { excludeIfOnlyExcludedClasses?: boolean }): Promise<Id64Set>;
  /** Indicates whether element model and category data has finished loading. */
  elementModelCategoriesLoaded(): boolean;
  /** Indicates whether modeled element data has finished loading. */
  modeledElementsLoaded(): boolean;
  /** Returns IDs of non-private models containing elements of the configured class, including excluded classes. */
  getAllModels(): Promise<Id64Array>;
  /** Returns IDs of non-private plan projection models containing elements of the configured class. */
  getPlanProjectionModels(): Promise<Id64Set>;
  /** Returns categories containing top-level elements and non-excluded elements in the specified model. */
  getCategories(props: { modelId: Id64String }): Promise<Id64Set>;
  /** Returns category IDs of non-excluded elements. */
  getCategoriesContainingNonExcludedElements(): Promise<Id64Set>;
  /** Returns category IDs of all elements of the configured class, including excluded classes. */
  getAllCategoriesOfElements(): Promise<Id64Set>;
  /** Yields model IDs containing elements in the specified category. Yields no IDs if no models match the filters. */
  getModels(props: {
    categoryId: Id64String;
    /** Omits models that model elements rather than information partitions. */
    excludeSubModels?: boolean;
    /** Requires the category to contain elements without a parent element in the model. */
    includeOnlyTopMostElementCategory?: boolean;
    /** Requires the category to contain both top-level elements and non-excluded elements in the model. */
    excludeIfOnlyExcludedClasses?: boolean;
  }): AsyncIterableIterator<Id64String>;
  /** Returns a mapping from category IDs to their subcategory IDs. */
  getCategorySubCategoriesMap(): Promise<Map<Id64String, Id64Array>>;
  /** Groups the supplied subcategory IDs by parent category, omitting categories with only one subcategory. */
  getSubCategoryCategories(props: { subCategoryIds: Id64Arg }): Promise<Map<Id64String, Id64Array>>;
}

/**
 * Query access and element class filters shared by tree ID providers.
 * @internal
 */
interface BaseIdsProviderProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  elementClassName: EC.FullClassNameDotNotation;
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
}

/**
 * Creates a cached ID provider for elements of the specified class and optional excluded classes.
 * @internal
 */
export function createBaseIdsProvider({
  elementClassName,
  queryExecutor,
  excludedElementClassNames,
}: BaseIdsProviderProps): BaseIdsProvider {
  const componentId: GuidString = Guid.createValue();
  const subCategoriesProvider = new SubCategoriesProvider({ queryExecutor, componentId });
  let modeledElementsProvider: Observable<ModeledElementsProvider> | undefined;
  const elementModelCategoriesProvider = new ElementModelCategoriesProvider({
    queryExecutor,
    componentId,
    elementClassName,
    excludedElementClassNames,
  });
  let modeledElementsLoaded = false;
  let categoryModelsInfoWithoutSubModels:
    | Observable<
        Map<CategoryId, { id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }[]>
      >
    | undefined;
  let subModelsWithNonExcludedElements: Observable<Set<ModelId>> | undefined;

  function getAllModels(): Observable<Array<ModelId>> {
    return elementModelCategoriesProvider
      .getData()
      .pipe(map(({ modelsCategoriesInfo }) => [...modelsCategoriesInfo.keys()]));
  }
  function getModeledElementsData(): ReturnType<ModeledElementsProvider["getData"]> {
    modeledElementsProvider ??= getAllModels().pipe(
      map(
        (allModels) =>
          new ModeledElementsProvider({ queryExecutor, componentId, elementClassName, nonEmptyModelIds: allModels }),
      ),
      shareReplay(),
    );
    return modeledElementsProvider.pipe(
      mergeMap((provider) => provider.getData()),
      tap(() => {
        modeledElementsLoaded = true;
      }),
    );
  }

  function getAllModeledElements(props?: { excludeIfOnlyExcludedClasses?: boolean }): Observable<Id64Set> {
    if (!props?.excludeIfOnlyExcludedClasses) {
      return getModeledElementsData().pipe(map(({ allSubModels }) => allSubModels));
    }
    subModelsWithNonExcludedElements ??= getModeledElementsData().pipe(
      mergeMap(({ allSubModels }) => {
        if (allSubModels.size === 0) {
          return of(allSubModels);
        }
        return elementModelCategoriesProvider.getData().pipe(
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
    return subModelsWithNonExcludedElements;
  }

  function getCategoryModelsInfoWithoutSubModels(): Observable<
    Map<CategoryId, { id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }[]>
  > {
    categoryModelsInfoWithoutSubModels ??= getAllModeledElements().pipe(
      mergeMap((allSubModels) =>
        allSubModels.size === 0
          ? elementModelCategoriesProvider.getData().pipe(map(({ categoryModelsInfo }) => categoryModelsInfo))
          : elementModelCategoriesProvider.getData().pipe(
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
    return categoryModelsInfoWithoutSubModels;
  }

  return {
    async preloadModeledElements(): Promise<void> {
      if (modeledElementsProvider !== undefined) {
        return;
      }
      try {
        await toVoidPromise(getModeledElementsData());
      } catch {}
    },
    async preloadElementModelCategories(): Promise<void> {
      if (elementModelCategoriesProvider.isDataDefined) {
        return;
      }
      try {
        await toVoidPromise(elementModelCategoriesProvider.getData());
      } catch {}
    },
    getAllModeledElements: async (props) => firstValueFrom(getAllModeledElements(props)),
    elementModelCategoriesLoaded(): boolean {
      return elementModelCategoriesProvider.isDataLoaded;
    },
    modeledElementsLoaded(): boolean {
      return modeledElementsLoaded;
    },
    getAllModels: async () => firstValueFrom(getAllModels()),
    getPlanProjectionModels: async (): Promise<Id64Set> => {
      return firstValueFrom(
        elementModelCategoriesProvider.getData().pipe(map(({ planProjectionModels }) => planProjectionModels)),
      );
    },
    getCategories: async ({ modelId }: { modelId: Id64String }): Promise<Id64Set> => {
      return firstValueFrom(
        elementModelCategoriesProvider.getData().pipe(
          map(({ modelsCategoriesInfo }) => {
            const modelInfo = modelsCategoriesInfo.get(modelId);
            return modelInfo?.categoriesOfTopMostNonExcludedElements ?? new Set();
          }),
        ),
      );
    },
    getCategoriesContainingNonExcludedElements: async (): Promise<Id64Set> => {
      return firstValueFrom(
        elementModelCategoriesProvider
          .getData()
          .pipe(map(({ categoriesContainingNonExcludedElements }) => categoriesContainingNonExcludedElements)),
      );
    },
    getAllCategoriesOfElements: async (): Promise<Id64Set> => {
      return firstValueFrom(elementModelCategoriesProvider.getData().pipe(map(({ allCategories }) => allCategories)));
    },
    getModels({
      categoryId,
      excludeSubModels,
      includeOnlyTopMostElementCategory,
      excludeIfOnlyExcludedClasses,
    }: {
      categoryId: Id64String;
      excludeSubModels?: boolean;
      includeOnlyTopMostElementCategory?: boolean;
      excludeIfOnlyExcludedClasses?: boolean;
    }): AsyncIterableIterator<ModelId> {
      let getCategoryModelsInfo = () =>
        elementModelCategoriesProvider.getData().pipe(map(({ categoryModelsInfo }) => categoryModelsInfo));

      if (excludeSubModels) {
        getCategoryModelsInfo = () => getCategoryModelsInfoWithoutSubModels();
      }
      return eachValueFrom(
        getCategoryModelsInfo().pipe(
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
        ),
      );
    },
    getCategorySubCategoriesMap: async (): Promise<Map<CategoryId, SubCategoryId[]>> => {
      return firstValueFrom(
        subCategoriesProvider.getData().pipe(map(({ categorySubCategories }) => categorySubCategories)),
      );
    },
    getSubCategoryCategories: async ({
      subCategoryIds,
    }: {
      subCategoryIds: Id64Arg;
    }): Promise<Map<CategoryId, SubCategoryId[]>> => {
      return firstValueFrom(
        subCategoriesProvider.getData().pipe(
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
        ),
      );
    },
  };
}
