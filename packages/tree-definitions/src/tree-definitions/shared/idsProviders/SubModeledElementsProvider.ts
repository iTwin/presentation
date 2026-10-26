/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, map, mergeMap, reduce, shareReplay } from "rxjs";
import { catchBeSQLiteInterrupts } from "../TreeErrors.js";
import { combineDataStates, DataStateTracker } from "./DataStateTracker.js";
import { loadData } from "./LoadedData.js";

import type { Observable } from "rxjs";
import type { GuidString } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ElementId, ModelId } from "../Types.js";
import type { ElementModelCategoriesProviderData } from "./ElementModelCategoriesProvider.js";
import type { LoadedData } from "./LoadedData.js";
import type { IdsProviderDataState, LoadDataOverrides } from "./SharedIdsProvider.js";

/** Loader replacing the default iModel query of `SubModeledElementsProvider`. */
type Loader = LoadDataOverrides["loadSubModeledElements"];

interface SubModeledElementsProviderProps<TLoader extends Loader> {
  queryExecutor: LimitingECSqlQueryExecutor;
  componentId: GuidString;
  elementClassName: string;
  /** Provides models containing elements. Used only when `loadDataOverride` isn't provided. */
  elementModelCategoriesProvider: {
    readonly state: IdsProviderDataState;
    getData(): Observable<ElementModelCategoriesProviderData>;
  };
  loadDataOverride?: TLoader;
}

/** Data produced by `SubModeledElementsProvider` with the given loader. */
type Data<TLoader extends Loader> = LoadedData<TLoader, SubModeledElementsProviderData>;

/**
 * Sub-modeled element data used by `SharedIdsProvider.subModeledElements`.
 * @beta
 */
export interface SubModeledElementsProviderData {
  /** Elements that are modeled by models containing elements. Their IDs are also IDs of the sub-models. */
  allSubModels: Set<ElementId>;
}

/** @internal */
export class SubModeledElementsProvider<TLoader extends Loader = undefined> {
  #queryExecutor: LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  #componentName: string;
  #elementClassName: string;
  #elementModelCategoriesProvider: SubModeledElementsProviderProps<TLoader>["elementModelCategoriesProvider"];
  #cachedData: Observable<Data<TLoader>> | undefined;
  #stateTracker = new DataStateTracker();
  #loadDataOverride?: TLoader;

  constructor(props: SubModeledElementsProviderProps<TLoader>) {
    this.#queryExecutor = props.queryExecutor;
    this.#componentId = props.componentId;
    this.#elementClassName = props.elementClassName;
    this.#componentName = "SubModeledElementsProvider";
    this.#elementModelCategoriesProvider = props.elementModelCategoriesProvider;
    this.#loadDataOverride = props.loadDataOverride;
  }

  private querySubModeledElements(nonEmptyModelIds: ReadonlySet<ModelId>): Observable<ElementId> {
    if (nonEmptyModelIds.size === 0) {
      return EMPTY;
    }
    return defer(() => {
      const query = `
        SELECT me.ECInstanceId subModeledElementId
        FROM ${this.#elementClassName} me
        JOIN IdSet(?) modelIdSet ON modelIdSet.id = me.ECInstanceId
      `;
      return this.#queryExecutor.createQueryReader(
        { ecsql: query, bindings: [{ type: "idset", value: nonEmptyModelIds }] },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${this.#componentName}/${this.#componentId}/sub-modeled-elements`,
        },
      );
    }).pipe(
      catchBeSQLiteInterrupts,
      map((row) => row.subModeledElementId),
    );
  }

  public get state(): IdsProviderDataState {
    if (this.#loadDataOverride) {
      return this.#stateTracker.state;
    }
    // Default loading depends on models data, so its failures also make this data failed.
    return combineDataStates([this.#stateTracker.state, this.#elementModelCategoriesProvider.state]);
  }

  private loadData(): Observable<SubModeledElementsProviderData> {
    return this.#elementModelCategoriesProvider.getData().pipe(
      mergeMap(({ modelsCategoriesInfo }) => this.querySubModeledElements(new Set(modelsCategoriesInfo.keys()))),
      reduce(
        (acc, subModeledElementId) => {
          acc.allSubModels.add(subModeledElementId);
          return acc;
        },
        { allSubModels: new Set<ElementId>() },
      ),
    );
  }

  public getData(): Observable<Data<TLoader>> {
    this.#cachedData ??= loadData({
      loadDataOverride: this.#loadDataOverride,
      loadDefault: () => this.loadData(),
    }).pipe(this.#stateTracker.track(), shareReplay());
    return this.#cachedData;
  }
}
