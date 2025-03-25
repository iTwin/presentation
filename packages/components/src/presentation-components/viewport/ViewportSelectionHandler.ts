/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "../common/DisposePolyfill.js";
import { from, Subject, takeUntil } from "rxjs";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { HiliteSet, HiliteSetProvider, Presentation, SelectionChangeEventArgs, SelectionChangeType, SelectionHandler } from "@itwin/presentation-frontend";
import { safeDispose } from "../common/Utils.js";

/* eslint-disable @typescript-eslint/no-deprecated */

/** @internal */
export interface ViewportSelectionHandlerProps {
  imodel: IModelConnection;
}

/**
 * A handler that syncs selection between unified selection
 * manager (`Presentation.selection`) and a viewport (`imodel.hilited`).
 * It has nothing to do with the viewport component itself - the
 * viewport updates its highlighted elements when `imodel.hilited`
 * changes.
 *
 * @internal
 */
export class ViewportSelectionHandler implements Disposable {
  private _imodel: IModelConnection;
  private _selectionHandler: SelectionHandler;
  private _cancelOngoingChanges = new Subject<void>();

  public constructor(props: ViewportSelectionHandlerProps) {
    this._imodel = props.imodel;

    // handles changing and listening to unified selection
    this._selectionHandler = new SelectionHandler({
      manager: Presentation.selection,
      name: `Viewport_${counter++}`,
      imodel: props.imodel,
      onSelect: this.onUnifiedSelectionChanged,
    });
    this._selectionHandler.manager.setSyncWithIModelToolSelection(props.imodel, true);

    // stop imodel from syncing tool selection with hilited list - we want
    // to override that behavior
    props.imodel.hilited.wantSyncWithSelectionSet = false;
  }

  public [Symbol.dispose]() {
    this._cancelOngoingChanges.next();
    this._selectionHandler.manager.setSyncWithIModelToolSelection(this._imodel, false);
    safeDispose(this._selectionHandler);
  }

  public get imodel() {
    return this._imodel;
  }
  public set imodel(value: IModelConnection) {
    if (this._imodel === value) {
      return;
    }

    this._selectionHandler.manager.setSyncWithIModelToolSelection(this._imodel, false);
    this._selectionHandler.manager.setSyncWithIModelToolSelection(value, true);
    this._imodel = value;
    this._imodel.hilited.wantSyncWithSelectionSet = false;
    this._selectionHandler.imodel = value;

    this.applyCurrentSelection();
  }

  public applyCurrentSelection() {
    this._cancelOngoingChanges.next();
    this.applyCurrentHiliteSet(this._imodel);
  }

  private handleUnifiedSelectionChange(imodel: IModelConnection, changeType: SelectionChangeType, keys: Readonly<KeySet>, source: string) {
    if (changeType === SelectionChangeType.Clear || changeType === SelectionChangeType.Replace) {
      this.applyCurrentHiliteSet(imodel, changeType === SelectionChangeType.Replace && source === "Tool" ? "onlyHilited" : "all");
      return;
    }

    const hiliteSetProvider = HiliteSetProvider.create({ imodel });
    if (changeType === SelectionChangeType.Add) {
      from(hiliteSetProvider.getHiliteSetIterator(keys))
        .pipe(takeUntil(this._cancelOngoingChanges))
        .subscribe({
          next: (set) => {
            this.applyHiliteSet(imodel, set);
          },
        });
      return;
    }

    from(hiliteSetProvider.getHiliteSetIterator(keys))
      .pipe(takeUntil(this._cancelOngoingChanges))
      .subscribe({
        next: (set) => {
          this.removeHiliteSet(imodel, set);
        },
        complete: () => {
          this.applyCurrentHiliteSet(imodel, "none");
        },
      });
  }

  private onUnifiedSelectionChanged = (args: SelectionChangeEventArgs) => {
    // this component only cares about its own imodel
    if (args.imodel !== this._imodel) {
      return;
    }

    // viewports are only interested in top-level selection changes
    // wip: may want to handle different selection levels?
    if (0 !== args.level) {
      return;
    }

    this._cancelOngoingChanges.next();
    this.handleUnifiedSelectionChange(args.imodel, args.changeType, args.keys, args.source);
  };

  private applyCurrentHiliteSet(imodel: IModelConnection, clearAction: "all" | "onlyHilited" | "none" = "all") {
    if (clearAction !== "none") {
      using _ = toDisposable(Presentation.selection.suspendIModelToolSelectionSync(this._imodel));

      imodel.hilited.clear();
      if (clearAction === "all") {
        imodel.selectionSet.emptyAll();
      }
    }

    from(Presentation.selection.getHiliteSetIterator(imodel))
      .pipe(takeUntil(this._cancelOngoingChanges))
      .subscribe({
        next: (ids) => {
          this.applyHiliteSet(imodel, ids);
        },
      });
  }

  private applyHiliteSet(imodel: IModelConnection, set: HiliteSet) {
    using _ = toDisposable(Presentation.selection.suspendIModelToolSelectionSync(this._imodel));
    if (set.models && set.models.length) {
      imodel.hilited.models.addIds(set.models);
    }
    if (set.subCategories && set.subCategories.length) {
      imodel.hilited.subcategories.addIds(set.subCategories);
    }
    if (set.elements && set.elements.length) {
      imodel.hilited.elements.addIds(set.elements);
      imodel.selectionSet.add(set.elements);
    }
  }

  private removeHiliteSet(imodel: IModelConnection, set: HiliteSet) {
    using _ = toDisposable(Presentation.selection.suspendIModelToolSelectionSync(this._imodel));
    if (set.models?.length) {
      imodel.hilited.models.deleteIds(set.models);
    }
    if (set.subCategories?.length) {
      imodel.hilited.subcategories.deleteIds(set.subCategories);
    }
    if (set.elements?.length) {
      imodel.hilited.elements.deleteIds(set.elements);
      imodel.selectionSet.remove(set.elements);
    }
  }
}

let counter = 1;

function toDisposable(resource: {} | { [Symbol.dispose]: () => void } | { dispose: () => void }): { [Symbol.dispose]: () => void } {
  return {
    [Symbol.dispose]: () => {
      safeDispose(resource);
    },
  };
}
