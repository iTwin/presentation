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
export { SelectionStorage, createStorage } from "./unified-selection/SelectionStorage";
export { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "./unified-selection/HiliteSetProvider";
export { createCachingHiliteSetProvider, CachingHiliteSetProvider } from "./unified-selection/CachingHiliteSetProvider";
export { computeSelection } from "./unified-selection/SelectionScope";
export { syncViewportWithUnifiedSelection } from "./unified-selection/viewport/SyncViewportWithUnifiedSelection";
export {
  StorageSelectionChangeType,
  StorageSelectionChangeEventArgs,
  StorageSelectionChangesListener,
  SelectionChangeEvent,
} from "./unified-selection/SelectionChangeEvent";
