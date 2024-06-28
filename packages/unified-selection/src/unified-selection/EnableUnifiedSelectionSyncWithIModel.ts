/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, Subject, takeUntil } from "rxjs";
import { assert, Id64Arg, using } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import { CachingHiliteSetProvider, createCachingHiliteSetProvider } from "./CachingHiliteSetProvider";
import { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "./HiliteSetProvider";
import { SelectableInstanceKey, Selectables } from "./Selectable";
import { StorageSelectionChangeEventArgs, StorageSelectionChangeType } from "./SelectionChangeEvent";
import { computeSelection, ComputeSelectionProps } from "./SelectionScope";
import { SelectionStorage } from "./SelectionStorage";
import { CoreIModelHiliteSet, CoreIModelSelectionSet, CoreSelectionSetEventType, CoreSelectionSetEventUnsafe } from "./types/IModel";

/**
 * Props for `enableUnifiedSelectionSyncWithIModel`.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export interface EnableUnifiedSelectionSyncWithIModelProps {
  /**
   * Provides access to different iModel's features: query executing, class hierarchy, selection and hilite sets.
   * It's recommended to use `@itwin/presentation-core-interop` to create `ECSqlQueryExecutor` and `ECSchemaProvider` from
   * [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/) and map its `key`,
   * `hilited` and `selectionSet` attributes like this:
   *
   * ```ts
   * import { createECSqlQueryExecutor, createECSchemaProvider } from "@itwin/presentation-core-interop";
   * import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
   * import { IModelConnection } from "@itwin/core-frontend";
   *
   * const imodel: IModelConnection = ...
   * const imodelAccess = {
   *   ...createECSqlQueryExecutor(imodel),
   *   ...createCachingECClassHierarchyInspector({ schemaProvider: createECSchemaProvider(MyAppFrontend.getSchemaContext(imodel)) }),
   *   key: imodel.key,
   *   hiliteSet: imodel.hilited,
   *   selectionSet: imodel.selectionSet,
   * };
   * ```.
   */
  imodelAccess: ECSqlQueryExecutor &
    ECClassHierarchyInspector & {
      /** Key of the iModel. Generally taken from `IModelConnection.key`. */
      readonly key: string;
      /** The set of currently hilited elements taken from `IModelConnection.hilited`. */
      readonly hiliteSet: CoreIModelHiliteSet;
      /** The set of currently selected elements taken from `IModelConnection.selectionSet`. */
      readonly selectionSet: CoreIModelSelectionSet;
    };

  /** Selection storage to synchronize IModel's tool selection with. */
  selectionStorage: SelectionStorage;

  /** Active scope provider. */
  activeScopeProvider: () => ComputeSelectionProps["scope"];

  /**
   * A caching hilite set provider used to retrieve hilite sets for an iModel. If not provided, a new `CachingHiliteSetProvider`
   * will be created for the given iModel using the provided `imodelAccess`.
   * If the consuming application already has a `CachingHiliteSetProvider` defined, it should be provided instead
   * to reuse the cache and avoid creating new providers for each iModel.
   */
  cachingHiliteSetProvider?: CachingHiliteSetProvider;
}

/**
 * Enables synchronization between iModel selection and unified selection.
 * @returns function for disposing the synchronization.
 * @beta
 */
export function enableUnifiedSelectionSyncWithIModel(props: EnableUnifiedSelectionSyncWithIModelProps): () => void {
  const selectionHandler = new IModelSelectionHandler(props);
  return () => selectionHandler.dispose();
}

/**
 * A handler that syncs selection between unified selection storage
 * (`SelectionStorage`) and an iModel (`iModel.selectionSet`, `iModel.hilited`).
 * @internal
 */
export class IModelSelectionHandler {
  private _selectionSourceName = "Tool";

  private _imodelAccess: EnableUnifiedSelectionSyncWithIModelProps["imodelAccess"];
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProvider: HiliteSetProvider;
  private _cachingHiliteSetProvider: CachingHiliteSetProvider;
  private _activeScopeProvider: () => ComputeSelectionProps["scope"];

  private _isSuspended: boolean;
  private _cancelOngoingChanges = new Subject<void>();
  private _unifiedSelectionListenerDisposeFunc: () => void;
  private _imodelListenerDisposeFunc: () => void;
  private _hasCustomCachingHiliteSetProvider: boolean;

  public constructor(props: EnableUnifiedSelectionSyncWithIModelProps) {
    this._imodelAccess = props.imodelAccess;
    this._selectionStorage = props.selectionStorage;
    this._activeScopeProvider = props.activeScopeProvider;
    this._isSuspended = false;
    this._hasCustomCachingHiliteSetProvider = !!props.cachingHiliteSetProvider;

    this._cachingHiliteSetProvider =
      props.cachingHiliteSetProvider ??
      createCachingHiliteSetProvider({
        selectionStorage: this._selectionStorage,
        imodelProvider: () => this._imodelAccess,
      });

    this._hiliteSetProvider = createHiliteSetProvider({ imodelAccess: this._imodelAccess });
    this._imodelListenerDisposeFunc = this._imodelAccess.selectionSet.onChanged.addListener(this.onIModelSelectionChanged);
    this._unifiedSelectionListenerDisposeFunc = this._selectionStorage.selectionChangeEvent.addListener(this.onUnifiedSelectionChanged);

    // stop imodel from syncing tool selection with hilited list - we want to override that behavior
    this._imodelAccess.hiliteSet.wantSyncWithSelectionSet = false;
    this.applyCurrentHiliteSet({ activeSelectionAction: "clearAll" });
  }

  public dispose() {
    this._cancelOngoingChanges.next();
    this._imodelListenerDisposeFunc();
    this._unifiedSelectionListenerDisposeFunc();
    if (!this._hasCustomCachingHiliteSetProvider) {
      this._cachingHiliteSetProvider.dispose();
    }
  }

  /** Temporarily suspends tool selection synchronization until the returned `IDisposable` is disposed. */
  public suspendIModelToolSelectionSync() {
    const wasSuspended = this._isSuspended;
    this._isSuspended = true;
    return {
      dispose: () => (this._isSuspended = wasSuspended),
    };
  }

  private handleUnifiedSelectionChange(changeType: StorageSelectionChangeType, selectables: Selectables, source: string) {
    if (changeType === "clear" || changeType === "replace") {
      this.applyCurrentHiliteSet({ activeSelectionAction: changeType === "replace" && source === "Tool" ? "clearHilited" : "clearAll" });
      return;
    }

    if (changeType === "add") {
      from(this._hiliteSetProvider.getHiliteSet({ selectables }))
        .pipe(takeUntil(this._cancelOngoingChanges))
        .subscribe({
          next: (set) => {
            this.addHiliteSet(set);
          },
        });
      return;
    }

    from(this._hiliteSetProvider.getHiliteSet({ selectables }))
      .pipe(takeUntil(this._cancelOngoingChanges))
      .subscribe({
        next: (set) => {
          this.removeHiliteSet(set);
        },
        complete: () => {
          this.applyCurrentHiliteSet({ activeSelectionAction: "keep" });
        },
      });
  }

  private onUnifiedSelectionChanged = (args: StorageSelectionChangeEventArgs) => {
    // iModels are only interested in top-level selection changes
    if (args.imodelKey !== this._imodelAccess.key || args.level !== 0) {
      return;
    }

    if (args.changeType === "replace" || args.changeType === "clear") {
      this._cancelOngoingChanges.next();
    }
    this.handleUnifiedSelectionChange(args.changeType, args.selectables, args.source);
  };

  private applyCurrentHiliteSet({ activeSelectionAction }: { activeSelectionAction: "clearAll" | "clearHilited" | "keep" }) {
    if (activeSelectionAction !== "keep") {
      using(this.suspendIModelToolSelectionSync(), (_) => {
        this._imodelAccess.hiliteSet.clear();
        if (activeSelectionAction === "clearAll") {
          this._imodelAccess.selectionSet.emptyAll();
        }
      });
    }

    from(this._cachingHiliteSetProvider.getHiliteSet({ imodelKey: this._imodelAccess.key }))
      .pipe(takeUntil(this._cancelOngoingChanges))
      .subscribe({
        next: (ids) => {
          this.addHiliteSet(ids);
        },
      });
  }

  private addHiliteSet(set: HiliteSet) {
    using(this.suspendIModelToolSelectionSync(), (_) => {
      if (set.models && set.models.length) {
        this._imodelAccess.hiliteSet.models.addIds(set.models);
      }
      if (set.subCategories && set.subCategories.length) {
        this._imodelAccess.hiliteSet.subcategories.addIds(set.subCategories);
      }
      if (set.elements && set.elements.length) {
        this._imodelAccess.hiliteSet.elements.addIds(set.elements);
        this._imodelAccess.selectionSet.add(set.elements);
      }
    });
  }

  private removeHiliteSet(set: HiliteSet) {
    using(this.suspendIModelToolSelectionSync(), (_) => {
      if (set.models.length) {
        this._imodelAccess.hiliteSet.models.deleteIds(set.models);
      }
      if (set.subCategories.length) {
        this._imodelAccess.hiliteSet.subcategories.deleteIds(set.subCategories);
      }
      if (set.elements.length) {
        this._imodelAccess.hiliteSet.elements.deleteIds(set.elements);
        this._imodelAccess.selectionSet.remove(set.elements);
      }
    });
  }

  private onIModelSelectionChanged = async (event?: CoreSelectionSetEventUnsafe): Promise<void> => {
    if (this._isSuspended) {
      return;
    }

    if (CoreSelectionSetEventType.Clear === event!.type) {
      this._selectionStorage.clearSelection({ imodelKey: this._imodelAccess.key, source: this._selectionSourceName });
      return;
    }

    const elementIds = this.getSelectionSetChangeIds(event!);
    const scopedSelection = computeSelection({ queryExecutor: this._imodelAccess, elementIds, scope: this._activeScopeProvider() });
    await this.handleIModelSelectionChange(event!.type, scopedSelection);
  };

  private async handleIModelSelectionChange(type: CoreSelectionSetEventType, iterator: AsyncIterableIterator<SelectableInstanceKey>) {
    const selectables: SelectableInstanceKey[] = [];
    for await (const selectable of iterator) {
      selectables.push(selectable);
    }
    const props = {
      imodelKey: this._imodelAccess.key,
      source: this._selectionSourceName,
      selectables,
    };
    switch (type) {
      case CoreSelectionSetEventType.Add:
        return this._selectionStorage.addToSelection(props);
      case CoreSelectionSetEventType.Remove:
        return this._selectionStorage.removeFromSelection(props);
      case CoreSelectionSetEventType.Replace:
        return this._selectionStorage.replaceSelection(props);
    }
  }

  private getSelectionSetChangeIds(event: CoreSelectionSetEventUnsafe): string[] {
    switch (event.type) {
      case CoreSelectionSetEventType.Add:
      case CoreSelectionSetEventType.Replace:
        assert(!!event.added);
        return this.idArgToIds(event.added);
      default:
        assert(!!event.removed);
        return this.idArgToIds(event.removed);
    }
  }

  private idArgToIds(ids: Id64Arg): string[] {
    if (typeof ids === "string") {
      return [ids];
    }
    if (ids instanceof Set) {
      return [...ids];
    }
    return ids;
  }
}
