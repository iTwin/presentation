/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module UnifiedSelection
 *
 * @docs-group-description UnifiedSelection
 * API for working with unified selection.
 */
export * from "./unified-selection/Selectable";
export * from "./unified-selection/SelectionStorage";
export {
  StorageSelectionChangeType,
  StorageSelectionChangeEventArgs,
  StorageSelectionChangesListener,
  SelectionChangeEvent,
} from "./unified-selection/SelectionChangeEvent";
