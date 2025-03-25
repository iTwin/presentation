/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./DisposePolyfill.js";
import { from, Observable, shareReplay } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { ECClassHierarchyInspector, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "./HiliteSetProvider.js";
import { StorageSelectionChangeEventArgs } from "./SelectionChangeEvent.js";
import { IMODEL_CLOSE_SELECTION_CLEAR_SOURCE, SelectionStorage } from "./SelectionStorage.js";

/**
 * Props for creating a `CachingHiliteSetProvider` instance.
 * @public
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
 */
export function createCachingHiliteSetProvider(props: CachingHiliteSetProviderProps): CachingHiliteSetProvider & { [Symbol.dispose]: () => void } {
  return new CachingHiliteSetProviderImpl(props);
}

class CachingHiliteSetProviderImpl implements CachingHiliteSetProvider {
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProviders = new Map<string, HiliteSetProvider>();
  private _cache = new Map<string, Observable<HiliteSet>>();
  private _removeListener: () => void;
  private _imodelProvider: (imodelKey: string) => ECClassHierarchyInspector & ECSqlQueryExecutor;
  private _createHiliteSetProvider: typeof createHiliteSetProvider;

  constructor(props: CachingHiliteSetProviderProps) {
    this._selectionStorage = props.selectionStorage;
    this._imodelProvider = props.imodelProvider;
    this._removeListener = this._selectionStorage.selectionChangeEvent.addListener((args: StorageSelectionChangeEventArgs) => {
      this._cache.delete(args.imodelKey);
      if (args.changeType === "clear" && args.source === IMODEL_CLOSE_SELECTION_CLEAR_SOURCE) {
        this._hiliteSetProviders.delete(args.imodelKey);
      }
    });
    this._createHiliteSetProvider = props.createHiliteSetProvider ?? /* c8 ignore next */ createHiliteSetProvider;
  }

  public getHiliteSet({ imodelKey }: { imodelKey: string }): AsyncIterableIterator<HiliteSet> {
    const imodelAccess = this._imodelProvider(imodelKey);
    const provider = this.getHiliteSetProvider(imodelKey, imodelAccess);
    let hiliteSet = this._cache.get(imodelKey);

    if (!hiliteSet) {
      const selectables = this._selectionStorage.getSelection({ imodelKey });
      hiliteSet = from(provider.getHiliteSet({ selectables })).pipe(shareReplay({ refCount: true }));
      this._cache.set(imodelKey, hiliteSet);
    }

    return eachValueFrom(hiliteSet);
  }

  public [Symbol.dispose](): void {
    this._removeListener();
    this._hiliteSetProviders = new Map();
    this._cache = new Map();
  }

  /* c8 ignore next 3 */
  public dispose(): void {
    this[Symbol.dispose]();
  }

  private getHiliteSetProvider(imodelKey: string, imodelAccess: ECClassHierarchyInspector & ECSqlQueryExecutor) {
    let provider = this._hiliteSetProviders.get(imodelKey);
    if (!provider) {
      provider = this._createHiliteSetProvider({ imodelAccess });
      this._hiliteSetProviders.set(imodelKey, provider);
    }
    return provider;
  }
}
