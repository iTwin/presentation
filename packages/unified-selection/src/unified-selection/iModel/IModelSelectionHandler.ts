/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { from, Subject, takeUntil } from "rxjs";
import { Id64Arg, using } from "@itwin/core-bentley";
import { CachingHiliteSetProvider, createCachingHiliteSetProvider } from "../CachingHiliteSetProvider";
import { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "../HiliteSetProvider";
import { IECSqlQueryExecutor } from "../queries/ECSqlCore";
import { SelectableInstanceKey, Selectables } from "../Selectable";
import { StorageSelectionChangeEventArgs, StorageSelectionChangeType } from "../SelectionChangeEvent";
import { computeSelection, ComputeSelectionProps } from "../SelectionScope";
import { SelectionStorage } from "../SelectionStorage";
import { EnableUnifiedSelectionSyncWithIModelProps } from "./EnableUnifiedSelectionSyncWithIModel";
import { IModelSelection, SelectionSetEvent, SelectionSetEventType } from "./IModel";

/**
 * A handler that syncs selection between unified selection storage
 * (`SelectionStorage`) and an iModel (`iModel.selectionSet`, `iModel.hilited`).
 * @internal
 */
export class IModelSelectionHandler {
  private _selectionSourceName = "Tool";

  private _iModelSelection: IModelSelection;
  private _queryExecutor: IECSqlQueryExecutor;
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProvider: HiliteSetProvider;
  private _cachingHiliteSetProvider: CachingHiliteSetProvider;
  private _activeScopeProvider: () => ComputeSelectionProps["scope"];

  private _isSuspended: boolean;
  private _cancelOngoingChanges = new Subject<void>();
  private _unifiedSelectionListenerDisposeFunc: () => void;
  private _iModelListenerDisposeFunc: () => void;
  private _hasCustomCachingHiliteSetProvider: boolean;

  public constructor(props: EnableUnifiedSelectionSyncWithIModelProps) {
    this._iModelSelection = props.iModelSelection;
    this._selectionStorage = props.selectionStorage;
    this._activeScopeProvider = props.activeScopeProvider;
    this._queryExecutor = props.queryExecutor;
    this._isSuspended = false;
    this._hasCustomCachingHiliteSetProvider = !!props.cachingHiliteSetProvider;

    this._cachingHiliteSetProvider =
      props.cachingHiliteSetProvider ??
      createCachingHiliteSetProvider({
        selectionStorage: this._selectionStorage,
        iModelProvider: () => ({ queryExecutor: this._queryExecutor, metadataProvider: props.metadataProvider }),
      });

    this._hiliteSetProvider = createHiliteSetProvider({ queryExecutor: this._queryExecutor, metadataProvider: props.metadataProvider });
    this._iModelListenerDisposeFunc = this._iModelSelection.selectionSet.onChanged.addListener(this.onIModelSelectionChanged);
    this._unifiedSelectionListenerDisposeFunc = this._selectionStorage.selectionChangeEvent.addListener(this.onUnifiedSelectionChanged);

    // stop imodel from syncing tool selection with hilited list - we want to override that behavior
    this._iModelSelection.hilited.wantSyncWithSelectionSet = false;
    this.applyCurrentHiliteSet({ activeSelectionAction: "clearAll" });
  }

  public dispose() {
    this._cancelOngoingChanges.next();
    this._iModelListenerDisposeFunc();
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
    if (args.iModelKey !== this._iModelSelection.key || args.level !== 0) {
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
        this._iModelSelection.hilited.clear();
        if (activeSelectionAction === "clearAll") {
          this._iModelSelection.selectionSet.emptyAll();
        }
      });
    }

    from(this._cachingHiliteSetProvider.getHiliteSet({ iModelKey: this._iModelSelection.key }))
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
        this._iModelSelection.hilited.models.addIds(set.models);
      }
      if (set.subCategories && set.subCategories.length) {
        this._iModelSelection.hilited.subcategories.addIds(set.subCategories);
      }
      if (set.elements && set.elements.length) {
        this._iModelSelection.hilited.elements.addIds(set.elements);
        this._iModelSelection.selectionSet.add(set.elements);
      }
    });
  }

  private removeHiliteSet(set: HiliteSet) {
    using(this.suspendIModelToolSelectionSync(), (_) => {
      if (set.models.length) {
        this._iModelSelection.hilited.models.deleteIds(set.models);
      }
      if (set.subCategories.length) {
        this._iModelSelection.hilited.subcategories.deleteIds(set.subCategories);
      }
      if (set.elements.length) {
        this._iModelSelection.hilited.elements.deleteIds(set.elements);
        this._iModelSelection.selectionSet.remove(set.elements);
      }
    });
  }

  private onIModelSelectionChanged = async (event?: SelectionSetEvent): Promise<void> => {
    if (this._isSuspended) {
      return;
    }

    if (SelectionSetEventType.Clear === event!.type) {
      this._selectionStorage.clearSelection({ iModelKey: this._iModelSelection.key, source: this._selectionSourceName });
      return;
    }

    const elementIds = this.getSelectionSetChangeIds(event!);
    const scopedSelection = computeSelection({ queryExecutor: this._queryExecutor, elementIds, scope: this._activeScopeProvider() });
    await this.handleIModelSelectionChange(event!.type, scopedSelection);
  };

  private async handleIModelSelectionChange(type: SelectionSetEventType, iterator: AsyncIterableIterator<SelectableInstanceKey>) {
    if (type === SelectionSetEventType.Remove) {
      for await (const selectable of iterator) {
        this._selectionStorage.removeFromSelection({ iModelKey: this._iModelSelection.key, source: this._selectionSourceName, selectables: [selectable] });
      }
      return;
    }

    if (type === SelectionSetEventType.Replace) {
      this._selectionStorage.clearSelection({ iModelKey: this._iModelSelection.key, source: this._selectionSourceName });
    }

    for await (const selectable of iterator) {
      this._selectionStorage.addToSelection({ iModelKey: this._iModelSelection.key, source: this._selectionSourceName, selectables: [selectable] });
    }
  }

  private getSelectionSetChangeIds(event: SelectionSetEvent): string[] {
    switch (event.type) {
      case SelectionSetEventType.Add:
      case SelectionSetEventType.Replace:
        return this.idArgToIds(event.added);
      default:
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
