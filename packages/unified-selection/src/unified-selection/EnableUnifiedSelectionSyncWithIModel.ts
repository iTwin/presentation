/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./DisposePolyfill.js";
import { EMPTY, firstValueFrom, from, map, merge, Subject, takeUntil, toArray } from "rxjs";
import { Guid, GuidString, Id64Arg, Id64Set } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import { CachingHiliteSetProvider } from "./CachingHiliteSetProvider.js";
import { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "./HiliteSetProvider.js";
import { createIModelHiliteSetProvider, IModelHiliteSetProvider } from "./IModelHiliteSetProvider.js";
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
   * An iModel hilite set provider used to retrieve hilite sets for different iModels. If not provided, a new `IModelHiliteSetProvider`
   * will be created for the given iModel using the provided `imodelAccess`.
   * If the consuming application already has a `IModelHiliteSetProvider` defined, it should be provided instead
   * to reuse the cache and avoid creating new providers for each iModel.
   *
   * @see `createIModelHiliteSetProvider`
   */
  imodelHiliteSetProvider?: IModelHiliteSetProvider;

  /**
   * A caching hilite set provider used to retrieve hilite sets for an iModel. If not provided, a new `CachingHiliteSetProvider`
   * will be created for the given iModel using the provided `imodelAccess`.
   * If the consuming application already has a `CachingHiliteSetProvider` defined, it should be provided instead
   * to reuse the cache and avoid creating new providers for each iModel.
   *
   * The type is defined in a way that makes it required for provider to have either the deprecated `dispose` or the
   * new `Symbol.dispose` method.
   *
   * **Warning:** When the given `CachingHiliteSetProvider` internally uses a custom `HiliteSetProvider`, the synchronization has
   * no access to it, and thus uses its own, default, `HiliteSetProvider`. As a result, the synchronization may not work as expected.
   * To alleviate this, the `imodelHiliteSetProvider` prop should be used instead.
   *
   * @deprecated in 1.5. Use `imodelHiliteSetProvider` prop instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
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
  private _imodelHiliteSetProvider: NonNullable<EnableUnifiedSelectionSyncWithIModelProps["imodelHiliteSetProvider"]>;
  private _activeScopeProvider: () => SelectionScope;

  private _isSuspended: boolean;
  private _selectionStorageChangeTracker = 0;
  private _cancelOngoingChanges = new Subject<void>();
  private _unregisterUnifiedSelectionListener: () => void;
  private _unregisterIModelSelectionSetListener: () => void;
  private _disposeInternalHiliteSetProvider: () => void;

  #componentId: GuidString;

  public constructor(props: EnableUnifiedSelectionSyncWithIModelProps & { hiliteSetProvider?: HiliteSetProvider }) {
    this.#componentId = Guid.createValue();
    this._imodelAccess = props.imodelAccess;
    this._selectionStorage = props.selectionStorage;
    this._activeScopeProvider = props.activeScopeProvider;
    this._isSuspended = false;
    [this._imodelHiliteSetProvider, this._disposeInternalHiliteSetProvider] = (() => {
      if (props.imodelHiliteSetProvider) {
        return [props.imodelHiliteSetProvider, () => {}];
      }
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (props.cachingHiliteSetProvider) {
        return [
          createIModelHiliteSetProviderFromCachingProvider(
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            props.cachingHiliteSetProvider,
            props.hiliteSetProvider ?? createHiliteSetProvider({ imodelAccess: props.imodelAccess }),
          ),
          // don't need to dispose anything, because our wrapper has no dispose logic, and `cachingHiliteSetProvider` should be disposed
          // by whoever owns it
          () => {},
        ];
      }
      /* c8 ignore start */
      const internalProvider = createIModelHiliteSetProvider({
        selectionStorage: this._selectionStorage,
        imodelProvider: () => this._imodelAccess,
        createHiliteSetProvider: () => props.hiliteSetProvider ?? createHiliteSetProvider({ imodelAccess: props.imodelAccess }),
      });
      return [internalProvider, () => safeDispose(internalProvider)];
      /* c8 ignore end */
    })();

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
    this._disposeInternalHiliteSetProvider();
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

  private syncHiliteSet(props: { changeType: StorageSelectionChangeType; selectables: Selectables; source: string }): void {
    const { changeType, selectables, source } = props;
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
        return void from(this._imodelHiliteSetProvider.getHiliteSetProvider({ imodelKey: this._imodelAccess.key }).getHiliteSet({ selectables }))
          .pipe(takeUntil(this._cancelOngoingChanges))
          .subscribe({
            next: (set) => {
              this.addHiliteSet(set);
            },
          });
      case "remove":
        return void from(this._imodelHiliteSetProvider.getHiliteSetProvider({ imodelKey: this._imodelAccess.key }).getHiliteSet({ selectables }))
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

    // update the selection storage change tracker so we know the selection storage changed
    this._selectionStorageChangeTracker = (this._selectionStorageChangeTracker + 1) % Number.MAX_SAFE_INTEGER;

    if (args.changeType === "replace" || args.changeType === "clear") {
      this._cancelOngoingChanges.next();
    }
    this.syncHiliteSet(args);
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

    from(this._imodelHiliteSetProvider.getCurrentHiliteSet({ imodelKey: this._imodelAccess.key }))
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

    const ids = getSelectionSetChangeIds(event);
    const scopedSelection = merge(
      ids.elements
        ? from(
            computeSelection({
              queryExecutor: this._imodelAccess,
              elementIds: ids.elements,
              scope: this._activeScopeProvider(),
              componentId: this.#componentId,
            }),
          )
        : /* c8 ignore next */ EMPTY,
      ids.models ? from(ids.models).pipe(map((id): SelectableInstanceKey => ({ className: "BisCore.Model", id }))) : /* c8 ignore next */ EMPTY,
      ids.subcategories
        ? from(ids.subcategories).pipe(map((id): SelectableInstanceKey => ({ className: "BisCore.SubCategory", id })))
        : /* c8 ignore next */ EMPTY,
    );

    const selectionStorageVersion = this._selectionStorageChangeTracker;
    const changeSelectionStorageProps = {
      imodelKey: this._imodelAccess.key,
      source: this._selectionSourceName,
      selectables: await firstValueFrom(scopedSelection.pipe(toArray())),
    };
    try {
      switch (event.type) {
        case CoreSelectionSetEventType.Add:
          return this._selectionStorage.addToSelection(changeSelectionStorageProps);
        case CoreSelectionSetEventType.Remove:
          return this._selectionStorage.removeFromSelection(changeSelectionStorageProps);
        case CoreSelectionSetEventType.Replace:
          return this._selectionStorage.replaceSelection(changeSelectionStorageProps);
      }
    } finally {
      if (this._selectionStorageChangeTracker === selectionStorageVersion) {
        // if the storage wasn't changed while we were processing the selection change, we have to re-sync the
        // hilite set (otherwise it's done by the selection storage change handler)
        this.syncHiliteSet({
          ...changeSelectionStorageProps,
          selectables: Selectables.create(changeSelectionStorageProps.selectables),
          changeType: getUnifiedSelectionChangeType(event.type),
        });
      }
    }
  };
}

function getSelectionSetChangeIds(
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

function getUnifiedSelectionChangeType(coreChangeType: CoreSelectionSetEventType): StorageSelectionChangeType {
  switch (coreChangeType) {
    case CoreSelectionSetEventType.Add:
      return "add";
    case CoreSelectionSetEventType.Remove:
      return "remove";
    case CoreSelectionSetEventType.Replace:
      return "replace";
    case CoreSelectionSetEventType.Clear:
      return "clear";
  }
}

function is5xSelectionSet(selectionSet: CoreIModelSelectionSet): selectionSet is Omit<CoreIModelSelectionSet, "add" | "remove"> & {
  readonly active: { [P in keyof CoreSelectableIds]-?: Id64Set };
  add: (ids: Id64Arg | CoreSelectableIds) => boolean;
  remove: (ids: Id64Arg | CoreSelectableIds) => boolean;
} {
  return "active" in selectionSet;
}

/* c8 ignore start */
function createIModelHiliteSetProviderFromCachingProvider(
  cachingHiliteSetProvider: NonNullable<EnableUnifiedSelectionSyncWithIModelProps["cachingHiliteSetProvider"]>,
  hiliteSetProvider: HiliteSetProvider,
): IModelHiliteSetProvider {
  return {
    getHiliteSetProvider: () => hiliteSetProvider,
    getCurrentHiliteSet: (props) => cachingHiliteSetProvider.getHiliteSet(props),
    [Symbol.dispose]: () => {},
  };
}
/* c8 ignore end */
