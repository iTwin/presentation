/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { tap } from "rxjs";

import type { MonoTypeOperatorFunction } from "rxjs";
import type { IdsProviderDataState } from "./SharedIdsProvider.js";

/**
 * Tracks a dataset's load attempts. Apply after data aggregation and before sharing the observable.
 * @internal
 */
export class DataStateTracker {
  #state: IdsProviderDataState = "not-requested";

  public get state(): IdsProviderDataState {
    return this.#state;
  }

  public track<T>(): MonoTypeOperatorFunction<T> {
    return tap({
      subscribe: () => {
        this.#state = "requested";
      },
      next: () => {
        this.#state = "loaded";
      },
      error: () => {
        this.#state = "failed";
      },
    });
  }
}

/**
 * Combines independently cached parts of a dataset. Any failed part keeps the dataset failed until retried.
 * @internal
 */
export function combineDataStates(states: IdsProviderDataState[]): IdsProviderDataState {
  let combinedState: IdsProviderDataState = "loaded";
  for (const state of states) {
    switch (state) {
      // Failed has the highest priority, immediately return "failed"
      case "failed":
        return "failed";
      // "not-requested" has the next highest priority, update combinedState accordingly
      case "not-requested":
        combinedState = "not-requested";
        break;
      // "requested" takes precedence over "loaded", only update combinedState if it's currently "loaded"
      case "requested":
        if (combinedState === "loaded") {
          combinedState = "requested";
        }
        break;
    }
  }
  return combinedState;
}
