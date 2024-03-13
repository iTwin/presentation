/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Selectables } from "./Selectable";
import { SelectionStorage } from "./SelectionStorage";

/** @packageDocumentation
 * @module UnifiedSelection
 */

/**
 * The type of selection change
 * @beta
 */
export type StorageSelectionChangeType =
  /** Added to selection. */
  | "add"
  /** Removed from selection. */
  | "remove"
  /** Selection was replaced. */
  | "replace"
  /** Selection was cleared. */
  | "clear";

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
 * An interface for selection change listeners
 * @beta
 */
export declare type StorageSelectionChangesListener = (args: StorageSelectionChangeEventArgs, storage: SelectionStorage) => void;

/**
 * An interface that allows subscribing and unsubscribing listeners that
 * are called when a selection has changed.
 * @beta
 */
export interface SelectionChangeEvent {
  /**
   * Registers a Listener to be executed whenever this event is raised
   * @param listener The function to be executed when the event is raised
   * @returns A function that will remove this event listener
   * @beta
   */
  addListener(listener: StorageSelectionChangesListener): () => void;
  /**
   * Un-register a previously registered listener
   * @param listener The listener to be unregistered
   * @beta
   */
  removeListener(listener: StorageSelectionChangesListener): void;
}

/**
 * An event broadcasted on selection changes
 * @internal
 */
export class SelectionChangeEventImpl implements SelectionChangeEvent {
  private _listeners: StorageSelectionChangesListener[] = [];

  /**
   * Registers a Listener to be executed whenever this event is raised
   * @param listener The function to be executed when the event is raised
   * @returns A function that will remove this event listener
   * @beta
   */
  public addListener(listener: StorageSelectionChangesListener): () => void {
    this._listeners.push(listener);
    return () => this.removeListener(listener);
  }

  /**
   * Un-register a previously registered listener
   * @param listener The listener to be unregistered
   * @beta
   */
  public removeListener(listener: StorageSelectionChangesListener): void {
    this._listeners = this._listeners.filter((x) => x !== listener);
  }

  /**
   * Raises the event by calling each registered listener with the supplied arguments
   * @param args Event arguments
   * @param storage Storage that the selection changed in
   * @beta
   */
  public raiseEvent(args: StorageSelectionChangeEventArgs, storage: SelectionStorage) {
    this._listeners.forEach((listener) => listener(args, storage));
  }
}
