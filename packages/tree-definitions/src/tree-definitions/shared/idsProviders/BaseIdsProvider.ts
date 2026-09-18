/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, filter, from, identity, map, mergeMap, of, reduce, shareReplay, tap } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { fromWithRelease, toVoidPromise } from "../Rxjs.js";
import { getOrCreate } from "../Utils.js";
import { ElementModelCategoriesProvider } from "./ElementModelCategoriesProvider.js";
import { ModeledElementsProvider } from "./ModeledElementsProvider.js";
import { SubCategoriesProvider } from "./SubCategoriesProvider.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64Arg, Id64Set, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC, Props } from "@itwin/presentation-shared";
import type { CategoryId, ElementId, ModelId, SubCategoryId } from "../Types.js";

/** @internal */
export interface BaseIdsProviderProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  elementClassName: EC.FullClassNameDotNotation;
  type: "2d" | "3d";
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
}

/** @internal */
export class BaseIdsProvider {
  #queryExecutor: LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  readonly #subCategoriesProvider: SubCategoriesProvider;
  #elementClassName: EC.FullClassNameDotNotation;
  #modeledElementsProvider: Observable<ModeledElementsProvider> | undefined;
  #modeledElementsLoaded = false;
  readonly #elementModelCategoriesProvider: ElementModelCategoriesProvider;
  #categoryModelsInfoWithoutSubModels:
    | Observable<
        Map<CategoryId, { id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }[]>
      >
    | undefined;
  #subModelsWithNonExcludedElements: Observable<Set<ModelId>> | undefined;

  constructor(props: BaseIdsProviderProps) {
    this.#queryExecutor = props.queryExecutor;
    this.#elementClassName = props.elementClassName;
    this.#componentId = Guid.createValue();
    this.#subCategoriesProvider = new SubCategoriesProvider({
      queryExecutor: this.#queryExecutor,
      componentId: this.#componentId,
    });
    this.#elementModelCategoriesProvider = new ElementModelCategoriesProvider({
      queryExecutor: this.#queryExecutor,
      componentId: this.#componentId,
      elementClassName: props.elementClassName,
      excludedElementClassNames: props.excludedElementClassNames,
    });
  }

  private getModeledElementsData(): ReturnType<ModeledElementsProvider["getData"]> {
    this.#modeledElementsProvider ??= this.getAllModels().pipe(
      map(
        (allModels) =>
          new ModeledElementsProvider({
            queryExecutor: this.#queryExecutor,
            componentId: this.#componentId,
            elementClassName: this.#elementClassName,
            nonEmptyModelIds: allModels,
          }),
      ),
      shareReplay(),
    );
    return this.#modeledElementsProvider.pipe(
      mergeMap((modeledElementsProvider) => modeledElementsProvider.getData()),
      tap(() => {
        this.#modeledElementsLoaded = true;
      }),
    );
  }

  public async preloadModeledElements(): Promise<void> {
    if (this.#modeledElementsProvider !== undefined) {
      return;
    }
    try {
      await toVoidPromise(this.getModeledElementsData());
    } catch {}
  }

  public async preloadElementModelCategories(): Promise<void> {
    if (this.#elementModelCategoriesProvider.isDataDefined) {
      return;
    }
    try {
      await toVoidPromise(this.#elementModelCategoriesProvider.getData());
    } catch {}
  }

  public getAllSubModels(props?: { excludeIfOnlyExcludedClasses?: boolean }): Observable<Id64Set> {
    if (!props?.excludeIfOnlyExcludedClasses) {
      return this.getModeledElementsData().pipe(map(({ allSubModels }) => allSubModels));
    }
    this.#subModelsWithNonExcludedElements ??= this.getModeledElementsData().pipe(
      mergeMap(({ allSubModels }) => {
        if (allSubModels.size === 0) {
          return of(allSubModels);
        }
        return this.#elementModelCategoriesProvider.getData().pipe(
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

  // ElementModelCategoriesProvider methods

  public elementModelCategoriesLoaded(): boolean {
    return this.#elementModelCategoriesProvider.isDataLoaded;
  }

  public modeledElementsLoaded(): boolean {
    return this.#modeledElementsLoaded;
  }

  public getAllModels(): Observable<Array<ModelId>> {
    return this.#elementModelCategoriesProvider
      .getData()
      .pipe(map(({ modelsCategoriesInfo }) => [...modelsCategoriesInfo.keys()]));
  }

  public getPlanProjectionModels(): Observable<Id64Set> {
    return this.#elementModelCategoriesProvider.getData().pipe(map(({ planProjectionModels }) => planProjectionModels));
  }

  public getCategories({ modelId }: { modelId: Id64String }): Observable<Id64Set> {
    return this.#elementModelCategoriesProvider.getData().pipe(
      map(({ modelsCategoriesInfo }) => {
        const modelInfo = modelsCategoriesInfo.get(modelId);
        return modelInfo?.categoriesOfTopMostNonExcludedElements ?? new Set();
      }),
    );
  }

  public getCategoriesContainingNonExcludedElements(): Observable<Id64Set> {
    return this.#elementModelCategoriesProvider
      .getData()
      .pipe(map(({ categoriesContainingNonExcludedElements }) => categoriesContainingNonExcludedElements));
  }

  public getAllCategoriesOfElements(): Observable<Id64Set> {
    return this.#elementModelCategoriesProvider.getData().pipe(map(({ allCategories }) => allCategories));
  }

  private getCategoryModelsInfoWithoutSubModels(): Observable<
    Map<CategoryId, { id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }[]>
  > {
    this.#categoryModelsInfoWithoutSubModels ??= this.getAllSubModels().pipe(
      mergeMap((allSubModels) =>
        allSubModels.size === 0
          ? this.#elementModelCategoriesProvider.getData().pipe(map(({ categoryModelsInfo }) => categoryModelsInfo))
          : this.#elementModelCategoriesProvider.getData().pipe(
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
      this.#elementModelCategoriesProvider.getData().pipe(map(({ categoryModelsInfo }) => categoryModelsInfo));

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

  // SubCategoriesProvider methods

  public getCategorySubCategoriesMap(): Observable<Map<CategoryId, SubCategoryId[]>> {
    return this.#subCategoriesProvider.getData().pipe(map(({ categorySubCategories }) => categorySubCategories));
  }

  public getSubCategoryCategories({
    subCategoryIds,
  }: {
    subCategoryIds: Id64Arg;
  }): Observable<Map<CategoryId, SubCategoryId[]>> {
    return this.#subCategoriesProvider.getData().pipe(
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
export interface BaseIdsProviderImplProps {
  baseIdsProvider: BaseIdsProvider;
}

/** @internal */
export class BaseIdsProviderImpl {
  #baseIdsProvider: BaseIdsProvider;
  constructor(props: BaseIdsProviderImplProps) {
    this.#baseIdsProvider = props.baseIdsProvider;
  }

  // Implement IBaseIdsProvider by re-exporting BaseIdsProvider methods

  public elementModelCategoriesLoaded(): ReturnType<BaseIdsProvider["elementModelCategoriesLoaded"]> {
    return this.#baseIdsProvider.elementModelCategoriesLoaded();
  }

  public modeledElementsLoaded(): ReturnType<BaseIdsProvider["modeledElementsLoaded"]> {
    return this.#baseIdsProvider.modeledElementsLoaded();
  }

  public getSubCategoryCategories(
    props: Props<BaseIdsProvider["getSubCategoryCategories"]>,
  ): ReturnType<BaseIdsProvider["getSubCategoryCategories"]> {
    return this.#baseIdsProvider.getSubCategoryCategories(props);
  }

  public getAllSubModels(
    props?: Props<BaseIdsProvider["getAllSubModels"]>,
  ): ReturnType<BaseIdsProvider["getAllSubModels"]> {
    return this.#baseIdsProvider.getAllSubModels(props);
  }

  public getCategoriesContainingNonExcludedElements(): ReturnType<
    BaseIdsProvider["getCategoriesContainingNonExcludedElements"]
  > {
    return this.#baseIdsProvider.getCategoriesContainingNonExcludedElements();
  }

  public getCategories(props: Props<BaseIdsProvider["getCategories"]>): ReturnType<BaseIdsProvider["getCategories"]> {
    return this.#baseIdsProvider.getCategories(props);
  }

  public getModels(props: Props<BaseIdsProvider["getModels"]>): ReturnType<BaseIdsProvider["getModels"]> {
    return this.#baseIdsProvider.getModels(props);
  }

  public getAllCategoriesOfElements(): ReturnType<BaseIdsProvider["getAllCategoriesOfElements"]> {
    return this.#baseIdsProvider.getAllCategoriesOfElements();
  }

  public getCategorySubCategoriesMap(): ReturnType<BaseIdsProvider["getCategorySubCategoriesMap"]> {
    return this.#baseIdsProvider.getCategorySubCategoriesMap();
  }
}
