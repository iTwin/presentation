/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export { CLASS_NAMES } from "./tree-definitions/shared/ClassNameDefinitions.js";
export { createSharedIdsProvider } from "./tree-definitions/shared/idsProviders/SharedIdsProvider.js";
export { SearchLimitExceededError } from "./tree-definitions/shared/TreeErrors.js";
export { getClassesByView, mergeWithDefaults } from "./tree-definitions/shared/Utils.js";
export { defaultHierarchyConfiguration as defaultCategoriesTreeHierarchyConfiguration } from "./tree-definitions/trees/categories-tree/CategoriesTreeDefinition.js";
export { createCategoriesTreeIdsProvider } from "./tree-definitions/trees/categories-tree/CategoriesTreeIdsProvider.js";
export { createClassificationsTreeIdsProvider } from "./tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";
export { createModelsTree } from "./tree-definitions/trees/models-tree/CreateModelsTree.js";
export { defaultHierarchyConfiguration as defaultModelsTreeHierarchyConfiguration } from "./tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
export { createModelsTreeIdsProvider } from "./tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";
export { toObservable } from "./tree-definitions/shared/Rxjs.js";

export type { ElementId } from "./tree-definitions/shared/Types.js";
export type { CategoriesTreeHierarchyConfiguration } from "./tree-definitions/trees/categories-tree/CategoriesTreeDefinition.js";
export type { ClassificationsTreeHierarchyConfiguration } from "./tree-definitions/trees/classifications-tree/ClassificationsTreeDefinition.js";
export type {
  ElementsGroupInfo,
  ModelsTreeHierarchyConfiguration,
} from "./tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
export type { CategoriesTreeSearchPath } from "./tree-definitions/trees/categories-tree/CategoriesTreeDefinition.js";
