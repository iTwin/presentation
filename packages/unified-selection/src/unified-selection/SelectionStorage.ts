/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BeEvent } from "@itwin/core-bentley";
import { Event } from "@itwin/presentation-shared";
import { Selectable, Selectables } from "./Selectable";
import { StorageSelectionChangeEventArgs, StorageSelectionChangesListener, StorageSelectionChangeType } from "./SelectionChangeEvent";

/** @beta */
type IModelKeyProp =
  | {
      /** Key of the iModel to get selection levels for. */
      imodelKey: string;
    }
  | {
      /**
       * Key of the iModel to get selection levels for.
       * @deprecated in 0.2. Use `imodelKey` instead.
       */
      iModelKey: string;
    };

/**
 * Defines return value of `createStorage`.
 *
 * **Warning:** Used in public API as a return value. Not expected to be created / extended by package
 * consumers, may be supplemented with required attributes any time.
 *
 * @see `createStorage`
 * @beta
 */
export interface SelectionStorage {
  /** An event that is raised when selection changes. */
  selectionChangeEvent: Event<StorageSelectionChangesListener>;

  /** Get the selection levels currently stored for the specified iModel. */
  getSelectionLevels(props: IModelKeyProp): number[];

  /** Get the selection stored in the storage. */
  getSelection(
    props: IModelKeyProp & {
      /** Level of the selection. Defaults to `0`. */
      level?: number;
    },
  ): Selectables;

  /** Add keys to the selection. */
  addToSelection(
    props: IModelKeyProp & {
      /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
      source: string;
      /** The selectables to add to selection. */
      selectables: Selectable[];
      /** Level of the selection. Defaults to `0`. */
      level?: number;
    },
  ): void;

  /** Remove keys from current selection. */
  removeFromSelection(
    props: IModelKeyProp & {
      /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
      source: string;
      /** The selectables to remove from selection. */
      selectables: Selectable[];
      /** Level of the selection. Defaults to `0`. */
      level?: number;
    },
  ): void;

  /** Replace current selection. */
  replaceSelection(
    props: IModelKeyProp & {
      /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
      source: string;
      /** The selectables to add to selection. */
      selectables: Selectable[];
      /** Level of the selection. Defaults to `0`. */
      level?: number;
    },
  ): void;

  /** Clear current selection. */
  clearSelection(
    props: IModelKeyProp & {
      /** Name of the selection source. Generally, this identifies the component that makes the selection change. */
      source: string;
      /** Level of the selection. Defaults to `0`. */
      level?: number;
    },
  ): void;

  /** Clear storage for an iModel. This function should be called when iModel is closed. */
  clearStorage(props: IModelKeyProp): void;
}

/**
 * Creates a selection storage which stores and allows managing application-level selection.
 *
 * **Note:** `clearSelection` should be called upon iModel close to free-up memory:
 *
 * ```ts
 * import { IModelConnection } from "@itwin/core-frontend";
 * IModelConnection.onClose.addListener((imodel) => {
 *   storage.clearStorage(imodel.key);
 * });
 * ```
 *
 * @beta
 */
export function createStorage(): SelectionStorage {
  return new SelectionStorageImpl();
}

/** @internal */
export const IMODEL_CLOSE_SELECTION_CLEAR_SOURCE = "Unified selection storage: clear";

class SelectionStorageImpl implements SelectionStorage {
  private _storage = new Map<string, MultiLevelSelectablesContainer>();
  public selectionChangeEvent: BeEvent<StorageSelectionChangesListener>;

  constructor() {
    this.selectionChangeEvent = new BeEvent();
  }

  public getSelectionLevels(props: IModelKeyProp): number[] {
    return this.getContainer(getIModelKey(props)).getSelectionLevels();
  }

  public getSelection(props: IModelKeyProp & { level?: number }): Selectables {
    return this.getContainer(getIModelKey(props)).getSelection(props.level ?? 0);
  }

  public addToSelection(props: IModelKeyProp & { source: string; selectables: Selectable[]; level?: number }): void {
    this.handleChange({ ...props, changeType: "add" });
  }

  public removeFromSelection(props: IModelKeyProp & { source: string; selectables: Selectable[]; level?: number }): void {
    this.handleChange({ ...props, changeType: "remove" });
  }

  public replaceSelection(props: IModelKeyProp & { source: string; selectables: Selectable[]; level?: number }): void {
    this.handleChange({ ...props, changeType: "replace" });
  }

  public clearSelection(props: IModelKeyProp & { source: string; level?: number }): void {
    this.handleChange({ ...props, changeType: "clear", selectables: [] });
  }

  public clearStorage(props: IModelKeyProp): void {
    const imodelKey = getIModelKey(props);
    this.clearSelection({ source: IMODEL_CLOSE_SELECTION_CLEAR_SOURCE, imodelKey });
    this._storage.delete(imodelKey);
  }

  private getContainer(imodelKey: string): MultiLevelSelectablesContainer {
    let selectionContainer = this._storage.get(imodelKey);
    if (!selectionContainer) {
      selectionContainer = new MultiLevelSelectablesContainer();
      this._storage.set(imodelKey, selectionContainer);
    }
    return selectionContainer;
  }

  private handleChange(props: IModelKeyProp & { source: string; level?: number; changeType: StorageSelectionChangeType; selectables: Selectable[] }) {
    const { source, level: inLevel, changeType, selectables: change } = props;
    const imodelKey = getIModelKey(props);
    const container = this.getContainer(imodelKey);
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
      imodelKey,
      iModelKey: imodelKey,
      changeType,
      selectables: selected,
      timestamp: new Date(),
      storage: this,
    };
    this.selectionChangeEvent.raiseEvent(event);
  }
}

function getIModelKey(props: IModelKeyProp): string {
  // eslint-disable-next-line deprecation/deprecation
  return "imodelKey" in props ? props.imodelKey : props.iModelKey;
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
