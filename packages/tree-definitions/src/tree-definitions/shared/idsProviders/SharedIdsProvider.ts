/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, filter, from, identity, map, mergeMap, of, reduce, shareReplay } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { fromWithRelease } from "../Rxjs.js";
import { getOrCreate } from "../Utils.js";
import { ElementModelCategoriesProvider } from "./ElementModelCategoriesProvider.js";
import { getLoadDataOverride } from "./LoadedData.js";
import { SubCategoriesProvider } from "./SubCategoriesProvider.js";
import { SubModeledElementsProvider } from "./SubModeledElementsProvider.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Set, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC, ECSchemaProvider, Subscribable } from "@itwin/presentation-shared";
import type { CategoryId, ElementId, ModelId, ReadonlyId64Arg, SubCategoryId } from "../Types.js";
import type { ElementModelCategoriesProviderData } from "./ElementModelCategoriesProvider.js";
import type { LoadedData, RequireNarrowedLoadDataOverrides } from "./LoadedData.js";
import type { SubCategoriesProviderData } from "./SubCategoriesProvider.js";
import type { SubModeledElementsProviderData } from "./SubModeledElementsProvider.js";

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
 * Provides model, category, and sub-category IDs shared by tree-specific ID providers.
 * Element data is limited to the configured element class and non-private, non-template models.
 * Getters initialize their datasets, share in-flight work, and reject on failure. Subsequent calls can retry.
 * Custom implementations must expose live state and mark data `loaded` only when it is available.
 * @beta
 */
export interface SharedIdsProvider<
  T1 extends ElementModelCategoriesProviderData = ElementModelCategoriesProviderData,
  T2 extends SubModeledElementsProviderData = SubModeledElementsProviderData,
  T3 extends SubCategoriesProviderData = SubCategoriesProviderData,
> {
  /** Readonly snapshot of the element filters used to create this provider, including resolved defaults. */
  readonly config: Readonly<Pick<SharedIdsProviderProps, "elementClassName" | "excludedElementClassNames">>;
  /** Model lookups, computed from data loaded by `loadDataOverrides.loadElementModelCategories` or the default iModel query. */
  readonly models: {
    /** State of model data. */
    readonly state: IdsProviderDataState;
    /**
     * Returns the cached model and category data.
     * Can be used as `loadDataOverrides.loadElementModelCategories` of another provider.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getData(): Subscribable<T1>;
    /**
     * Returns IDs of non-private, non-template models containing visible elements of the configured class, including excluded classes.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getAllModels(): Subscribable<ReadonlySet<ModelId>>;
    /**
     * Returns IDs of non-private, non-template plan projection models containing visible elements of the configured class.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getPlanProjectionModels(): Subscribable<ReadonlySet<ModelId>>;
    /** Emits a stream of model IDs containing elements in the specified category, one value per model. Emits nothing if no models match the filters. */
    getModels(props: {
      /** The ID of the category for which to retrieve models. */
      categoryId: Id64String;
      /**
       * IDs of sub-models to omit, e.g. ones returned by `subModeledElements.getAllSubModeledElements()` to get only
       * models that model information partitions rather than elements.
       */
      excludedSubModels?: ReadonlySet<ModelId>;
      /** Requires the category to contain elements without a parent element in the model. */
      includeOnlyTopMostElementCategory?: boolean;
      /** Requires the category to contain visible, non-excluded top-level elements in the model. */
      excludeIfOnlyExcludedClasses?: boolean;
    }): Subscribable<ModelId>;
  };
  /** Sub-modeled element lookups, computed from data loaded by `loadDataOverrides.loadSubModeledElements` or the default iModel query. */
  readonly subModeledElements: {
    /** State of sub-modeled element data. */
    readonly state: IdsProviderDataState;
    /**
     * Returns the cached sub-modeled element data. Can be used as `loadDataOverrides.loadSubModeledElements` of another provider.
     *
     * **NOTE:** Unless overridden, depends on `models` data, which is loaded first if it isn't loaded yet.
     * This subscribable emits a single value and completes.
     */
    getData(): Subscribable<T2>;
    /**
     * Returns IDs of elements modeling sub-models with visible elements, optionally omitting those with only excluded elements.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getAllSubModeledElements(props?: { excludeIfOnlyExcludedClasses?: boolean }): Subscribable<ReadonlySet<Id64String>>;
  };
  /** Category lookups, computed from the same data as `models` - loaded by `loadDataOverrides.loadElementModelCategories` or the default iModel query. */
  readonly categories: {
    /** State of category data. */
    readonly state: IdsProviderDataState;
    /**
     * Returns the cached model and category data.
     * Can be used as `loadDataOverrides.loadElementModelCategories` of another provider.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getData(): Subscribable<T1>;
    /**
     * Returns categories containing visible, non-excluded top-level elements in the specified model.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getCategories(props: { modelId: Id64String }): Subscribable<ReadonlySet<CategoryId>>;
    /**
     * Returns category IDs of non-excluded elements.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getCategoriesContainingNonExcludedElements(): Subscribable<ReadonlySet<CategoryId>>;
    /**
     * Returns category IDs of visible elements of the configured class, including excluded classes.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getAllCategoriesOfElements(): Subscribable<ReadonlySet<CategoryId>>;
  };
  /** Sub-category lookups, computed from data loaded by `loadDataOverrides.loadSubCategories` or the default iModel query. */
  readonly subCategories: {
    /** State of sub-category data. */
    readonly state: IdsProviderDataState;
    /**
     * Returns the cached sub-category data. Can be used as `loadDataOverrides.loadSubCategories` of another provider.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getData(): Subscribable<T3>;
    /**
     * Returns a mapping from category IDs to their sub-category IDs.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getCategorySubCategoriesMap(): Subscribable<ReadonlyMap<CategoryId, ReadonlyArray<SubCategoryId>>>;
    /**
     * Groups the supplied sub-category IDs by parent category, omitting categories with only one sub-category.
     *
     * **NOTE:** This subscribable emits a single value and completes.
     */
    getSubCategoryCategories(props: {
      subCategoryIds: ReadonlyId64Arg;
    }): Subscribable<ReadonlyMap<CategoryId, ReadonlyArray<SubCategoryId>>>;
  };
}

/**
 * Loaders replacing the default iModel queries of individual `SharedIdsProvider` datasets.
 * @beta
 */
export interface LoadDataOverrides {
  /** Loads data used by `models` and `categories` lookups. */
  loadElementModelCategories?: () => Subscribable<ElementModelCategoriesProviderData>;
  /** Loads data used by `subModeledElements` lookups. When provided, `models` data isn't loaded for it. */
  loadSubModeledElements?: () => Subscribable<SubModeledElementsProviderData>;
  /** Loads data used by `subCategories` lookups. */
  loadSubCategories?: () => Subscribable<SubCategoriesProviderData>;
}

/**
 * Query access and element class filters shared by tree ID providers.
 * @beta
 */
interface SharedIdsProviderProps<TOverrides extends LoadDataOverrides = LoadDataOverrides> {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  elementClassName: EC.FullClassNameDotNotation;
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
  /**
   * Replace the default iModel queries of individual datasets. Overrides should only load data: emit a single value
   * and complete. The provider calls them lazily, tracks state, caches and shares the result, and calls them again
   * on retry after failure. Data must match the element filters of this provider and must not be mutated afterwards.
   *
   * Required when `TOverrides` is narrower than `LoadDataOverrides`, since only overrides can produce narrowed data.
   */
  loadDataOverrides?: TOverrides;
}

/**
 * Creates a cached ID provider for visible elements of the specified class and optional excluded classes.
 * Data is a snapshot for the lifetime of this provider; recreate it after element or schema changes.
 * Share it only across compatible iModel and filter configurations. Recreate it after relevant data changes.
 *
 * Each `getData()` lookup of the created provider returns the data type of the corresponding `loadDataOverrides`
 * loader, or the default data type when the loader isn't provided.
 * @beta
 */
export function createSharedIdsProvider<TOverrides extends LoadDataOverrides = LoadDataOverrides>({
  elementClassName,
  imodelAccess,
  excludedElementClassNames: excludedClassOverrides,
  loadDataOverrides,
}: SharedIdsProviderProps<TOverrides> &
  RequireNarrowedLoadDataOverrides<LoadDataOverrides, TOverrides>): SharedIdsProvider<
  LoadedData<TOverrides["loadElementModelCategories"], ElementModelCategoriesProviderData>,
  LoadedData<TOverrides["loadSubModeledElements"], SubModeledElementsProviderData>,
  LoadedData<TOverrides["loadSubCategories"], SubCategoriesProviderData>
> {
  type ModelsAndCategoriesData = LoadedData<
    TOverrides["loadElementModelCategories"],
    ElementModelCategoriesProviderData
  >;
  type SubModeledElementsData = LoadedData<TOverrides["loadSubModeledElements"], SubModeledElementsProviderData>;
  type SubCategoriesData = LoadedData<TOverrides["loadSubCategories"], SubCategoriesProviderData>;
  const config = normalizeSharedIdsProviderConfig({
    elementClassName,
    excludedElementClassNames: excludedClassOverrides,
  });
  const excludedElementClassNames = config.excludedElementClassNames;
  const componentId: GuidString = Guid.createValue();
  const subCategoriesProvider = new SubCategoriesProvider({
    queryExecutor: imodelAccess,
    componentId,
    loadDataOverride: getLoadDataOverride(loadDataOverrides, "loadSubCategories"),
  });
  const elementModelCategoriesProvider = new ElementModelCategoriesProvider({
    imodelAccess,
    componentId,
    elementClassName,
    excludedElementClassNames,
    loadDataOverride: getLoadDataOverride(loadDataOverrides, "loadElementModelCategories"),
  });
  const subModeledElementsProvider = new SubModeledElementsProvider({
    queryExecutor: imodelAccess,
    componentId,
    elementClassName,
    elementModelCategoriesProvider,
    loadDataOverride: getLoadDataOverride(loadDataOverrides, "loadSubModeledElements"),
  });
  let subModelsWithNonExcludedElements: Observable<Set<ModelId>> | undefined;

  function getAllModels(): Observable<ReadonlySet<ModelId>> {
    return elementModelCategoriesProvider
      .getData()
      .pipe(map(({ modelsCategoriesInfo }) => new Set(modelsCategoriesInfo.keys())));
  }

  function getAllSubModeledElements(props?: { excludeIfOnlyExcludedClasses?: boolean }): Observable<Id64Set> {
    if (!props?.excludeIfOnlyExcludedClasses) {
      return subModeledElementsProvider.getData().pipe(map(({ allSubModels }) => allSubModels));
    }
    subModelsWithNonExcludedElements ??= subModeledElementsProvider.getData().pipe(
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

  return {
    config,
    models: {
      getData: (): Subscribable<ModelsAndCategoriesData> => {
        return elementModelCategoriesProvider.getData();
      },
      get state(): IdsProviderDataState {
        return elementModelCategoriesProvider.state;
      },
      getAllModels: (): Subscribable<ReadonlySet<ModelId>> => {
        return getAllModels();
      },
      getPlanProjectionModels: (): Subscribable<ReadonlySet<ModelId>> => {
        return elementModelCategoriesProvider.getData().pipe(map(({ planProjectionModels }) => planProjectionModels));
      },
      getModels({
        categoryId,
        excludedSubModels,
        includeOnlyTopMostElementCategory,
        excludeIfOnlyExcludedClasses,
      }: {
        categoryId: Id64String;
        excludedSubModels?: ReadonlySet<ModelId>;
        includeOnlyTopMostElementCategory?: boolean;
        excludeIfOnlyExcludedClasses?: boolean;
      }): Subscribable<ModelId> {
        return elementModelCategoriesProvider.getData().pipe(
          mergeMap(({ categoryModelsInfo }) => {
            const categoryModels = categoryModelsInfo.get(categoryId);
            if (!categoryModels) {
              return EMPTY;
            }
            return from(categoryModels);
          }),
          excludedSubModels && excludedSubModels.size > 0 ? filter(({ id }) => !excludedSubModels.has(id)) : identity,
          includeOnlyTopMostElementCategory
            ? filter(({ categoryIsOfTopMostElement }) => categoryIsOfTopMostElement)
            : identity,
          excludeIfOnlyExcludedClasses
            ? filter(({ hasNonExcludedTopMostElements }) => hasNonExcludedTopMostElements)
            : identity,
          map(({ id }) => id),
        );
      },
    },
    subModeledElements: {
      get state(): IdsProviderDataState {
        return subModeledElementsProvider.state;
      },
      getData: (): Subscribable<SubModeledElementsData> => {
        return subModeledElementsProvider.getData();
      },
      getAllSubModeledElements: (props?: { excludeIfOnlyExcludedClasses?: boolean }): Subscribable<Set<ElementId>> => {
        return getAllSubModeledElements(props);
      },
    },
    categories: {
      get state(): IdsProviderDataState {
        return elementModelCategoriesProvider.state;
      },
      getData: (): Subscribable<ModelsAndCategoriesData> => {
        return elementModelCategoriesProvider.getData();
      },
      getCategories: ({ modelId }: { modelId: Id64String }): Subscribable<Set<CategoryId>> =>
        elementModelCategoriesProvider.getData().pipe(
          map(({ modelsCategoriesInfo }) => {
            const modelInfo = modelsCategoriesInfo.get(modelId);
            return modelInfo?.categoriesOfTopMostNonExcludedElements ?? new Set();
          }),
        ),
      getCategoriesContainingNonExcludedElements: (): Subscribable<Set<CategoryId>> => {
        return elementModelCategoriesProvider
          .getData()
          .pipe(map(({ categoriesContainingNonExcludedElements }) => categoriesContainingNonExcludedElements));
      },
      getAllCategoriesOfElements: (): Subscribable<Set<CategoryId>> => {
        return elementModelCategoriesProvider.getData().pipe(map(({ allCategories }) => allCategories));
      },
    },
    subCategories: {
      get state(): IdsProviderDataState {
        return subCategoriesProvider.state;
      },
      getData: (): Subscribable<SubCategoriesData> => {
        return subCategoriesProvider.getData();
      },
      getCategorySubCategoriesMap: (): Subscribable<Map<CategoryId, SubCategoryId[]>> => {
        return subCategoriesProvider.getData().pipe(map(({ categorySubCategories }) => categorySubCategories));
      },
      getSubCategoryCategories: ({
        subCategoryIds,
      }: {
        subCategoryIds: ReadonlyId64Arg;
      }): Subscribable<Map<CategoryId, SubCategoryId[]>> => {
        return subCategoriesProvider.getData().pipe(
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
      },
    },
  };
}

/** @internal */
export function normalizeSharedIdsProviderConfig(config: SharedIdsProvider["config"]) {
  return {
    elementClassName: config.elementClassName,
    excludedElementClassNames: [...new Set(config.excludedElementClassNames ?? [])].sort(),
  };
}
