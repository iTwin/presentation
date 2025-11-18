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
 * Props for creating an `IModelHiliteSetProvider` instance.
 * @public
 */
export interface IModelHiliteSetProviderProps {
  /** Selection storage to use for retrieving the hilite set. */
  selectionStorage: SelectionStorage;

  /** A callback that should return iModel access by iModel key. */
  imodelProvider: (imodelKey: string) => ECClassHierarchyInspector & ECSqlQueryExecutor;

  /** An optional hilite set provider factory. If not provided, defaults to `createHiliteSetProvider` from this package. */
  createHiliteSetProvider?: typeof createHiliteSetProvider;
}

/**
 * Defines return value of `createIModelHiliteSetProvider`.
 *
 * **Warning:** Used in public API as a return value. Not expected to be created / extended by package
 * consumers, may be supplemented with required attributes any time.
 *
 * @see `createIModelHiliteSetProvider`
 * @public
 */
export interface IModelHiliteSetProvider {
  /** Get the hilite set provider for the specified iModel. */
  getHiliteSetProvider(props: {
    /** iModel to get hilite set provider for */
    imodelKey: string;
  }): HiliteSetProvider;

  /** Get the hilite set iterator for active selection in the specified iModel. */
  getCurrentHiliteSet(props: {
    /** iModel to get hilite set for */
    imodelKey: string;
  }): AsyncIterableIterator<HiliteSet>;

  /**
   * Disposes the cache.
   */
  [Symbol.dispose]: () => void;
}

/**
 * Creates a hilite set provider that can efficiently get a hilite set for the "active" selection in an iModel.
 *
 * This specific implementation caches the hilite set for the current selection, so subsequent hilite set
 * requests for the same iModel, don't cost until selection changes.
 *
 * @public
 */
export function createIModelHiliteSetProvider(props: IModelHiliteSetProviderProps): IModelHiliteSetProvider {
  return new IModelHiliteSetProviderImpl(props);
}

class IModelHiliteSetProviderImpl implements IModelHiliteSetProvider {
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProviders = new Map<string, HiliteSetProvider>();
  private _cache = new Map<string, Observable<HiliteSet>>();
  private _removeListener: () => void;
  private _imodelProvider: (imodelKey: string) => ECClassHierarchyInspector & ECSqlQueryExecutor;
  private _createHiliteSetProvider: typeof createHiliteSetProvider;

  constructor(props: IModelHiliteSetProviderProps) {
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

  public getHiliteSetProvider({ imodelKey }: { imodelKey: string }): HiliteSetProvider {
    let provider = this._hiliteSetProviders.get(imodelKey);
    if (!provider) {
      provider = this._createHiliteSetProvider({ imodelAccess: this._imodelProvider(imodelKey) });
      this._hiliteSetProviders.set(imodelKey, provider);
    }
    return provider;
  }

  public getCurrentHiliteSet({ imodelKey }: { imodelKey: string }): AsyncIterableIterator<HiliteSet> {
    let hiliteSet = this._cache.get(imodelKey);
    if (!hiliteSet) {
      const selectables = this._selectionStorage.getSelection({ imodelKey });
      hiliteSet = from(this.getHiliteSetProvider({ imodelKey }).getHiliteSet({ selectables })).pipe(shareReplay({ refCount: true }));
      this._cache.set(imodelKey, hiliteSet);
    }
    return eachValueFrom(hiliteSet);
  }

  public [Symbol.dispose](): void {
    this._removeListener();
    this._hiliteSetProviders = new Map();
    this._cache = new Map();
  }
}
