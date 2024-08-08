/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Selectables } from "./Selectable";
import { SelectionStorage } from "./SelectionStorage";

/**
 * The type of selection change.
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
 *
 * **Warning:** Used in public API as an input to consumer-supplied callback. Not expected to be created / extended
 * by package consumers, may be supplemented with required attributes any time.
 *
 * @see `StorageSelectionChangesListener`
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
  imodelKey: string;
  /**
   * iModel key with which the selection is associated with.
   * @deprecated in 0.2. Use `imodelKey` instead.
   */
  iModelKey: string;
  /** The timestamp of when the selection change happened. */
  timestamp: Date;
  /** The selection storage where the even happened. */
  storage: SelectionStorage;
}

/**
 * An interface for selection change listeners.
 * @beta
 */
export type StorageSelectionChangesListener = (args: StorageSelectionChangeEventArgs) => void;
