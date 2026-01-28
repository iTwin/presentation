/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import "./DisposePolyfill.js";

import { createIModelHiliteSetProvider } from "./IModelHiliteSetProvider.js";

import type { ECClassHierarchyInspector, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { createHiliteSetProvider, HiliteSet } from "./HiliteSetProvider.js";
import type { SelectionStorage } from "./SelectionStorage.js";

/**
 * Props for creating a `CachingHiliteSetProvider` instance.
 * @public
 * @deprecated in 1.5. Use `IModelHiliteSetProviderProps` instead.
 */
export interface CachingHiliteSetProviderProps {
  /** Selection storage to use for retrieving the hilite set. */
  selectionStorage: SelectionStorage;

  /** A callback that should return iModel access by iModel key. */
  imodelProvider: (imodelKey: string) => ECClassHierarchyInspector & ECSqlQueryExecutor;

  /** An optional hilite set provider factory. If not provided, defaults to `createHiliteSetProvider` from this package. */
  createHiliteSetProvider?: typeof createHiliteSetProvider;
}

/**
 * Defines return value of `createCachingHiliteSetProvider`.
 *
 * **Warning:** Used in public API as a return value. Not expected to be created / extended by package
 * consumers, may be supplemented with required attributes any time.
 *
 * @see `createCachingHiliteSetProvider`
 * @public
 * @deprecated in 1.5. Use `IModelHiliteSetProvider` instead.
 */
export interface CachingHiliteSetProvider {
  /** Get the current hilite set iterator for the specified imodel */
  getHiliteSet(props: {
    /** iModel to get hilite set for */
    imodelKey: string;
  }): AsyncIterableIterator<HiliteSet>;

  /**
   * Disposes the cache.
   *
   * Optional to avoid breaking the API. Will be made required when the deprecated
   * `dispose` is removed.
   */
  [Symbol.dispose]?: () => void;

  /**
   * Disposes the cache.
   * @deprecated in 1.2. Use `[Symbol.dispose]` instead.
   */
  dispose(): void;
}

/**
 * Creates a hilite set provider that caches hilite set for current selection for given iModel so any subsequent
 * hilite set requests for the same iModel don't cost until selection in given selection storage changes.
 * @public
 * @deprecated in 1.5. Use `createIModelHiliteSetProvider` instead.
 */
/* c8 ignore start */
export function createCachingHiliteSetProvider(props: CachingHiliteSetProviderProps): CachingHiliteSetProvider & { [Symbol.dispose]: () => void } {
  const provider = createIModelHiliteSetProvider(props);
  return {
    getHiliteSet: (hiliteSetProps: { imodelKey: string }) => provider.getCurrentHiliteSet(hiliteSetProps),
    [Symbol.dispose]: () => provider[Symbol.dispose](),
    dispose: () => provider[Symbol.dispose](),
  };
}
/* c8 ignore end */
