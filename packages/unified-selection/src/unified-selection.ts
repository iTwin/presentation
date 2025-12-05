/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export {
  TRANSIENT_ELEMENT_CLASSNAME,
  CustomSelectable,
  Selectable,
  SelectableIdentifier,
  SelectableInstanceKey,
  Selectables,
} from "./unified-selection/Selectable.js";
export { SelectionStorage, createStorage } from "./unified-selection/SelectionStorage.js";
export { createHiliteSetProvider, HiliteSet, HiliteSetProvider } from "./unified-selection/HiliteSetProvider.js";
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { createCachingHiliteSetProvider, CachingHiliteSetProvider } from "./unified-selection/CachingHiliteSetProvider.js";
export { createIModelHiliteSetProvider, IModelHiliteSetProvider } from "./unified-selection/IModelHiliteSetProvider.js";
export { computeSelection, SelectionScope } from "./unified-selection/SelectionScope.js";
export { enableUnifiedSelectionSyncWithIModel } from "./unified-selection/EnableUnifiedSelectionSyncWithIModel.js";
export { StorageSelectionChangeType, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "./unified-selection/SelectionChangeEvent.js";
