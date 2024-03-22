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
  /** An event that is raised when selection changes. */
  selectionChangeEvent: SelectionChangeEvent;

  /** Get the selection levels currently stored for the specified iModel. */
  getSelectionLevels(props: {
    /** Key of the iModel to get selection levels for. */
    iModelKey: string;
  }): number[];

  /** Get the selection stored in the storage. */
  getSelection(props: {
    /** Key of the iModel to get selection for. */
    iModelKey: string;
    /** Level of the selection. Defaults to `0`. */
    level?: number;
  }): Selectables;

  /** Add keys to the selection. */
  addToSelection(props: {
    /** Key of the iModel to change selection for. */
    iModelKey: string;
    /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
    source: string;
    /** The selectables to add to selection. */
    selectables: Selectable[];
    /** Level of the selection. Defaults to `0`. */
    level?: number;
  }): void;

  /** Remove keys from current selection. */
  removeFromSelection(props: {
    /** Key of the iModel to change selection for. */
    iModelKey: string;
    /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
    source: string;
    /** The selectables to remove from selection. */
    selectables: Selectable[];
    /** Level of the selection. Defaults to `0`. */
    level?: number;
  }): void;

  /** Replace current selection. */
  replaceSelection(props: {
    /** Key of the iModel to change selection for. */
    iModelKey: string;
    /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
    source: string;
    /** The selectables to add to selection. */
    selectables: Selectable[];
    /** Level of the selection. Defaults to `0`. */
    level?: number;
  }): void;

  /** Clear current selection. */
  clearSelection(props: {
    /** Key of the iModel to change selection for. */
    iModelKey: string;
    /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
    source: string;
    /** Level of the selection. Defaults to `0`. */
    level?: number;
  }): void;

  /** Clear storage for an iModel. This function should be called when iModel is closed. */
  clearStorage(props: {
    /** Key of the iModel to change selection for. */
    iModelKey: string;
  }): void;

  /** Get the current hilite set for the specified imodel */
  getHiliteSet(props: {
    /** iModel to get hilite set for */
    iModelKey: string;
    /** ECSql query executor */
    queryExecutor: IECSqlQueryExecutor;
    /** EC metadata provider */
    metadataProvider: IMetadataProvider;
  }): Promise<HiliteSet>;
}

/**
 * Creates a selection storage. When an iModel is closed `SelectionStorage.clearSelection` function should be called.
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

  public getSelectionLevels({ iModelKey }: { iModelKey: string }): number[] {
    return this.getContainer(iModelKey).getSelectionLevels();
  }

  public getSelection(props: { iModelKey: string; level?: number }): Selectables {
    const { iModelKey, level } = props;
    return this.getContainer(iModelKey).getSelection(level ?? 0);
  }

  public addToSelection(props: { source: string; iModelKey: string; selectables: Selectable[]; level?: number }): void {
    this.handleChange({ ...props, changeType: "add" });
  }

  public removeFromSelection(props: { source: string; iModelKey: string; selectables: Selectable[]; level?: number }): void {
    this.handleChange({ ...props, changeType: "remove" });
  }

  public replaceSelection(props: { source: string; iModelKey: string; selectables: Selectable[]; level?: number }): void {
    this.handleChange({ ...props, changeType: "replace" });
  }

  public clearSelection(props: { source: string; iModelKey: string; level?: number }): void {
    this.handleChange({ ...props, changeType: "clear", selectables: [] });
  }

  public clearStorage({ iModelKey }: { iModelKey: string }): void {
    this.clearSelection({ source: "Clear iModel storage", iModelKey });
    this._storage.delete(iModelKey);
    this._hiliteSetProviders.delete(iModelKey);
  }

  public async getHiliteSet(props: { iModelKey: string; queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider }): Promise<HiliteSet> {
    const { iModelKey, queryExecutor, metadataProvider } = props;
    const provider = this.getHiliteSetProvider(iModelKey, queryExecutor, metadataProvider);
    const selection = this.getSelection({ iModelKey });
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

  private handleChange(props: { source: string; iModelKey: string; level?: number; changeType: StorageSelectionChangeType; selectables: Selectable[] }) {
    const { iModelKey, source, level: inLevel, changeType, selectables: change } = props;
    const container = this.getContainer(iModelKey);
    const level = inLevel ?? 0;
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
