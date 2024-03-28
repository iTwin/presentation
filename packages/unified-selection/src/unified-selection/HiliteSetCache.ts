/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { from, Observable, shareReplay } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { HiliteSet, HiliteSetProvider } from "./HiliteSetProvider";
import { IMetadataProvider } from "./queries/ECMetadata";
import { IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { StorageSelectionChangeEventArgs } from "./SelectionChangeEvent";
import { SelectionStorage } from "./SelectionStorage";

/**
 * Caches hilite set for the current `SelectionStorage` selection
 * so subsequent requests for the same input does not cost
 * @beta
 */
export interface HiliteSetCache {
  /** Get the current hilite set iterator for the specified imodel */
  getHiliteSet(props: {
    /** iModel to get hilite set for */
    iModelKey: string;
    /** ECSql query executor */
    queryExecutor: IECSqlQueryExecutor;
    /** EC metadata provider */
    metadataProvider: IMetadataProvider;
  }): AsyncIterableIterator<HiliteSet>;

  /** Clears hilite set cache for a given iModel */
  clearCache(props: {
    /** Key of the iModel to change selection for */
    iModelKey: string;
  }): void;

  /** Disposes the cache. */
  dispose(): void;
}

/**
 * Creates a hilite set cache. When an iModel is closed `HiliteSetCache.clearCache` function should be called.
 * @beta
 */
export function createCache(storage: SelectionStorage): HiliteSetCache {
  return new HiliteSetCacheImpl(storage);
}

class HiliteSetCacheImpl implements HiliteSetCache {
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProviders = new Map<string, HiliteSetProvider>();
  private _cache = new Map<string, Observable<HiliteSet>>();
  private _removeListener: () => void;

  constructor(selectionStorage: SelectionStorage) {
    this._selectionStorage = selectionStorage;
    this._removeListener = this._selectionStorage.selectionChangeEvent.addListener((args: StorageSelectionChangeEventArgs) =>
      this._cache.delete(args.iModelKey),
    );
  }

  public getHiliteSet(props: { iModelKey: string; queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider }): AsyncIterableIterator<HiliteSet> {
    const { iModelKey, queryExecutor, metadataProvider } = props;
    const provider = this.getHiliteSetProvider(iModelKey, queryExecutor, metadataProvider);
    let hiliteSet = this._cache.get(iModelKey);

    if (!hiliteSet) {
      const selection = this._selectionStorage.getSelection({ iModelKey });
      hiliteSet = from(provider.getHiliteSet(selection)).pipe(shareReplay({ refCount: true }));
      this._cache.set(iModelKey, hiliteSet);
    }

    return eachValueFrom(hiliteSet);
  }

  public clearCache({ iModelKey }: { iModelKey: string }): void {
    this._hiliteSetProviders.delete(iModelKey);
    this._cache.delete(iModelKey);
  }

  public dispose(): void {
    this._removeListener();
    this._hiliteSetProviders = new Map();
    this._cache = new Map();
  }

  private getHiliteSetProvider(iModelKey: string, queryExecutor: IECSqlQueryExecutor, metadataProvider: IMetadataProvider) {
    let provider = this._hiliteSetProviders.get(iModelKey);
    if (!provider) {
      provider = HiliteSetProvider.create({ queryExecutor, metadataProvider });
      this._hiliteSetProviders.set(iModelKey, provider);
    }
    return provider;
  }
}
