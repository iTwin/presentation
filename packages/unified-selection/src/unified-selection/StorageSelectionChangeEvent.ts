/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { BeEvent } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { SelectableObjectSet } from "./SelectableObjectSet";
import { SelectionStorageInterface } from "./SelectionStorage";

/**
 * An interface for selection change listeners.
 * @beta
 */
export declare type StorageSelectionChangesListener = (args: StorageSelectionChangeEventArgs, storage: SelectionStorageInterface) => void;

/**
 * An event broadcasted on selection changes
 * @beta
 */
export class StorageSelectionChangeEvent extends BeEvent<StorageSelectionChangesListener> {}

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
 * The event object that's sent when the selection changes.
 * @beta
 */
export interface StorageSelectionChangeEventArgs {
  /** The name of the selection source which caused the selection change. */
  source: string;
  /** Level of the selection. */
  level: number;
  /** The selection change type. */
  changeType: StorageSelectionChangeType;
  /** Set of selectable objects affected by this selection change event. */
  selectableObjects: Readonly<SelectableObjectSet>;
  /** iModel connection with which the selection is associated with. */
  imodel: IModelConnection;
  /** The timestamp of when the selection change happened */
  timestamp: Date;
  /** Id of the ruleset associated with the selection change. */
  rulesetId?: string;
}
