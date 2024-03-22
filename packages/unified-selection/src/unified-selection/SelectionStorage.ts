/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { HiliteSet, HiliteSetProvider } from "./HiliteSetProvider";
import { IMetadataProvider } from "./queries/ECMetadata";
import { IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { Selectable, Selectables } from "./Selectable";
import { SelectionChangeEvent, SelectionChangeEventImpl, StorageSelectionChangeEventArgs, StorageSelectionChangeType } from "./SelectionChangeEvent";

/**
 * Selection storage interface which provides main selection and sub-selection.
 * @beta
 */
export interface SelectionStorage {
  /** An event that is raised when selection changes */
  selectionChangeEvent: SelectionChangeEvent;
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
   * Clear storage for an iModel. This function should be called when iModel is closed.
   * @param iModelKey iModel to clear storage for
   */
  clearStorage(iModelKey: string): void;

  /**
   * Get the current hilite set for the specified imodel
   * @param iModelKey iModel to get hilite set for
   * @param queryExecutor ECSql query executor
   * @param metadataProvider EC metadata provider
   * @public
   */
  getHiliteSet(iModelKey: string, queryExecutor: IECSqlQueryExecutor, metadataProvider: IMetadataProvider): Promise<HiliteSet>;
}

/**
 * Creates a selection storage which stores the overall selection.
 * When an iModel is closed `clearSelection` function should be called.
 * @beta
 */
export function createStorage(): SelectionStorage {
  return new SelectionStorageImpl();
}

class SelectionStorageImpl implements SelectionStorage {
  private _storage = new Map<string, MultiLevelSelectablesContainer>();
  private _hiliteSetProviders = new Map<string, HiliteSetProvider>();
  public selectionChangeEvent: SelectionChangeEventImpl;

  constructor() {
    this.selectionChangeEvent = new SelectionChangeEventImpl();
  }

  public getSelectionLevels(iModelKey: string): number[] {
    return this.getContainer(iModelKey).getSelectionLevels();
  }

  public getSelection(iModelKey: string, level: number): Selectables {
    return this.getContainer(iModelKey).getSelection(level);
  }

  public addToSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void {
    this.handleChange(source, iModelKey, level, "add", selectables);
  }

  public removeFromSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void {
    this.handleChange(source, iModelKey, level, "remove", selectables);
  }

  public replaceSelection(source: string, iModelKey: string, selectables: Selectable[], level: number): void {
    this.handleChange(source, iModelKey, level, "replace", selectables);
  }

  public clearSelection(source: string, iModelKey: string, level: number): void {
    this.handleChange(source, iModelKey, level, "clear", []);
  }

  public clearStorage(iModelKey: string): void {
    this.clearSelection("Clear iModel storage", iModelKey, 0);
    this._storage.delete(iModelKey);
    this._hiliteSetProviders.delete(iModelKey);
  }

  public async getHiliteSet(iModelKey: string, queryExecutor: IECSqlQueryExecutor, metadataProvider: IMetadataProvider): Promise<HiliteSet> {
    const provider = this.getHiliteSetProvider(iModelKey, queryExecutor, metadataProvider);
    const selection = this.getSelection(iModelKey, 0);
    return provider.getHiliteSet(selection);
  }

  private getHiliteSetProvider(iModelKey: string, queryExecutor: IECSqlQueryExecutor, metadataProvider: IMetadataProvider) {
    let provider = this._hiliteSetProviders.get(iModelKey);
    if (!provider) {
      provider = HiliteSetProvider.create({ queryExecutor, metadataProvider });
      this._hiliteSetProviders.set(iModelKey, provider);
    }
    return provider;
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
      case "add":
        if (!Selectables.add(selectables, change)) {
          return;
        }
        break;
      case "remove":
        if (!Selectables.remove(selectables, change)) {
          return;
        }
        break;
      case "replace":
        if (Selectables.size(selectables) === Selectables.size(selected) && Selectables.hasAll(selectables, change)) {
          return;
        }
        Selectables.clear(selectables);
        Selectables.add(selectables, change);
        break;
      case "clear":
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
    this.selectionChangeEvent.raiseEvent(event, this);
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
