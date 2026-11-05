/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { DeepReadonly, Value } from "@itwin/presentation-shared";
import type { ReadonlyContentDescriptor } from "../model/ContentDescriptor.js";
import type { ContentItem } from "../model/ContentItem.js";
import type { ReadonlyField, ReadonlyPropertyField } from "../model/Field.js";

/**
 * Intermediate content format passed between content transform steps. Holds one entry per displayed field
 * (or group of fields), each carrying raw values of all source items.
 *
 * @public
 */
export interface ContentRecords {
  /** Entries in display order. Steps may filter, reorder, replace or duplicate them. */
  entries: ContentEntry[];
}

/**
 * Source content being transformed by {@link transformContent}. Created once before running the steps, and the same
 * context is passed to every step.
 *
 * @public
 */
export interface ContentTransformContext {
  /** Descriptor of the source content. */
  descriptor: ReadonlyContentDescriptor;
  /** Source content items. Entry values are aligned with this array by index. */
  items: ContentItem[];
}

/**
 * An entry of {@link ContentRecords}.
 * @public
 */
export type ContentEntry = FieldEntry | RelatedInstancesEntry;

/**
 * Attributes shared by all `ContentEntry` kinds.
 * @public
 */
interface BaseContentEntry {
  /**
   * Set when items the entry applies to have different values for it. Set by `createPropertyGridConfig` steps.
   */
  varies?: boolean;
}

/**
 * An entry for a single field.
 * @public
 */
export interface FieldEntry extends BaseContentEntry {
  /** Discriminator of the entry kind. */
  kind: "field";
  /** The field this entry represents. */
  field: ReadonlyField;
  /**
   * Raw values of the field, one per source item: `values[i]` belongs to `ContentTransformContext.items[i]`. Items the field
   * doesn't apply to have `undefined` values.
   */
  values: Array<DeepReadonly<Value>>;
}

/**
 * An entry grouping fields of a many-cardinality relationship path by related instance.
 * Created by `createPropertyGridConfig` steps.
 * @public
 */
export interface RelatedInstancesEntry extends BaseContentEntry {
  /** Discriminator of the entry kind. */
  kind: "related-instances";
  /**
   * Fields of the related instances, in display order. There's at least one field, and all fields share the same
   * `pathFromTarget` - the relationship path from content target to the related instances - and `categoryId`.
   */
  fields: ReadonlyPropertyField[];
  /**
   * Related instances of each source item, as returned by `ContentItem.getRelatedInstances`: `values[i]` belongs to
   * `ContentTransformContext.items[i]`. Use `getValue` of a related instance to get its value of one of `fields`.
   */
  values: Array<ReturnType<ContentItem["getRelatedInstances"]>>;
}

/**
 * A single content transformation step. Takes records produced by the previous step and the transformation context,
 * and returns new records. Steps must not mutate the given records.
 * @public
 */
export type ContentTransformStep = (records: ContentRecords, context: ContentTransformContext) => ContentRecords;

/**
 * Content to transform with {@link transformContent}.
 * @public
 */
interface TransformContentInput {
  /** Descriptor of the content. */
  descriptor: ReadonlyContentDescriptor;
  /** Content items to transform. */
  items: ContentItem[];
}

/**
 * Configuration of {@link transformContent}.
 * @public
 */
export interface ContentTransformConfig {
  /** Steps to run over content records, in order. */
  steps: ContentTransformStep[];
}

/**
 * Converts content into {@link ContentRecords} and runs steps of the given configuration over them, in order. Every
 * step receives the same {@link ContentTransformContext} with the source content.
 *
 * Initial records contain one `FieldEntry` per descriptor field, in descriptor order, with raw values of every
 * item. The result is meant to be mapped into a consumer-specific format, e.g. property grid data.
 *
 * Use a predefined configuration, e.g. one created by `createPropertyGridConfig`, or provide custom steps.
 *
 * @example
 * ```ts
 * const propertyGridRecords = transformContent({ descriptor, items }, createPropertyGridConfig());
 * const customRecords = transformContent({ descriptor, items }, { steps: [myFilteringStep, mySortingStep] });
 * ```
 *
 * @public
 */
export function transformContent(content: TransformContentInput, config: ContentTransformConfig): ContentRecords {
  const context: ContentTransformContext = { descriptor: content.descriptor, items: content.items };
  return config.steps.reduce((records, step) => step(records, context), createInitialRecords(context));
}

function createInitialRecords({ descriptor, items }: ContentTransformContext): ContentRecords {
  return {
    entries: Object.values(descriptor.fields).map((field): FieldEntry => ({
      kind: "field",
      field,
      values: items.map((item) => item.getValue(field)),
    })),
  };
}
