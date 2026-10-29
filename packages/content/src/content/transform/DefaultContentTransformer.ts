/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContentTransformer } from "./ContentTransformer.js";
import { collapseRelatedInstances } from "./steps/CollapseRelatedInstances.js";
import { hideHiddenFields } from "./steps/HideHiddenFields.js";
import { keepCommonFields } from "./steps/KeepCommonFields.js";
import { mergeFields } from "./steps/MergeFields.js";

import type { ReadonlyField, ReadonlyPropertyField } from "../model/Field.js";
import type { ContentTransformer } from "./ContentTransformer.js";

/**
 * Props for `createDefaultContentTransformer`.
 * @public
 */
interface DefaultContentTransformerProps {
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
 * Creates a content transformer for displaying content of one or more instances as a single set of entries, e.g. in a
 * property grid. The transformer:
 *
 * 1. Drops fields marked as `hidden`.
 * 2. Keeps only fields that apply to all items, unless `fields: "all"` is set. Before that, related property fields
 *    that differ only by the source class of their path's first step are combined into one field that applies to all
 *    classes of the original fields. Such fields show up when content is requested for instances of several classes,
 *    as related property paths start at each content target's class.
 * 3. Reshapes values of fields reached over many-cardinality relationship paths. When every item reaches at most one
 *    related instance over the path, values are unwrapped from arrays. Otherwise, fields of the path within the same
 *    category are grouped into a `RelatedInstancesEntry`, with values grouped by related instance.
 * 4. Sets `isMerged` on entries whose values differ between items they apply to. Values are compared deeply.
 *
 * When an entry isn't merged, all items it applies to have the same value.
 *
 * @public
 */
export function createDefaultContentTransformer(props?: DefaultContentTransformerProps): ContentTransformer {
  const combinedFields = new WeakMap<ReadonlyField, ReadonlyPropertyField[]>();
  return createContentTransformer(
    hideHiddenFields(),
    ...((props?.fields ?? "common") === "common" ? [keepCommonFields({ combinedFields })] : []),
    collapseRelatedInstances({
      getFieldPaths: (field) => (combinedFields.get(field) ?? [field]).map(({ pathFromTarget }) => pathFromTarget),
    }),
    mergeFields(),
  );
}
