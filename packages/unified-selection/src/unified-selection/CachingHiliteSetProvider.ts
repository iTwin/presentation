/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { from, Observable, shareReplay } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "./HiliteSetProvider";
import { StorageSelectionChangeEventArgs } from "./SelectionChangeEvent";
import { IMODEL_CLOSE_SELECTION_CLEAR_SOURCE, SelectionStorage } from "./SelectionStorage";
import { ECSchemaProvider } from "./types/ECMetadata";
import { ECSqlQueryExecutor } from "./types/ECSqlCore";

/**
 * Props for creating a `CachingHiliteSetProvider` instance.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export interface CachingHiliteSetProviderProps {
  selectionStorage: SelectionStorage;
  imodelProvider: (imodelKey: string) => ECSchemaProvider & ECSqlQueryExecutor;
}

/**
 * Defines return value of `createCachingHiliteSetProvider`.
 *
 * @beta Used in public API as a return value. Not expected to be created / extended by package
 * consumers, may be supplemented with required attributes any time.
 */
export interface CachingHiliteSetProvider {
  /** Get the current hilite set iterator for the specified imodel */
  getHiliteSet(props: {
    /** iModel to get hilite set for */
    imodelKey: string;
  }): AsyncIterableIterator<HiliteSet>;

  /** Disposes the cache. */
  dispose(): void;
}

/**
 * Creates a hilite set provider that caches hilite set for current selection for given iModel so any subsequent
 * hilite set requests for the same iModel don't cost until selection in given selection storage changes.
 * @beta
 */
export function createCachingHiliteSetProvider(props: CachingHiliteSetProviderProps): CachingHiliteSetProvider {
  return new CachingHiliteSetProviderImpl(props);
}

class CachingHiliteSetProviderImpl implements CachingHiliteSetProvider {
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProviders = new Map<string, HiliteSetProvider>();
  private _cache = new Map<string, Observable<HiliteSet>>();
  private _removeListener: () => void;
  private _imodelProvider: (imodelKey: string) => ECSchemaProvider & ECSqlQueryExecutor;

  constructor(props: CachingHiliteSetProviderProps) {
    this._selectionStorage = props.selectionStorage;
    this._imodelProvider = props.imodelProvider;
    this._removeListener = this._selectionStorage.selectionChangeEvent.addListener((args: StorageSelectionChangeEventArgs) => {
      this._cache.delete(args.imodelKey);
      if (args.changeType === "clear" && args.source === IMODEL_CLOSE_SELECTION_CLEAR_SOURCE) {
        this._hiliteSetProviders.delete(args.imodelKey);
      }
    });
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

  public dispose(): void {
    this._removeListener();
    this._hiliteSetProviders = new Map();
    this._cache = new Map();
  }

  private getHiliteSetProvider(imodelKey: string, imodelAccess: ECSchemaProvider & ECSqlQueryExecutor) {
    let provider = this._hiliteSetProviders.get(imodelKey);
    if (!provider) {
      provider = createHiliteSetProvider({ imodelAccess });
      this._hiliteSetProviders.set(imodelKey, provider);
    }
    return provider;
  }
}
