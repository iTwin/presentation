/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { transformForPropertyGrid } from "./PropertyGrid.js";

import type { DeepReadonly, Value } from "@itwin/presentation-shared";
import type { ReadonlyContentDescriptor } from "../model/ContentDescriptor.js";
import type { ContentItem } from "../model/ContentItem.js";
import type { ReadonlyField, ReadonlyPropertyField } from "../model/Field.js";

/**
 * Content shaped for display by {@link transformContent}. Holds one entry per displayed field (or group of fields),
 * each carrying raw values of all transformed content items.
 *
 * @public
 */
export interface ContentEntries {
  /** Entries in descriptor field order. */
  entries: ContentEntry[];
}

/**
 * An entry of {@link ContentEntries}.
 * @public
 */
type ContentEntry = FieldEntry | RelatedInstancesEntry;

/**
 * Attributes shared by all `ContentEntry` kinds.
 * @public
 */
interface BaseContentEntry {
  /**
   * Whether content items the entry applies to have different values for it. When `false`, all items the entry
   * applies to have the same value, and the rest have no values.
   */
  varies: boolean;
}

/**
 * An entry for a single field.
 * @public
 */
interface FieldEntry extends BaseContentEntry {
  /** Discriminator of the entry kind. */
  kind: "field";
  /** The field this entry represents. */
  field: ReadonlyField;
  /**
   * Raw values of the field, one per transformed content item: `values[i]` belongs to `items[i]`. Items the field
   * doesn't apply to have `undefined` values.
   */
  values: Array<DeepReadonly<Value>>;
}

/**
 * An entry grouping fields of a many-cardinality relationship path by related instance.
 * @public
 */
interface RelatedInstancesEntry extends BaseContentEntry {
  /** Discriminator of the entry kind. */
  kind: "related-instances";
  /**
   * Fields of the related instances, in display order. There's at least one field, and all fields share the same
   * `pathFromTarget` - the relationship path from content target to the related instances - and `categoryId`.
   */
  fields: ReadonlyPropertyField[];
  /**
   * Related instances of each transformed content item, as returned by `ContentItem.getRelatedInstances`:
   * `values[i]` belongs to `items[i]`. Use `getValue` of a related instance to get its value of one of `fields`.
   */
  values: Array<ReturnType<ContentItem["getRelatedInstances"]>>;
}

/**
 * Transforms content for displaying it in a property grid - content of one or more instances is shown as a single
 * set of entries:
 *
 * - Fields marked as `hidden` are dropped.
 * - Only fields that apply to all items are kept, unless `fields` is `"all"`. A field applies to an item when the
 *   item's primary class is in the field's `primaryClassNames`; external fields apply to all items.
 * - Values of fields reached over many-cardinality relationship paths are reshaped. When every item reaches at most
 *   one related instance over the path, values are unwrapped from arrays. Otherwise, fields of the path within the
 *   same category are grouped into a single `related-instances` entry holding the related instances of every item.
 * - Each entry's `varies` tells whether its values differ between items it applies to. Values are compared deeply,
 *   and related instances are compared regardless of their order.
 *
 * @public
 */
interface PropertyGridTransformConfig {
  /** Discriminator of the transformation type. */
  type: "propertyGrid";
  /**
   * Which fields to keep when content has items of different classes:
   * - `"common"` keeps only fields that apply to all items, i.e. the intersection of item fields.
   * - `"all"` keeps all fields, i.e. the union of item fields.
   *
   * @default "common"
   */
  fields?: "common" | "all";
}

/**
 * Configuration of {@link transformContent}, telling what the content is transformed for.
 * @public
 */
type ContentTransformConfig = PropertyGridTransformConfig;

/**
 * Props for {@link transformContent}.
 * @public
 */
interface TransformContentProps {
  /** Descriptor of the content. */
  descriptor: ReadonlyContentDescriptor;
  /** Content items to transform. */
  items: ContentItem[];
  /** What the content is transformed for. */
  config: ContentTransformConfig;
}

/**
 * Shapes raw content items for display, as specified by the given configuration. The result is meant to be mapped
 * into a UI-specific format, e.g. property grid data.
 *
 * @example
 * ```ts
 * const { entries } = transformContent({ descriptor, items, config: { type: "propertyGrid" } });
 * ```
 *
 * @public
 */
export function transformContent(props: TransformContentProps): ContentEntries {
  const { descriptor, items, config } = props;
  return transformForPropertyGrid({ descriptor, items, fields: config.fields ?? "common" });
}
