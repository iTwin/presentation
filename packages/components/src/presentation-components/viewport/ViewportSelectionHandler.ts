/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, Subject, takeUntil } from "rxjs";
import { IDisposable, using } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { Presentation, SelectionChangeEventArgs, SelectionHandler } from "@itwin/presentation-frontend";

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
export class ViewportSelectionHandler implements IDisposable {
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

  public dispose() {
    this._selectionHandler.manager.setSyncWithIModelToolSelection(this._imodel, false);
    this._selectionHandler.dispose();
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
    this.applyUnifiedSelection(this._imodel);
  }

  private applyUnifiedSelection(imodel: IModelConnection) {
    this._cancelOngoingChanges.next();

    let firstEmit = true;
    from(Presentation.selection.getHiliteSetIterator(imodel))
      .pipe(takeUntil(this._cancelOngoingChanges))
      .subscribe({
        next: (ids) => {
          using(Presentation.selection.suspendIModelToolSelectionSync(this._imodel), (_) => {
            if (firstEmit) {
              imodel.hilited.clear();
              imodel.selectionSet.emptyAll();
            }

            if (ids.models && ids.models.length) {
              imodel.hilited.models.addIds(ids.models);
            }
            if (ids.subCategories && ids.subCategories.length) {
              imodel.hilited.subcategories.addIds(ids.subCategories);
            }
            if (ids.elements && ids.elements.length) {
              imodel.hilited.elements.addIds(ids.elements);
              imodel.selectionSet.add(ids.elements);
            }

            firstEmit = false;
          });
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

    this.applyUnifiedSelection(args.imodel);
  };
}

let counter = 1;
