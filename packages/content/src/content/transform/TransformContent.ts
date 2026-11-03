/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { DeepReadonly, InstanceKey, RelationshipPath, Value } from "@itwin/presentation-shared";
import type { CategoryDefinition } from "../model/Category.js";
import type { ReadonlyContentDescriptor } from "../model/ContentDescriptor.js";
import type { ContentItem } from "../model/ContentItem.js";
import type { Field, ReadonlyField, ReadonlyPropertyField } from "../model/Field.js";

/**
 * Intermediate content format passed between content transform steps. Holds one entry per displayed field
 * (or group of fields), each carrying raw values of all source items.
 *
 * @public
 */
export interface ContentRecords {
  /**
   * Category definitions available to entries, keyed by category ID. Initialized from the descriptor's categories;
   * steps may add synthetic categories.
   */
  readonly categories: Readonly<Record<CategoryDefinition["id"], DeepReadonly<CategoryDefinition>>>;
  /** Entries in display order. Steps may filter, reorder, replace or duplicate them. */
  readonly entries: ReadonlyArray<ContentEntry>;
}

/**
 * Source content being transformed by {@link transformContent}. Created once before running the steps, and the same
 * context is passed to every step.
 *
 * @public
 */
export interface ContentTransformContext {
  /** Descriptor of the source content. */
  readonly descriptor: ReadonlyContentDescriptor;
  /** Source content items. Entry values are aligned with this array by index. */
  readonly items: ReadonlyArray<ContentItem>;
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
  /** ID of the category the entry belongs to. Initialized from the field's `categoryId`. */
  readonly categoryId?: CategoryDefinition["id"];
  /**
   * Set when items the entry applies to have different values for it. Set by `createPropertyGridConfig` steps.
   */
  readonly isMerged?: boolean;
}

/**
 * An entry for a single field.
 * @public
 */
export interface FieldEntry extends BaseContentEntry {
  /** Discriminator of the entry kind. */
  readonly kind: "field";
  /** The field this entry represents. */
  readonly field: ReadonlyField;
  /**
   * Raw values of the field, one per source item: `values[i]` belongs to `ContentTransformContext.items[i]`. Items the field
   * doesn't apply to have `undefined` values.
   */
  readonly values: ReadonlyArray<DeepReadonly<Value>>;
}

/**
 * An entry grouping fields of a many-cardinality relationship path by related instance.
 * Created by `createPropertyGridConfig` steps.
 * @public
 */
export interface RelatedInstancesEntry extends BaseContentEntry {
  /** Discriminator of the entry kind. */
  readonly kind: "related-instances";
  /** The relationship path from content target to the related instances. */
  readonly pathFromTarget: DeepReadonly<RelationshipPath>;
  /** Fields of the related instances, in display order. */
  readonly fields: ReadonlyArray<ReadonlyPropertyField>;
  /** Related instances of each source item: `values[i]` belongs to `ContentTransformContext.items[i]`. */
  readonly values: ReadonlyArray<ReadonlyArray<RelatedInstanceValues>>;
}

/**
 * Values of a single related instance in a `RelatedInstancesEntry`.
 * @public
 */
export interface RelatedInstanceValues {
  /** Key of the related instance. */
  readonly key: DeepReadonly<InstanceKey>;
  /** Key of the last relationship step's instance, when present. */
  readonly relationshipKey?: DeepReadonly<InstanceKey>;
  /** Raw values of the related instance, keyed by field ID. */
  readonly values: Readonly<Record<Field["id"], DeepReadonly<Value>>>;
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
  items: ReadonlyArray<ContentItem>;
}

/**
 * Configuration of {@link transformContent}.
 * @public
 */
export interface ContentTransformConfig {
  /** Steps to run over content records, in order. */
  steps: ReadonlyArray<ContentTransformStep>;
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
    categories: descriptor.categories,
    entries: Object.values(descriptor.fields).map((field): FieldEntry => ({
      kind: "field",
      field,
      ...(field.categoryId !== undefined ? { categoryId: field.categoryId } : {}),
      values: items.map((item) => item.getValue(field)),
    })),
  };
}
