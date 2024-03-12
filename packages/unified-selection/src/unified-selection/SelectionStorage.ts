/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { Selectable, Selectables } from "./Selectable";

/**
 * An interface for selection change listeners.
 * @beta
 */
export declare type StorageSelectionChangesListener = (args: StorageSelectionChangeEventArgs, storage: SelectionStorageInterface) => void;

/**
 * The type of selection change
 * @beta
 */
export enum StorageSelectionChangeType {
  /** Added to selection. */
  Add,
  /** Removed from selection. */
  Remove,
  /** Selection was replaced. */
  Replace,
  /** Selection was cleared. */
  Clear,
}

/**
 * The event object that is sent when the selection changes.
 * @beta
 */
export interface StorageSelectionChangeEventArgs {
  /** The name of the selection source which caused the selection change. */
  source: string;
  /** Level of the selection. */
  level: number;
  /** The selection change type. */
  changeType: StorageSelectionChangeType;
  /** Selectables affected by this selection change event. */
  selectables: Selectables;
  /** iModel key with which the selection is associated with. */
  iModelKey: string;
  /** The timestamp of when the selection change happened */
  timestamp: Date;
}

/**
 * Selection storage interface which provides main selection and sub-selection.
 * @beta
 */
export interface SelectionStorageInterface {
  /** A callback that is called when selection changes */
  onSelectionChange: (event: StorageSelectionChangeEventArgs, storage: SelectionStorageInterface) => void;
  /**
   * Get the selection levels currently stored for the specified imodel
   * @param iModelKey iModel key to get selection levels for.
   * */
  getSelectionLevels(iModelKey: string): number[];
  /** Get the selection stored in the storage.
   * @param iModelKey iModel key which the selection is associated with.
   * @param level Level of the selection
   */
  getSelection(iModelKey: string, level: number): Selectables;
  /**
   * Add keys to the selection
   * @param source Name of the selection source
   * @param iModelKey iModel associated with the selection
   * @param selectables selectables to add
   * @param level Selection level
   */
  addToSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void;
  /**
   * Remove keys from current selection
   * @param source Name of the selection source
   * @param iModelKey iModel associated with the selection
   * @param selectables selectables to remove
   * @param level Selection level
   */
  removeFromSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void;
  /**
   * Replace current selection
   * @param source Name of the selection source
   * @param iModelKey iModel associated with the selection
   * @param selectables selectables to replace the current selection with
   * @param level Selection level
   */
  replaceSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void;
  /**
   * Clear current selection
   * @param source Name of the selection source
   * @param iModelKey iModel associated with the selection
   * @param level Selection level
   */
  clearSelection(source: string, iModelKey: string, level: number): void;
  /**
   * Clear storage for an iModel
   * @param iModelKey iModel to clear storage for
   */
  clearStorage(iModelKey: string): void;
}

/**
 * Creates a selection storage which stores the overall selection.
 * @beta
 */
export function createStorage(): SelectionStorageInterface {
  return new SelectionStorage();
}

class SelectionStorage implements SelectionStorageInterface {
  private _storage = new Map<string, MultiLevelSelectablesContainer>();
  public onSelectionChange: (args: StorageSelectionChangeEventArgs, storage: SelectionStorageInterface) => void;

  constructor() {
    this.onSelectionChange = () => {};
  }

  public getSelectionLevels(iModelKey: string): number[] {
    return this.getContainer(iModelKey).getSelectionLevels();
  }

  public getSelection(iModelKey: string, level: number): Selectables {
    return this.getContainer(iModelKey).getSelection(level);
  }

  public addToSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void {
    this.handleChange(source, iModelKey, level, StorageSelectionChangeType.Add, selectables);
  }

  public removeFromSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void {
    this.handleChange(source, iModelKey, level, StorageSelectionChangeType.Remove, selectables);
  }

  public replaceSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void {
    this.handleChange(source, iModelKey, level, StorageSelectionChangeType.Replace, selectables);
  }

  public clearSelection(source: string, iModelKey: string, level: number): void {
    this.handleChange(source, iModelKey, level, StorageSelectionChangeType.Clear, []);
  }

  public clearStorage(iModelKey: string): void {
    this.clearSelection("Clear iModel storage", iModelKey, 0);
    this._storage.delete(iModelKey);
  }

  private getContainer(iModelKey: string): MultiLevelSelectablesContainer {
    let selectionContainer = this._storage.get(iModelKey);
    if (!selectionContainer) {
      selectionContainer = new MultiLevelSelectablesContainer();
      this._storage.set(iModelKey, selectionContainer);
    }
    return selectionContainer;
  }

  private handleChange(source: string, iModelKey: string, level: number, changeType: StorageSelectionChangeType, change: Selectable[]): void {
    const container = this.getContainer(iModelKey);
    const selectables = container.getSelection(level);
    const selected = Selectables.create(change);
    switch (changeType) {
      case StorageSelectionChangeType.Add:
        if (!Selectables.add(selectables, change)) {
          return;
        }
        break;
      case StorageSelectionChangeType.Remove:
        if (!Selectables.remove(selectables, change)) {
          return;
        }
        break;
      case StorageSelectionChangeType.Replace:
        if (Selectables.size(selectables) === Selectables.size(selected) && Selectables.hasAll(selectables, change)) {
          return;
        }
        Selectables.clear(selectables);
        Selectables.add(selectables, change);
        break;
      case StorageSelectionChangeType.Clear:
        if (!Selectables.clear(selectables)) {
          return;
        }
        break;
    }
    container.clear(level + 1);
    const event: StorageSelectionChangeEventArgs = {
      source,
      level,
      iModelKey,
      changeType,
      selectables: selected,
      timestamp: new Date(),
    };
    this.onSelectionChange(event, this);
  }
}

class MultiLevelSelectablesContainer {
  private readonly _selectablesContainers: Map<number, Selectables>;

  constructor() {
    this._selectablesContainers = new Map<number, Selectables>();
  }

  public getSelection(level: number): Selectables {
    let selectables = this._selectablesContainers.get(level);
    if (!selectables) {
      selectables = Selectables.create([]);
      this._selectablesContainers.set(level, selectables);
    }
    return selectables;
  }

  public getSelectionLevels(): number[] {
    const levels = new Array<number>();
    for (const entry of this._selectablesContainers.entries()) {
      if (!Selectables.isEmpty(entry[1])) {
        levels.push(entry[0]);
      }
    }
    return levels.sort();
  }

  public clear(level: number) {
    const storedLevels = this._selectablesContainers.keys();
    for (const storedLevel of storedLevels) {
      if (storedLevel >= level) {
        const selectables = this._selectablesContainers.get(storedLevel)!;
        Selectables.clear(selectables);
      }
    }
  }
}
