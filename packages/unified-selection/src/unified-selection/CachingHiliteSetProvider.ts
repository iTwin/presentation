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
import { IMetadataProvider } from "./queries/ECMetadata";
import { IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { StorageSelectionChangeEventArgs } from "./SelectionChangeEvent";
import { IMODEL_CLOSE_SELECTION_CLEAR_SOURCE, SelectionStorage } from "./SelectionStorage";

/**
 * Props for creating a `CachingHiliteSetProvider` instance.
 * @beta
 */
export interface CachingHiliteSetProviderProps {
  selectionStorage: SelectionStorage;
  iModelProvider: (iModelKey: string) => { queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider };
}

/**
 * Caches hilite set for the current `SelectionStorage` selection
 * so subsequent requests for the same input does not cost
 * @beta
 */
export interface CachingHiliteSetProvider {
  /** Get the current hilite set iterator for the specified imodel */
  getHiliteSet(props: {
    /** iModel to get hilite set for */
    iModelKey: string;
  }): AsyncIterableIterator<HiliteSet>;

  /** Disposes the cache. */
  dispose(): void;
}

/**
 * Creates a hilite set provider that caches hilite set for selection.
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
  private _iModelProvider: (iModelKey: string) => { queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider };

  constructor(props: CachingHiliteSetProviderProps) {
    this._selectionStorage = props.selectionStorage;
    this._iModelProvider = props.iModelProvider;
    this._removeListener = this._selectionStorage.selectionChangeEvent.addListener((args: StorageSelectionChangeEventArgs) => {
      this._cache.delete(args.iModelKey);
      if (args.changeType === "clear" && args.source === IMODEL_CLOSE_SELECTION_CLEAR_SOURCE) {
        this._hiliteSetProviders.delete(args.iModelKey);
      }
    });
  }

  public getHiliteSet({ iModelKey }: { iModelKey: string }): AsyncIterableIterator<HiliteSet> {
    const { queryExecutor, metadataProvider } = this._iModelProvider(iModelKey);
    const provider = this.getHiliteSetProvider(iModelKey, queryExecutor, metadataProvider);
    let hiliteSet = this._cache.get(iModelKey);

    if (!hiliteSet) {
      const selectables = this._selectionStorage.getSelection({ iModelKey });
      hiliteSet = from(provider.getHiliteSet({ selectables })).pipe(shareReplay({ refCount: true }));
      this._cache.set(iModelKey, hiliteSet);
    }

    return eachValueFrom(hiliteSet);
  }

  public dispose(): void {
    this._removeListener();
    this._hiliteSetProviders = new Map();
    this._cache = new Map();
  }

  private getHiliteSetProvider(iModelKey: string, queryExecutor: IECSqlQueryExecutor, metadataProvider: IMetadataProvider) {
    let provider = this._hiliteSetProviders.get(iModelKey);
    if (!provider) {
      provider = createHiliteSetProvider({ queryExecutor, metadataProvider });
      this._hiliteSetProviders.set(iModelKey, provider);
    }
    return provider;
  }
}
