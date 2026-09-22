/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export { CLASS_NAMES } from "./tree-definitions/shared/ClassNameDefinitions.js";
export { createBaseIdsProvider } from "./tree-definitions/shared/idsProviders/BaseIdsProvider.js";
export { SearchLimitExceededError } from "./tree-definitions/shared/TreeErrors.js";
export { getClassesByView, mergeWithDefaults } from "./tree-definitions/shared/Utils.js";
export {
  CategoriesTreeDefinition,
  defaultHierarchyConfiguration as defaultCategoriesTreeHierarchyConfiguration,
} from "./tree-definitions/trees/categories-tree/CategoriesTreeDefinition.js";
export { createCategoriesTreeIdsProvider } from "./tree-definitions/trees/categories-tree/CategoriesTreeIdsProvider.js";
export { ClassificationsTreeDefinition } from "./tree-definitions/trees/classifications-tree/ClassificationsTreeDefinition.js";
export { createClassificationsTreeIdsProvider } from "./tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";
export {
  createModelsTree,
  ModelsTreeDefinition,
  defaultHierarchyConfiguration as defaultModelsTreeHierarchyConfiguration,
} from "./tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
export { createModelsTreeIdsProvider } from "./tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";

export type { ElementId } from "./tree-definitions/shared/Types.js";
export type { ParentElementsPath } from "./tree-definitions/shared/Utils.js";
export type { CategoriesTreeHierarchyConfiguration } from "./tree-definitions/trees/categories-tree/CategoriesTreeDefinition.js";
export type { ClassificationsTreeHierarchyConfiguration } from "./tree-definitions/trees/classifications-tree/ClassificationsTreeDefinition.js";
export type {
  ElementsGroupInfo,
  ModelsTreeHierarchyConfiguration,
} from "./tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
