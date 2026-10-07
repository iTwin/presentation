/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, filter, firstValueFrom, from, identity, map, mergeMap, of, reduce, shareReplay } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { eachValueFrom, type EC } from "@itwin/presentation-shared";
import { fromWithRelease } from "../Rxjs.js";
import { getOrCreate } from "../Utils.js";
import { DataStateTracker } from "./DataStateTracker.js";
import { ElementModelCategoriesProvider } from "./ElementModelCategoriesProvider.js";
import { ModeledElementsProvider } from "./ModeledElementsProvider.js";
import { SubCategoriesProvider } from "./SubCategoriesProvider.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Arg, Id64Set, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { CategoryId, ElementId, ModelId, SubCategoryId } from "../Types.js";

/**
 * The state of a cached ID dataset.
 * - `not-requested` means no load has started;
 * - `requested` means loading has started but the full dataset is not yet available;
 * - `loaded` means cached data is available;
 * - `failed` means a load or required dependency failed.
 *
 * Explicit retries transition from `failed` to `requested`. For datasets with independently loaded parts,
 * any failed part keeps the dataset `failed` until that part is retried; partial success remains `requested`.
 * Reading state never initiates work. Errors are delivered through getters, not stored in the state.
 * Replace the provider to reset its state to `not-requested`.
 * @beta
 */
export type IdsProviderDataState = "not-requested" | "requested" | "loaded" | "failed";

/**
 * Provides model, category, and sub-category IDs for tree hierarchy definitions.
 * Element data is limited to the configured element class and non-private models.
 * Getters initialize their datasets, share in-flight work, and reject on failure. Subsequent calls can retry.
 * Custom implementations must expose live state and mark data `loaded` only when it is available.
 * @beta
 */
export interface BaseIdsProvider {
  /** State of model/category data, including plan projection models. Loaded by `getAllModels`. */
  readonly elementModelCategoriesState: IdsProviderDataState;
  /** State of modeled-element data. `getAllModeledElements` loads this and model/category data. */
  readonly modeledElementsState: IdsProviderDataState;
  /** State of category/sub-category mappings, loaded independently by `getCategorySubCategoriesMap`. */
  readonly subCategoriesState: IdsProviderDataState;
  /** Returns IDs of elements modeling non-empty sub-models, optionally omitting sub-models with only excluded elements. */
  getAllModeledElements(props?: { excludeIfOnlyExcludedClasses?: boolean }): Promise<ReadonlySet<Id64String>>;
  /** Returns IDs of non-private models containing elements of the configured class, including excluded classes. */
  getAllModels(): Promise<ReadonlyArray<ModelId>>;
  /** Returns IDs of non-private plan projection models containing elements of the configured class. */
  getPlanProjectionModels(): Promise<ReadonlySet<ModelId>>;
  /** Returns categories containing non-excluded top-level elements in the specified model. */
  getCategories(props: { modelId: Id64String }): Promise<ReadonlySet<CategoryId>>;
  /** Returns category IDs of non-excluded elements. */
  getCategoriesContainingNonExcludedElements(): Promise<ReadonlySet<CategoryId>>;
  /** Returns category IDs of all elements of the configured class, including excluded classes. */
  getAllCategoriesOfElements(): Promise<ReadonlySet<CategoryId>>;
  /** Yields model IDs containing elements in the specified category. Yields no IDs if no models match the filters. */
  getModels(props: {
    categoryId: Id64String;
    /** Omits models that model elements rather than information partitions. */
    excludeSubModels?: boolean;
    /** Requires the category to contain elements without a parent element in the model. */
    includeOnlyTopMostElementCategory?: boolean;
    /** Requires the category to contain non-excluded top-level elements in the model. */
    excludeIfOnlyExcludedClasses?: boolean;
  }): AsyncIterableIterator<ModelId>;
  /** Returns a mapping from category IDs to their sub-category IDs. */
  getCategorySubCategoriesMap(): Promise<ReadonlyMap<CategoryId, ReadonlyArray<SubCategoryId>>>;
  /** Groups the supplied sub-category IDs by parent category, omitting categories with only one sub-category. */
  getSubCategoryCategories(props: {
    subCategoryIds: Id64Arg;
  }): Promise<ReadonlyMap<CategoryId, ReadonlyArray<SubCategoryId>>>;
}

/**
 * Query access and element class filters shared by tree ID providers.
 * @beta
 */
interface BaseIdsProviderProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  elementClassName: EC.FullClassNameDotNotation;
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
}

/**
 * Creates a cached ID provider for elements of the specified class and optional excluded classes.
 * Share it only across compatible iModel and filter configurations. Recreate it after relevant data changes.
 * @beta
 */
export function createBaseIdsProvider({
  elementClassName,
  queryExecutor,
  excludedElementClassNames,
}: BaseIdsProviderProps): BaseIdsProvider {
  const componentId: GuidString = Guid.createValue();
  const subCategoriesProvider = new SubCategoriesProvider({ queryExecutor, componentId });
  let modeledElementsData: ReturnType<ModeledElementsProvider["getData"]> | undefined;
  const elementModelCategoriesProvider = new ElementModelCategoriesProvider({
    queryExecutor,
    componentId,
    elementClassName,
    excludedElementClassNames,
  });
  const modeledElementsState = new DataStateTracker();
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
    modeledElementsData ??= getAllModels().pipe(
      mergeMap((allModels) =>
        new ModeledElementsProvider({
          queryExecutor,
          componentId,
          elementClassName,
          nonEmptyModelIds: allModels,
        }).getData(),
      ),
      modeledElementsState.track(),
      shareReplay(),
    );
    return modeledElementsData;
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
    get elementModelCategoriesState(): IdsProviderDataState {
      return elementModelCategoriesProvider.dataState;
    },
    get modeledElementsState(): IdsProviderDataState {
      return modeledElementsState.state;
    },
    get subCategoriesState(): IdsProviderDataState {
      return subCategoriesProvider.dataState;
    },
    getAllModeledElements: async (props) => firstValueFrom(getAllModeledElements(props)),
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
