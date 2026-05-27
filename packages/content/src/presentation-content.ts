/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// Core data model
export type { ContentTarget, ContentSource } from "./content/ContentTarget.js";
export type { ContentDescriptor } from "./content/model/ContentDescriptor.js";
export type { Field, PropertyField, CalculatedField, ExternalField } from "./content/model/Field.js";
export { CategoryDefinition } from "./content/model/Category.js";
export type { ContentItem, ContentValues } from "./content/model/ContentItem.js";

// Extension points
export { DEFAULT_FIELDS_PROVIDER_PRIORITY } from "./content/extensions/BaseFieldsProvider.js";
export { defineIModelFieldsProvider } from "./content/extensions/IModelFieldsProvider.js";
export { defineExternalFieldsProvider } from "./content/extensions/ExternalFieldsProvider.js";
export {
  defineDescriptorTransformer,
  DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY,
} from "./content/extensions/DescriptorTransformer.js";
export { defineQueryFilterer } from "./content/extensions/QueryFilterer.js";

// Pipeline
export type { ContentConfiguration } from "./content/Content.js";
export { resolveContentSources, createContentProvider } from "./content/Content.js";
export { getDistinctFieldValues } from "./content/DistinctValues.js";

// Consumer utilities
export { mapItems, reduceItems } from "./content/Utilities.js";
