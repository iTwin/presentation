/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer } from "rxjs";
import { toObservable } from "../Rxjs.js";

import type { Observable } from "rxjs";
import type { Subscribable } from "@itwin/presentation-shared";

/**
 * Data type produced by a loader, or `TDefault` when the loader isn't provided.
 * @beta
 */
export type LoadedData<TLoader, TDefault> =
  NonNullable<TLoader> extends () => Subscribable<infer TData extends TDefault> ? TData : TDefault;

/**
 * Makes `loadDataOverrides` required when `TOverrides` is narrower than `TDefaultOverrides`, since only overrides can
 * produce narrowed data.
 * @beta
 */
export type RequireNarrowedLoadDataOverrides<
  TDefaultOverrides,
  TOverrides extends TDefaultOverrides,
> = TDefaultOverrides extends TOverrides ? unknown : { loadDataOverrides: TOverrides };

/**
 * Returns the `key` loader of `loadDataOverrides`, preserving its exact type so that the data type it produces can be
 * derived with `LoadedData`.
 * @internal
 */
export function getLoadDataOverride<TOverrides extends Partial<Record<TKey, unknown>>, TKey extends string>(
  loadDataOverrides: TOverrides | undefined,
  key: TKey,
): TOverrides[TKey] | undefined {
  return loadDataOverrides === undefined ? undefined : loadDataOverrides[key];
}

/**
 * Lazily loads data with `loadDataOverride` when it's provided, or with `loadDefault` otherwise. The loader is invoked
 * on every subscription, so retries after failures call it again.
 *
 * Only an override can produce data narrower than `TDefault`, so without one `loadDefault` yields exactly the
 * resulting type. TypeScript can't follow that through the conditional type, so the implementation is typed loosely.
 * @internal
 */
export function loadData<TLoader extends (() => Subscribable<TDefault>) | undefined, TDefault>(props: {
  loadDataOverride: TLoader;
  loadDefault: () => Observable<TDefault>;
}): Observable<LoadedData<TLoader, TDefault>>;
export function loadData(props: {
  loadDataOverride: (() => Subscribable<unknown>) | undefined;
  loadDefault: () => Observable<unknown>;
}): Observable<unknown> {
  const { loadDataOverride, loadDefault } = props;
  return defer(() => (loadDataOverride ? toObservable(loadDataOverride()) : loadDefault()));
}
