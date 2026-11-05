/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collapseRelatedInstances } from "./steps/CollapseRelatedInstances.js";
import { identifyVaryingEntries } from "./steps/IdentifyVaryingEntries.js";
import { keepCommonFields } from "./steps/KeepCommonFields.js";
import { removeHiddenFields } from "./steps/RemoveHiddenFields.js";

import type { ContentTransformConfig } from "./TransformContent.js";

/**
 * Props for `createPropertyGridConfig`.
 * @public
 */
interface PropertyGridConfigProps {
  /**
   * Which fields to keep when content has items of different classes:
   * - `"common"` keeps only fields that apply to all items, i.e. the intersection of item fields.
   * - `"all"` keeps all fields, i.e. the union of item fields.
   *
   * A field applies to an item when the item's primary class is in the field's `primaryClassNames`. External fields
   * apply to all items.
   *
   * @default "common"
   */
  fields?: "common" | "all";
}

/**
 * Creates a `transformContent` configuration for displaying content of one or more instances as a single set of
 * entries in a property grid. Its steps:
 *
 * 1. Drop fields marked as `hidden`.
 * 2. Keep only fields that apply to all items, unless `fields: "all"` is set.
 * 3. Reshape values of fields reached over many-cardinality relationship paths. When every item reaches at most one
 *    related instance over the path, values are unwrapped from arrays. Otherwise, fields of the path within the same
 *    category are grouped into a `RelatedInstancesEntry` holding the related instances of every item.
 * 4. Set `varies` on entries whose values differ between items they apply to. Values are compared deeply.
 *
 * When an entry doesn't vary, all items it applies to have the same value.
 *
 * @example
 * ```ts
 * const records = transformContent({ descriptor, items }, createPropertyGridConfig());
 * const allFieldsRecords = transformContent({ descriptor, items }, createPropertyGridConfig({ fields: "all" }));
 * ```
 *
 * @public
 */
export function createPropertyGridConfig(props?: PropertyGridConfigProps): ContentTransformConfig {
  return {
    steps: [
      removeHiddenFields(),
      ...((props?.fields ?? "common") === "common" ? [keepCommonFields()] : []),
      collapseRelatedInstances(),
      identifyVaryingEntries(),
    ],
  };
}
