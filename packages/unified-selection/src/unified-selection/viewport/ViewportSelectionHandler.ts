/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { from, Subject, takeUntil } from "rxjs";
import { using } from "@itwin/core-bentley";
import { CachingHiliteSetProvider } from "../CachingHiliteSetProvider";
import { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "../HiliteSetProvider";
import { IdArg, IModelConnection, SelectionSetEvent, SelectionSetEventType } from "../iModel/IModel";
import { IMetadataProvider } from "../queries/ECMetadata";
import { IECSqlQueryExecutor } from "../queries/ECSqlCore";
import { SelectableInstanceKey, Selectables } from "../Selectable";
import { StorageSelectionChangeEventArgs, StorageSelectionChangeType } from "../SelectionChangeEvent";
import { computeSelection, ElementSelectionScopeProps, SelectionScope } from "../SelectionScope";
import { SelectionStorage } from "../SelectionStorage";

/** @internal */
export interface ViewportSelectionHandlerProps {
  iModel: IModelConnection;
  selectionStorage: SelectionStorage;
  cachingHiliteSetProvider: CachingHiliteSetProvider;
  queryExecutor: IECSqlQueryExecutor;
  metadataProvider: IMetadataProvider;
  activeScopeProvider: () => ElementSelectionScopeProps | { id: SelectionScope } | SelectionScope;
}

/**
 * A handler that syncs selection between unified selection storage
 * (`SelectionStorage`) and a viewport (`imodel.hilited`).
 * It has nothing to do with the viewport component itself - the
 * viewport updates its highlighted elements when `imodel.hilited`
 * changes.
 * @internal
 */
export class ViewportSelectionHandler {
  private _selectionSourceName = "Tool";

  private _iModel: IModelConnection;
  private _queryExecutor: IECSqlQueryExecutor;
  private _selectionStorage: SelectionStorage;
  private _hiliteSetProvider: HiliteSetProvider;
  private _cachingHiliteSetProvider: CachingHiliteSetProvider;
  private _activeScopeProvider: () => ElementSelectionScopeProps | { id: SelectionScope } | SelectionScope;

  private _isSuspended: boolean;
  private _cancelOngoingChanges = new Subject<void>();
  private _unifiedSelectionListenerDisposeFunc: () => void;
  private _viewportListenerDisposeFunc: () => void;

  public constructor(props: ViewportSelectionHandlerProps) {
    this._iModel = props.iModel;
    this._selectionStorage = props.selectionStorage;
    this._cachingHiliteSetProvider = props.cachingHiliteSetProvider;
    this._activeScopeProvider = props.activeScopeProvider;
    this._queryExecutor = props.queryExecutor;
    this._isSuspended = false;

    this._hiliteSetProvider = createHiliteSetProvider({ queryExecutor: props.queryExecutor, metadataProvider: props.metadataProvider });
    this._viewportListenerDisposeFunc = this._iModel.selectionSet.onChanged.addListener(this.onViewportSelectionChanged);
    this._unifiedSelectionListenerDisposeFunc = this._selectionStorage.selectionChangeEvent.addListener(this.onUnifiedSelectionChanged);

    // stop imodel from syncing tool selection with hilited list - we want to override that behavior
    this._iModel.hilited.wantSyncWithSelectionSet = false;
    this.applyCurrentHiliteSet();
  }

  public dispose() {
    this._cancelOngoingChanges.next();
    this._viewportListenerDisposeFunc();
    this._unifiedSelectionListenerDisposeFunc();
  }

  /** Temporarily suspends tool selection synchronization until the returned `IDisposable` is disposed. */
  public suspendIModelToolSelectionSync() {
    const wasSuspended = this._isSuspended;
    this._isSuspended = true;
    return {
      dispose: () => (this._isSuspended = wasSuspended),
    };
  }

  private handleUnifiedSelectionChange(changeType: StorageSelectionChangeType, selectables: Selectables) {
    if (changeType === "clear" || changeType === "replace") {
      this.applyCurrentHiliteSet();
      return;
    }

    if (changeType === "add") {
      from(this._hiliteSetProvider.getHiliteSet({ selectables }))
        .pipe(takeUntil(this._cancelOngoingChanges))
        .subscribe({
          next: (set) => {
            this.applyHiliteSet(set);
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
          this.applyCurrentHiliteSet(false);
        },
      });
  }

  private onUnifiedSelectionChanged = (args: StorageSelectionChangeEventArgs) => {
    // viewports are only interested in top-level selection changes
    if (args.iModelKey !== this._iModel.key || args.level !== 0) {
      return;
    }

    this._cancelOngoingChanges.next();
    this.handleUnifiedSelectionChange(args.changeType, args.selectables);
  };

  private applyCurrentHiliteSet(clearBefore = true) {
    if (clearBefore) {
      using(this.suspendIModelToolSelectionSync(), (_) => {
        this._iModel.hilited.clear();
        this._iModel.selectionSet.emptyAll();
      });
    }

    from(this._cachingHiliteSetProvider.getHiliteSet({ iModelKey: this._iModel.key }))
      .pipe(takeUntil(this._cancelOngoingChanges))
      .subscribe({
        next: (ids) => {
          this.applyHiliteSet(ids);
        },
      });
  }

  private applyHiliteSet(set: HiliteSet) {
    using(this.suspendIModelToolSelectionSync(), (_) => {
      if (set.models && set.models.length) {
        this._iModel.hilited.models.addIds(set.models);
      }
      if (set.subCategories && set.subCategories.length) {
        this._iModel.hilited.subcategories.addIds(set.subCategories);
      }
      if (set.elements && set.elements.length) {
        this._iModel.hilited.elements.addIds(set.elements);
        this._iModel.selectionSet.add(set.elements);
      }
    });
  }

  private removeHiliteSet(set: HiliteSet) {
    using(this.suspendIModelToolSelectionSync(), (_) => {
      if (set.models.length) {
        this._iModel.hilited.models.deleteIds(set.models);
      }
      if (set.subCategories.length) {
        this._iModel.hilited.subcategories.deleteIds(set.subCategories);
      }
      if (set.elements.length) {
        this._iModel.hilited.elements.deleteIds(set.elements);
        this._iModel.selectionSet.remove(set.elements);
      }
    });
  }

  private onViewportSelectionChanged = async (event: SelectionSetEvent): Promise<void> => {
    if (this._isSuspended || event.set.iModel !== this._iModel) {
      return;
    }

    if (SelectionSetEventType.Clear === event.type) {
      this._selectionStorage.clearSelection({ iModelKey: this._iModel.key, source: this._selectionSourceName });
      return;
    }

    const elementIds = this.getSelectionSetChangeIds(event);
    const scopedSelection = computeSelection({ queryExecutor: this._queryExecutor, elementIds, scope: this._activeScopeProvider() });
    await this.handleViewportSelectionChange(event.type, scopedSelection);
  };

  private async handleViewportSelectionChange(type: SelectionSetEventType, iterator: AsyncIterableIterator<SelectableInstanceKey>) {
    if (type === SelectionSetEventType.Replace) {
      this._selectionStorage.clearSelection({ iModelKey: this._iModel.key, source: this._selectionSourceName });
    }

    if (type === SelectionSetEventType.Remove) {
      for await (const selectable of iterator) {
        this._selectionStorage.removeFromSelection({ iModelKey: this._iModel.key, source: this._selectionSourceName, selectables: [selectable] });
      }
      return;
    }

    for await (const selectable of iterator) {
      this._selectionStorage.addToSelection({ iModelKey: this._iModel.key, source: this._selectionSourceName, selectables: [selectable] });
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

  private idArgToIds(ids: IdArg): string[] {
    if (typeof ids === "string") {
      return [ids];
    }
    if (ids instanceof Set) {
      return [...ids];
    }
    return ids;
  }
}
