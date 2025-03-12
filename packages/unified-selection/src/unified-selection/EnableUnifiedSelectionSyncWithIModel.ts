/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./DisposePolyfill.js";
import { EMPTY, firstValueFrom, from, map, merge, Observable, Subject, takeUntil, toArray } from "rxjs";
import { Id64Arg, Id64Set } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import { CachingHiliteSetProvider, createCachingHiliteSetProvider } from "./CachingHiliteSetProvider.js";
import { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "./HiliteSetProvider.js";
import { SelectableInstanceKey, Selectables } from "./Selectable.js";
import { StorageSelectionChangeEventArgs, StorageSelectionChangeType } from "./SelectionChangeEvent.js";
import { computeSelection, SelectionScope } from "./SelectionScope.js";
import { SelectionStorage } from "./SelectionStorage.js";
import { CoreIModelHiliteSet, CoreIModelSelectionSet, CoreSelectableIds, CoreSelectionSetEventType, CoreSelectionSetEventUnsafe } from "./types/IModel.js";
import { safeDispose } from "./Utils.js";

/**
 * Props for `enableUnifiedSelectionSyncWithIModel`.
 * @public
 */
export interface EnableUnifiedSelectionSyncWithIModelProps {
  /**
   * Provides access to different iModel's features: query executing, class hierarchy, selection and hilite sets.
   *
   * It's recommended to use `@itwin/presentation-core-interop` to create `key`, `ECSqlQueryExecutor` and `ECSchemaProvider` from
   * [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/), and map its
   * `hilited` and `selectionSet` attributes like this:
   *
   * ```ts
   * import { createECSqlQueryExecutor, createECSchemaProvider, createIModelKey } from "@itwin/presentation-core-interop";
   * import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
   * import { IModelConnection } from "@itwin/core-frontend";
   *
   * const imodel: IModelConnection = ...
   * const imodelAccess = {
   *   ...createECSqlQueryExecutor(imodel),
   *   ...createCachingECClassHierarchyInspector({ schemaProvider: createECSchemaProvider(MyAppFrontend.getSchemaContext(imodel)) }),
   *   key: createIModelKey(imodel),
   *   hiliteSet: imodel.hilited,
   *   selectionSet: imodel.selectionSet,
   * };
   * ```
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

  /**
   * Unified selection storage to synchronize IModel's tool selection with. The storage should be shared
   * across all components in the application to ensure unified selection experience.
   */
  selectionStorage: SelectionStorage;

  /** Active selection scope provider. */
  activeScopeProvider: () => SelectionScope;

  /**
   * A caching hilite set provider used to retrieve hilite sets for an iModel. If not provided, a new `CachingHiliteSetProvider`
   * will be created for the given iModel using the provided `imodelAccess`.
   * If the consuming application already has a `CachingHiliteSetProvider` defined, it should be provided instead
   * to reuse the cache and avoid creating new providers for each iModel.
   *
   * The type is defined in a way that makes it required for provider to have either the deprecated `dispose` or the
   * new `Symbol.dispose` method.
   */
  cachingHiliteSetProvider?: CachingHiliteSetProvider | (Omit<CachingHiliteSetProvider, "dispose"> & { [Symbol.dispose]: () => void });
}

/**
 * Enables synchronization between iModel selection and unified selection.
 * @returns function for disposing the synchronization.
 * @public
 */
export function enableUnifiedSelectionSyncWithIModel(props: EnableUnifiedSelectionSyncWithIModelProps): () => void {
  const selectionHandler = new IModelSelectionHandler(props);
  return () => selectionHandler[Symbol.dispose]();
}

/**
 * A handler that syncs selection between unified selection storage (`SelectionStorage`) and
 * an iModel (`iModel.selectionSet`, `iModel.hilited`).
 *
 * @internal
 */
export class IModelSelectionHandler {
  private _selectionSourceName = "Tool";

  private _imodelAccess: EnableUnifiedSelectionSyncWithIModelProps["imodelAccess"];
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProvider: HiliteSetProvider;
  private _cachingHiliteSetProvider: NonNullable<EnableUnifiedSelectionSyncWithIModelProps["cachingHiliteSetProvider"]>;
  private _activeScopeProvider: () => SelectionScope;

  private _isSuspended: boolean;
  private _cancelOngoingChanges = new Subject<void>();
  private _unregisterUnifiedSelectionListener: () => void;
  private _unregisterIModelSelectionSetListener: () => void;
  private _hasCustomCachingHiliteSetProvider: boolean;

  public constructor(props: EnableUnifiedSelectionSyncWithIModelProps & { hiliteSetProvider?: HiliteSetProvider }) {
    this._imodelAccess = props.imodelAccess;
    this._selectionStorage = props.selectionStorage;
    this._activeScopeProvider = props.activeScopeProvider;
    this._isSuspended = false;
    this._hiliteSetProvider = props.hiliteSetProvider ?? createHiliteSetProvider({ imodelAccess: this._imodelAccess });
    this._hasCustomCachingHiliteSetProvider = !!props.cachingHiliteSetProvider;
    this._cachingHiliteSetProvider =
      props.cachingHiliteSetProvider /* c8 ignore next */ ??
      /* c8 ignore next 4 */ createCachingHiliteSetProvider({
        selectionStorage: this._selectionStorage,
        imodelProvider: () => this._imodelAccess,
        createHiliteSetProvider: () => this._hiliteSetProvider,
      });

    this._unregisterIModelSelectionSetListener = this._imodelAccess.selectionSet.onChanged.addListener(this.onIModelSelectionChanged);
    this._unregisterUnifiedSelectionListener = this._selectionStorage.selectionChangeEvent.addListener(this.onUnifiedSelectionChanged);

    if (!is5xSelectionSet(this._imodelAccess.selectionSet)) {
      // itwinjs-core@4: stop imodel from syncing tool selection with hilited list - we want to manage that sync ourselves
      this._imodelAccess.hiliteSet.wantSyncWithSelectionSet = false;
    }

    this.applyCurrentHiliteSet({ activeSelectionAction: "clearAll" });
  }

  public [Symbol.dispose]() {
    this._cancelOngoingChanges.next();
    this._unregisterIModelSelectionSetListener();
    this._unregisterUnifiedSelectionListener();
    /* c8 ignore next 3 */
    if (!this._hasCustomCachingHiliteSetProvider) {
      safeDispose(this._cachingHiliteSetProvider);
    }
  }

  /** Temporarily suspends tool selection synchronization until the returned disposable object is disposed. */
  public suspendIModelToolSelectionSync() {
    const wasSuspended = this._isSuspended;
    this._isSuspended = true;
    return {
      [Symbol.dispose]: () => {
        this._isSuspended = wasSuspended;
      },
    };
  }

  private handleUnifiedSelectionChange(changeType: StorageSelectionChangeType, selectables: Selectables, source: string): void {
    switch (changeType) {
      case "clear":
        return this.applyCurrentHiliteSet({ activeSelectionAction: "clearAll" });
      case "replace":
        return this.applyCurrentHiliteSet({
          activeSelectionAction:
            source === this._selectionSourceName
              ? is5xSelectionSet(this._imodelAccess.selectionSet)
                ? // with 5x core we don't need to clear anything when event is triggered by a Tool (hilite and selection sets are in sync already)
                  "keep"
                : // with 4x core we need to clear hilite set, because it's not synced with selection set
                  "clearHilited"
              : // when event is triggered not by a Tool, we need to clear everything
                "clearAll",
        });
      case "add":
        return void from(this._hiliteSetProvider.getHiliteSet({ selectables }))
          .pipe(takeUntil(this._cancelOngoingChanges))
          .subscribe({
            next: (set) => {
              this.addHiliteSet(set);
            },
          });
      case "remove":
        return void from(this._hiliteSetProvider.getHiliteSet({ selectables }))
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
      using _dispose = this.suspendIModelToolSelectionSync();
      if (!is5xSelectionSet(this._imodelAccess.selectionSet)) {
        this._imodelAccess.hiliteSet.clear();
      }
      if (activeSelectionAction === "clearAll") {
        this._imodelAccess.selectionSet.emptyAll();
      }
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
    using _dispose = this.suspendIModelToolSelectionSync();
    if (is5xSelectionSet(this._imodelAccess.selectionSet)) {
      // with 5.x core we can simply add the set as a whole
      this._imodelAccess.selectionSet.add({
        models: set.models,
        subcategories: set.subCategories,
        elements: set.elements,
      });
    } else {
      // pre-5.0 core requires adding models and subcategories to hilite set separately
      if (set.models.length) {
        this._imodelAccess.hiliteSet.models.addIds(set.models);
      }
      if (set.subCategories.length) {
        this._imodelAccess.hiliteSet.subcategories.addIds(set.subCategories);
      }
      if (set.elements.length) {
        this._imodelAccess.hiliteSet.elements.addIds(set.elements);
        this._imodelAccess.selectionSet.add(set.elements);
      }
    }
  }

  private removeHiliteSet(set: HiliteSet) {
    using _dispose = this.suspendIModelToolSelectionSync();
    if (is5xSelectionSet(this._imodelAccess.selectionSet)) {
      // with 5.x core we can simply remove the set as a whole
      this._imodelAccess.selectionSet.remove({
        models: set.models,
        subcategories: set.subCategories,
        elements: set.elements,
      });
    } else {
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
    }
  }

  private onIModelSelectionChanged = async (event: CoreSelectionSetEventUnsafe): Promise<void> => {
    if (this._isSuspended) {
      return;
    }

    if (CoreSelectionSetEventType.Clear === event.type) {
      this._selectionStorage.clearSelection({ imodelKey: this._imodelAccess.key, source: this._selectionSourceName });
      return;
    }

    const ids = this.getSelectionSetChangeIds(event);
    const scopedSelection = merge(
      ids.elements
        ? from(computeSelection({ queryExecutor: this._imodelAccess, elementIds: ids.elements, scope: this._activeScopeProvider() }))
        : /* c8 ignore next */ EMPTY,
      ids.models ? from(ids.models).pipe(map((id) => ({ className: "BisCore.Model", id }))) : /* c8 ignore next */ EMPTY,
      ids.subcategories ? from(ids.subcategories).pipe(map((id) => ({ className: "BisCore.SubCategory", id }))) : /* c8 ignore next */ EMPTY,
    );
    await this.handleIModelSelectionChange(event.type, scopedSelection);
  };

  private async handleIModelSelectionChange(type: CoreSelectionSetEventType, keys: Observable<SelectableInstanceKey>) {
    const selectables = await firstValueFrom(keys.pipe(toArray()));
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

  private getSelectionSetChangeIds(
    event: Omit<CoreSelectionSetEventUnsafe, "type"> & {
      type: CoreSelectionSetEventType.Add | CoreSelectionSetEventType.Remove | CoreSelectionSetEventType.Replace;
    },
  ): CoreSelectableIds {
    switch (event.type) {
      case CoreSelectionSetEventType.Add:
        return event.additions ?? (event.added ? { elements: event.added } : /* c8 ignore next */ {});
      case CoreSelectionSetEventType.Remove:
        return event.removals ?? (event.removed ? { elements: event.removed } : /* c8 ignore next */ {});
      case CoreSelectionSetEventType.Replace:
        return "active" in event.set ? event.set.active : { elements: event.set.elements };
    }
  }
}

function is5xSelectionSet(selectionSet: CoreIModelSelectionSet): selectionSet is Omit<CoreIModelSelectionSet, "add" | "remove"> & {
  readonly active: { [P in keyof CoreSelectableIds]-?: Id64Set };
  add: (ids: Id64Arg | CoreSelectableIds) => boolean;
  remove: (ids: Id64Arg | CoreSelectableIds) => boolean;
} {
  return "active" in selectionSet;
}
