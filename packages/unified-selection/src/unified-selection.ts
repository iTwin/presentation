/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export type { CustomSelectable, SelectableIdentifier, SelectableInstanceKey } from "./unified-selection/Selectable.js";
export { TRANSIENT_ELEMENT_CLASSNAME, Selectable, Selectables } from "./unified-selection/Selectable.js";
export type { SelectionStorage } from "./unified-selection/SelectionStorage.js";
export { createStorage } from "./unified-selection/SelectionStorage.js";
export type { HiliteSet, HiliteSetProvider } from "./unified-selection/HiliteSetProvider.js";
export { createHiliteSetProvider } from "./unified-selection/HiliteSetProvider.js";
// eslint-disable-next-line @typescript-eslint/no-deprecated
export type { CachingHiliteSetProvider } from "./unified-selection/CachingHiliteSetProvider.js";
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { createCachingHiliteSetProvider } from "./unified-selection/CachingHiliteSetProvider.js";
export type { IModelHiliteSetProvider } from "./unified-selection/IModelHiliteSetProvider.js";
export { createIModelHiliteSetProvider } from "./unified-selection/IModelHiliteSetProvider.js";
export type { SelectionScope } from "./unified-selection/SelectionScope.js";
export { computeSelection } from "./unified-selection/SelectionScope.js";
export { enableUnifiedSelectionSyncWithIModel } from "./unified-selection/EnableUnifiedSelectionSyncWithIModel.js";
export type { StorageSelectionChangeType, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "./unified-selection/SelectionChangeEvent.js";
