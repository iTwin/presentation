/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { IModelConnection } from "@itwin/core-frontend";
import { SelectableObjects, SelectableObjectSet } from "./SelectableObjectSet";
import { StorageSelectionChangeEvent, StorageSelectionChangeEventArgs, StorageSelectionChangeType } from "./StorageSelectionChangeEvent";

/**
 * Selection storage interface which provides main selection and sub-selection.
 * @beta
 */
export interface SelectionStorageInterface {
  /** An event that's fired when selection changes */
  selectionChange: StorageSelectionChangeEvent;
  /**
   * Get the selection levels currently stored for the specified imodel
   * @param imodel iModel connection to get selection levels for.
   * */
  getSelectionLevels(imodel: IModelConnection): number[];
  /** Get the selection stored in the storage.
   * @param imodel iModel connection which the selection is associated with.
   * @param level Level of the selection
   */
  getSelection(imodel: IModelConnection, level: number): SelectableObjectSet;
  /**
   * Add keys to the selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param selectableObjects selectable objects to add
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  addToSelection(source: string, imodel: IModelConnection, selectableObjects: SelectableObjects, level: number, rulesetId?: string): void;
  /**
   * Remove keys from current selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param selectableObjects selectableObjects to remove
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  removeFromSelection(source: string, imodel: IModelConnection, selectableObjects: SelectableObjects, level: number, rulesetId?: string): void;
  /**
   * Replace current selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param selectableObjects selectableObjects to replace the current selection with
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  replaceSelection(source: string, imodel: IModelConnection, selectableObjects: SelectableObjects, level: number, rulesetId?: string): void;
  /**
   * Clear current selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  clearSelection(source: string, imodel: IModelConnection, level: number, rulesetId?: string): void;
}

/**
 * The selection storage which stores the overall selection.
 * @beta
 */
export class SelectionStorage implements SelectionStorageInterface {
  private _storage = new Map<IModelConnection, SelectableObjectContainer>();

  /** An event which gets broadcasted on selection changes */
  public readonly selectionChange: StorageSelectionChangeEvent;

  /**
   * Creates an instance of `SelectionStorage`.
   */
  constructor() {
    this.selectionChange = new StorageSelectionChangeEvent();
    IModelConnection.onClose.addListener((imodel: IModelConnection) => {
      this.onConnectionClose(imodel);
    });
  }

  /**
   * Get the selection levels currently stored for the specified imodel
   * @param imodel iModel connection to get selection levels for.
   * */
  public getSelectionLevels(imodel: IModelConnection): number[] {
    return this.getContainer(imodel).getSelectionLevels();
  }

  /** Get the selection stored in the storage.
   * @param imodel iModel connection which the selection is associated with.
   * @param level Level of the selection
   */
  public getSelection(imodel: IModelConnection, level: number = 0): SelectableObjectSet {
    return this.getContainer(imodel).getSelection(level);
  }

  /**
   * Add keys to the selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param selectableObjects selectable objects to add
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public addToSelection(source: string, imodel: IModelConnection, selectableObjects: SelectableObjects, level: number = 0, rulesetId?: string): void {
    const evt: StorageSelectionChangeEventArgs = {
      source,
      level,
      imodel,
      changeType: StorageSelectionChangeType.Add,
      selectableObjects: new SelectableObjectSet(selectableObjects),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  /**
   * Remove keys from current selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param selectableObjects selectableObjects to remove
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public removeFromSelection(source: string, imodel: IModelConnection, selectableObjects: SelectableObjects, level: number = 0, rulesetId?: string): void {
    const evt: StorageSelectionChangeEventArgs = {
      source,
      level,
      imodel,
      changeType: StorageSelectionChangeType.Remove,
      selectableObjects: new SelectableObjectSet(selectableObjects),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  /**
   * Replace current selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param selectableObjects selectableObjects to replace the current selection with
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public replaceSelection(source: string, imodel: IModelConnection, selectableObjects: SelectableObjects, level: number = 0, rulesetId?: string): void {
    const evt: StorageSelectionChangeEventArgs = {
      source,
      level,
      imodel,
      changeType: StorageSelectionChangeType.Replace,
      selectableObjects: new SelectableObjectSet(selectableObjects),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  /**
   * Clear current selection
   * @param source Name of the selection source
   * @param imodel iModel associated with the selection
   * @param level Selection level
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public clearSelection(source: string, imodel: IModelConnection, level: number = 0, rulesetId?: string): void {
    const evt: StorageSelectionChangeEventArgs = {
      source,
      level,
      imodel,
      changeType: StorageSelectionChangeType.Clear,
      selectableObjects: new SelectableObjectSet(),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  private onConnectionClose(imodel: IModelConnection): void {
    this.clearSelection("Connection Close Event", imodel);
    this._storage.delete(imodel);
  }

  private getContainer(imodel: IModelConnection): SelectableObjectContainer {
    let selectionContainer = this._storage.get(imodel);
    if (!selectionContainer) {
      selectionContainer = new SelectableObjectContainer();
      this._storage.set(imodel, selectionContainer);
    }
    return selectionContainer;
  }

  private handleEvent(event: StorageSelectionChangeEventArgs): void {
    const container = this.getContainer(event.imodel);
    const selectedObjectSet = container.getSelection(event.level);
    const guidBefore = selectedObjectSet.guid;
    switch (event.changeType) {
      case StorageSelectionChangeType.Add:
        selectedObjectSet.add(event.selectableObjects);
        break;
      case StorageSelectionChangeType.Remove:
        selectedObjectSet.delete(event.selectableObjects);
        break;
      case StorageSelectionChangeType.Replace:
        if (selectedObjectSet.size !== event.selectableObjects.size || !selectedObjectSet.hasAll(event.selectableObjects)) {
          selectedObjectSet.clear().add(event.selectableObjects);
        }
        break;
      case StorageSelectionChangeType.Clear:
        selectedObjectSet.clear();
        break;
    }
    if (selectedObjectSet.guid === guidBefore) {
      return;
    }
    container.clear(event.level + 1);
    this.selectionChange.raiseEvent(event, this);
  }
}

/**
 * Stores selected objects by selection level model for an iModel.
 * @internal
 * */
export class SelectableObjectContainer {
  private readonly _selectedObjectSetStorage: Map<number, SelectableObjectSet>;

  constructor() {
    this._selectedObjectSetStorage = new Map<number, SelectableObjectSet>();
  }

  public getSelection(level: number): SelectableObjectSet {
    let selectedItemsSet = this._selectedObjectSetStorage.get(level);
    if (!selectedItemsSet) {
      selectedItemsSet = new SelectableObjectSet();
      this._selectedObjectSetStorage.set(level, selectedItemsSet);
    }
    return selectedItemsSet;
  }

  public getSelectionLevels(): number[] {
    const levels = new Array<number>();
    for (const entry of this._selectedObjectSetStorage.entries()) {
      if (!entry[1].isEmpty) {
        levels.push(entry[0]);
      }
    }
    return levels.sort();
  }

  public clear(level: number) {
    const storedLevels = this._selectedObjectSetStorage.keys();
    for (const storedLevel of storedLevels) {
      if (storedLevel >= level) {
        const selectedItemsSet = this._selectedObjectSetStorage.get(storedLevel)!;
        selectedItemsSet.clear();
      }
    }
  }
}
