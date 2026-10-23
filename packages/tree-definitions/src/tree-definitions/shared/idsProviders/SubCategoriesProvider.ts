/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, expand, map, reduce, shareReplay } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { CLASS_NAMES } from "../ClassNameDefinitions.js";
import { catchBeSQLiteInterrupts } from "../TreeErrors.js";
import { createWhereClause, getOrCreate } from "../Utils.js";
import { DataStateTracker } from "./DataStateTracker.js";
import { loadData } from "./LoadedData.js";

import type { Observable } from "rxjs";
import type { GuidString } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { CategoryId, SubCategoryId } from "../Types.js";
import type { LoadedData } from "./LoadedData.js";
import type { IdsProviderDataState, LoadDataOverrides } from "./SharedIdsProvider.js";

/** Loader replacing the default iModel query of `SubCategoriesProvider`. */
type Loader = LoadDataOverrides["loadSubCategories"];

interface SubCategoriesProviderProps<TLoader extends Loader> {
  queryExecutor: LimitingECSqlQueryExecutor;
  componentId?: GuidString;
  loadDataOverride?: TLoader;
}

/** Data produced by `SubCategoriesProvider` with the given loader. */
type Data<TLoader extends Loader> = LoadedData<TLoader, SubCategoriesProviderData>;

/**
 * Sub-category data used by `SharedIdsProvider.subCategories`.
 * @beta
 */
export interface SubCategoriesProviderData {
  /** Mapping from non-private sub-category IDs to their parent category IDs. */
  subCategoryCategories: Map<SubCategoryId, CategoryId>;
  /** Mapping from category IDs to their non-private sub-category IDs. */
  categorySubCategories: Map<CategoryId, Array<SubCategoryId>>;
}

/** @internal */
export class SubCategoriesProvider<TLoader extends Loader = undefined> {
  #queryExecutor: LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  #componentName: string;
  #cachedData: Observable<Data<TLoader>> | undefined;
  #state = new DataStateTracker();
  #rowLimit = 7500;
  #loadDataOverride?: TLoader;

  constructor(props: SubCategoriesProviderProps<TLoader>) {
    this.#queryExecutor = props.queryExecutor;
    this.#componentId = props.componentId ?? Guid.createValue();
    this.#componentName = "SubCategoriesProvider";
    this.#loadDataOverride = props.loadDataOverride;
  }

  private querySubCategories(): Observable<{ id: SubCategoryId; parentId: CategoryId }> {
    const getQueryReader = (lastSubCategoryId?: SubCategoryId) => {
      const ecsql = `
        SELECT
          sc.ECInstanceId id,
          sc.Parent.Id categoryId
        FROM
          ${CLASS_NAMES.SubCategory} sc
        ${createWhereClause({ conditions: ["NOT sc.IsPrivate", lastSubCategoryId !== undefined && `sc.ECInstanceId > ${lastSubCategoryId}`] })}
        ORDER BY sc.ECInstanceId
        LIMIT ${this.#rowLimit}
      `;
      return this.#queryExecutor.createQueryReader(
        { ecsql },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${this.#componentName}/${this.#componentId}/sub-categories/${lastSubCategoryId ?? "0"}`,
        },
      );
    };
    return defer(() => getQueryReader()).pipe(
      // Note: if the total row count is an exact multiple of `#rowLimit`, an extra request that returns
      // 0 rows will be sent. This is acceptable to keep the implementation simple.
      expand((row, idx) => {
        if (idx % this.#rowLimit === this.#rowLimit - 1) {
          return getQueryReader(row.id);
        }
        return EMPTY;
      }),
      catchBeSQLiteInterrupts,
      map((row) => {
        return { id: row.id, parentId: row.categoryId };
      }),
    );
  }

  public get state(): IdsProviderDataState {
    return this.#state.state;
  }

  private loadData(): Observable<SubCategoriesProviderData> {
    return this.querySubCategories().pipe(
      reduce(
        (acc, queriedSubCategory) => {
          acc.subCategoryCategories.set(queriedSubCategory.id, queriedSubCategory.parentId);
          const entry = getOrCreate({
            map: acc.categorySubCategories,
            key: queriedSubCategory.parentId,
            createFunc: () => new Array<SubCategoryId>(),
          });
          entry.push(queriedSubCategory.id);
          return acc;
        },
        {
          subCategoryCategories: new Map<SubCategoryId, CategoryId>(),
          categorySubCategories: new Map<CategoryId, Array<SubCategoryId>>(),
        },
      ),
    );
  }

  public getData(): Observable<Data<TLoader>> {
    this.#cachedData ??= loadData({
      loadDataOverride: this.#loadDataOverride,
      loadDefault: () => this.loadData(),
    }).pipe(this.#state.track(), shareReplay());
    return this.#cachedData;
  }
}
