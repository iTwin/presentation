/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, delay, map, reduce, shareReplay, tap } from "rxjs";
import { CLASS_NAMES } from "../ClassNameDefinitions.js";
import { catchBeSQLiteInterrupts } from "../TreeErrors.js";
import { createExcludedClassesClause, getOrCreate } from "../Utils.js";
import { DataStateTracker } from "./DataStateTracker.js";

import type { Observable } from "rxjs";
import type { GuidString, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC } from "@itwin/presentation-shared";
import type { CategoryId, ModelId } from "../Types.js";
import type { IdsProviderDataState } from "./SharedIdsProvider.js";

interface ElementModelCategoriesProviderProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  componentId: GuidString;
  elementClassName: string;
  excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
}
interface ModelsCategoriesInfoEntry {
  categoriesOfTopMostNonExcludedElements: Set<CategoryId>;
  hasNonExcludedElements: boolean;
}

interface ElementModelCategoriesProviderData {
  planProjectionModels: Set<ModelId>;
  modelsCategoriesInfo: Map<ModelId, ModelsCategoriesInfoEntry>;
  categoriesContainingNonExcludedElements: Set<CategoryId>;
  categoryModelsInfo: Map<
    CategoryId,
    Array<{ id: ModelId; categoryIsOfTopMostElement: boolean; hasNonExcludedTopMostElements: boolean }>
  >;
  allCategories: Set<CategoryId>;
}

/** @internal */
export class ElementModelCategoriesProvider {
  #queryExecutor: LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  #componentName: string;
  #elementClassName: string;
  #excludedElementClassNames?: ReadonlyArray<EC.FullClassNameDotNotation>;
  #cachedData: Observable<ElementModelCategoriesProviderData> | undefined;
  #state = new DataStateTracker();
  #subscriberBatches: Array<{ obs: Observable<ElementModelCategoriesProviderData>; subscriberCount: number }> = [];

  constructor(props: ElementModelCategoriesProviderProps) {
    this.#queryExecutor = props.queryExecutor;
    this.#elementClassName = props.elementClassName;
    this.#excludedElementClassNames = props.excludedElementClassNames;
    this.#componentId = props.componentId;
    this.#componentName = "ElementModelCategoriesProvider";
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
    return defer(() => {
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
          WHERE m.IsPrivate = false AND m.IsTemplate = false
          GROUP BY modelId, categoryId
        `;
      return this.#queryExecutor.createQueryReader(
        { ecsql: query },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${this.#componentName}/${this.#componentId}/element-models-and-categories`,
        },
      );
    }).pipe(
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

  public getData(): Observable<ElementModelCategoriesProviderData> {
    this.#cachedData ??= defer(() =>
      this.queryElementModelCategories().pipe(
        reduce(
          (acc, queriedCategory) => {
            acc.allCategories.add(queriedCategory.categoryId);
            const categoryModelsEntry = getOrCreate({
              map: acc.categoryModelsInfo,
              key: queriedCategory.categoryId,
              createFunc: () =>
                new Array<{
                  id: ModelId;
                  categoryIsOfTopMostElement: boolean;
                  hasNonExcludedTopMostElements: boolean;
                }>(),
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
      ),
    ).pipe(
      tap(() => {
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
