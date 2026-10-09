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
  if (states.includes("failed")) {
    return "failed";
  }
  if (states.every((state) => state === "loaded")) {
    return "loaded";
  }
  return states.every((state) => state === "not-requested") ? "not-requested" : "requested";
}
