/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, using } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet, SelectionInfo } from "@itwin/presentation-common";
import { ISelectionProvider, Presentation, SelectionChangeEventArgs, SelectionHandler } from "@itwin/presentation-frontend";
import { AsyncTasksTracker } from "../common/Utils";

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
  private _lastPendingSelectionChange?: { info: SelectionInfo; selection: Readonly<KeySet> };
  private _asyncsTracker = new AsyncTasksTracker();

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

  public get selectionHandler() {
    return this._selectionHandler;
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

    void this.applyCurrentSelection();
  }

  /** note: used only it tests */
  public get pendingAsyncs() {
    return this._asyncsTracker.pendingAsyncs;
  }

  public async applyCurrentSelection() {
    await this.applyUnifiedSelection(this._imodel, { providerName: "" }, this.selectionHandler.getSelection());
  }

  private async applyUnifiedSelection(imodel: IModelConnection, selectionInfo: SelectionInfo, selection: Readonly<KeySet>) {
    if (this._asyncsTracker.pendingAsyncs.size > 0) {
      this._lastPendingSelectionChange = { info: selectionInfo, selection };
      return;
    }

    await using(this._asyncsTracker.trackAsyncTask(), async (_r) => {
      const ids = await Presentation.selection.getHiliteSet(this._imodel);
      using(Presentation.selection.suspendIModelToolSelectionSync(this._imodel), (_) => {
        imodel.hilited.clear();
        let shouldClearSelectionSet = true;
        if (ids.models && ids.models.length) {
          imodel.hilited.models.addIds(ids.models);
        }
        if (ids.subCategories && ids.subCategories.length) {
          imodel.hilited.subcategories.addIds(ids.subCategories);
        }
        if (ids.elements && ids.elements.length) {
          imodel.hilited.elements.addIds(ids.elements);
          imodel.selectionSet.replace(ids.elements);
          shouldClearSelectionSet = false;
        }
        if (shouldClearSelectionSet) {
          imodel.selectionSet.emptyAll();
        }
      });
    });

    if (this._lastPendingSelectionChange) {
      const change = this._lastPendingSelectionChange;
      this._lastPendingSelectionChange = undefined;
      await this.applyUnifiedSelection(imodel, change.info, change.selection);
    }
  }

  private onUnifiedSelectionChanged = async (args: SelectionChangeEventArgs, provider: ISelectionProvider): Promise<void> => {
    // this component only cares about its own imodel
    if (args.imodel !== this._imodel) {
      return;
    }

    // viewports are only interested in top-level selection changes
    // wip: may want to handle different selection levels?
    if (0 !== args.level) {
      return;
    }

    const selection = provider.getSelection(args.imodel, 0);
    const info: SelectionInfo = {
      providerName: args.source,
      level: args.level,
    };
    await this.applyUnifiedSelection(args.imodel, info, selection);
  };
}

let counter = 1;
