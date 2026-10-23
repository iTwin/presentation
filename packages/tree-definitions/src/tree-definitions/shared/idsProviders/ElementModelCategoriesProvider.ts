/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { delay, finalize, from, map, mergeMap, reduce, shareReplay } from "rxjs";
import { ECSql } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../ClassNameDefinitions.js";
import { catchBeSQLiteInterrupts } from "../TreeErrors.js";
import { createExcludedClassesClause, createWhereClause, getOrCreate, loadData } from "../Utils.js";
import { DataStateTracker } from "./DataStateTracker.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { CategoryId, ModelId } from "../Types.js";
import type { LoadedData } from "../Utils.js";
import type { IdsProviderDataState, LoadDataOverrides } from "./SharedIdsProvider.js";

/** Loader replacing the default iModel query of `ElementModelCategoriesProvider`. */
type Loader = LoadDataOverrides["loadElementModelCategories"];

interface ElementModelCategoriesProviderProps<TLoader extends Loader> {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  componentId: GuidString;
  elementClassName: EC.FullClassNameDotNotation;
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
  loadDataOverride?: TLoader;
}

/** Data produced by `ElementModelCategoriesProvider` with the given loader. */
type Data<TLoader extends Loader> = LoadedData<TLoader, ElementModelCategoriesProviderData>;

/**
 * Category information of a single model.
 * @beta
 */
interface ModelsCategoriesInfoEntry {
  /** Categories containing top-level elements that aren't of excluded classes. */
  categoriesOfTopMostNonExcludedElements: Set<CategoryId>;
  /** Whether the model contains elements that aren't of excluded classes. */
  hasNonExcludedElements: boolean;
}

/**
 * Model and category data used by `SharedIdsProvider.models` and `SharedIdsProvider.categories`.
 * @beta
 */
export interface ElementModelCategoriesProviderData {
  /** Plan projection models containing elements. */
  planProjectionModels: Set<ModelId>;
  /** Category information of all models containing elements, including models with only excluded elements. */
  modelsCategoriesInfo: Map<ModelId, ModelsCategoriesInfoEntry>;
  /** Categories containing elements that aren't of excluded classes. */
  categoriesContainingNonExcludedElements: Set<CategoryId>;
  /**
   * Models containing elements of each category, with flags telling whether the category contains top-level elements
   * and top-level elements that aren't of excluded classes in that model.
   */
  categoryModelsInfo: Map<
    CategoryId,
    Array<{ id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }>
  >;
  /** Categories of all elements, including those of excluded classes. */
  allCategories: Set<CategoryId>;
}

/** @internal */
export class ElementModelCategoriesProvider<TLoader extends Loader = undefined> {
  #imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  #componentName: string;
  #elementClassName: EC.FullClassNameDotNotation;
  #excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
  #cachedData: Observable<Data<TLoader>> | undefined;
  #state = new DataStateTracker();
  #subscriberBatches: Array<{ obs: Observable<Data<TLoader>>; subscriberCount: number }> = [];
  #loadDataOverride?: TLoader;

  constructor(props: ElementModelCategoriesProviderProps<TLoader>) {
    this.#imodelAccess = props.imodelAccess;
    this.#elementClassName = props.elementClassName;
    this.#excludedElementClassNames = props.excludedElementClassNames;
    this.#componentId = props.componentId;
    this.#componentName = "ElementModelCategoriesProvider";
    this.#loadDataOverride = props.loadDataOverride;
  }

  private queryElementModelCategories(): Observable<{
    modelId: Id64String;
    categoryId: Id64String;
    isTopMostElementCategory: boolean;
    hasElementsFromNonExcludedClasses: boolean;
    hasNonExcludedTopMostElements: boolean;
    isPlanProjectionModel: boolean;
  }> {
    const excludedClause = createExcludedClassesClause({
      alias: "this",
      excludedClassNames: this.#excludedElementClassNames,
    });
    return from(
      ECSql.createHiddenClassesFilter({ schemaProvider: this.#imodelAccess, baseClassName: this.#elementClassName }),
    ).pipe(
      mergeMap((elementsHiddenClassesFilter) => {
        const query = `
          SELECT
            this.Model.Id modelId,
            this.Category.Id categoryId,
            MAX(IIF(this.Parent.Id IS NULL, 1, 0)) isTopMostElementCategory,
            IIF(m.$->IsPlanProjection?, 1, 0) isPlanProjectionModel
            ${
              excludedClause
                ? `, MAX(IIF((${excludedClause}), 1, 0)) hasElementsFromNonExcludedClasses
                   , MAX(IIF(this.Parent.Id IS NULL AND (${excludedClause}), 1, 0)) hasNonExcludedTopMostElements`
                : ""
            }
          FROM ${this.#elementClassName} this
          JOIN ${CLASS_NAMES.Model} m ON m.ECInstanceId = this.Model.Id
          ${createWhereClause({ conditions: ["m.IsPrivate = false", "m.IsTemplate = false", elementsHiddenClassesFilter.createWhereClause("this")] })}
          GROUP BY modelId, categoryId
        `;
        return this.#imodelAccess.createQueryReader(
          { ecsql: query },
          {
            rowFormat: "ECSqlPropertyNames",
            limit: "unbounded",
            restartToken: `${this.#componentName}/${this.#componentId}/element-models-and-categories`,
          },
        );
      }),
      catchBeSQLiteInterrupts,
      map((row) => {
        return {
          modelId: row.modelId,
          categoryId: row.categoryId,
          isTopMostElementCategory: !!row.isTopMostElementCategory,
          hasElementsFromNonExcludedClasses: excludedClause ? !!row.hasElementsFromNonExcludedClasses : true,
          hasNonExcludedTopMostElements: excludedClause
            ? !!row.hasNonExcludedTopMostElements
            : !!row.isTopMostElementCategory,
          isPlanProjectionModel: !!row.isPlanProjectionModel,
        };
      }),
    );
  }

  public get state(): IdsProviderDataState {
    return this.#state.state;
  }

  private loadData(): Observable<ElementModelCategoriesProviderData> {
    return this.queryElementModelCategories().pipe(
      reduce(
        (acc, queriedCategory) => {
          acc.allCategories.add(queriedCategory.categoryId);
          const categoryModelsEntry = getOrCreate({
            map: acc.categoryModelsInfo,
            key: queriedCategory.categoryId,
            createFunc: () =>
              new Array<{ id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }>(),
          });
          categoryModelsEntry.push({
            id: queriedCategory.modelId,
            categoryIsOfTopMostElement: queriedCategory.isTopMostElementCategory,
            hasNonExcludedTopMostElements: queriedCategory.hasNonExcludedTopMostElements,
          });
          const modelEntry = getOrCreate({
            map: acc.modelsCategoriesInfo,
            key: queriedCategory.modelId,
            createFunc: (): ModelsCategoriesInfoEntry => ({
              categoriesOfTopMostNonExcludedElements: new Set<string>(),
              hasNonExcludedElements: false,
            }),
          });
          if (queriedCategory.isPlanProjectionModel) {
            acc.planProjectionModels.add(queriedCategory.modelId);
          }
          if (queriedCategory.hasElementsFromNonExcludedClasses) {
            modelEntry.hasNonExcludedElements = true;
            acc.categoriesContainingNonExcludedElements.add(queriedCategory.categoryId);
            if (queriedCategory.hasNonExcludedTopMostElements) {
              modelEntry.categoriesOfTopMostNonExcludedElements.add(queriedCategory.categoryId);
            }
          }
          return acc;
        },
        {
          planProjectionModels: new Set<ModelId>(),
          modelsCategoriesInfo: new Map<ModelId, ModelsCategoriesInfoEntry>(),
          allCategories: new Set<CategoryId>(),
          categoriesContainingNonExcludedElements: new Set<CategoryId>(),
          categoryModelsInfo: new Map<
            CategoryId,
            Array<{ id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }>
          >(),
        },
      ),
    );
  }

  public getData(): Observable<Data<TLoader>> {
    this.#cachedData ??= loadData({
      loadDataOverride: this.#loadDataOverride,
      loadDefault: () => this.loadData(),
    }).pipe(
      finalize(() => {
        this.#subscriberBatches = [];
      }),
      this.#state.track(),
      shareReplay(),
    );

    // Once the data is loaded, every subscriber gets a synchronous replay, so batching is no longer needed.
    if (this.#state.state === "loaded") {
      return this.#cachedData;
    }

    // While the data is still loading, group subscribers into batches. The first batch subscribes directly to the
    // shared source; each subsequent batch chains off the previous one through a `delay(0)`, so
    // when the source resolves the batches are notified with a slight delay between each batch.
    // This prevents main thread blocking.
    if (this.#subscriberBatches.length === 0) {
      this.#subscriberBatches.push({ obs: this.#cachedData, subscriberCount: 1 });
      return this.#cachedData;
    }

    let lastBatch = this.#subscriberBatches[this.#subscriberBatches.length - 1];

    const maxSubscribersPerBatch = 400;
    if (lastBatch.subscriberCount >= maxSubscribersPerBatch) {
      lastBatch = { obs: lastBatch.obs.pipe(delay(0), shareReplay({ refCount: true })), subscriberCount: 1 };
      this.#subscriberBatches.push(lastBatch);
    } else {
      ++lastBatch.subscriberCount;
    }
    return lastBatch.obs;
  }
}
