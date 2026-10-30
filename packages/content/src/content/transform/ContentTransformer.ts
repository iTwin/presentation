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
  /** Descriptor of the source content. */
  readonly descriptor: ReadonlyContentDescriptor;
  /** Source content items. Entry values are aligned with this array by index. */
  readonly items: ReadonlyArray<ContentItem>;
  /**
   * Category definitions available to entries, keyed by category ID. Initialized from `descriptor.categories`;
   * steps may add synthetic categories.
   */
  readonly categories: Readonly<Record<CategoryDefinition["id"], DeepReadonly<CategoryDefinition>>>;
  /** Entries in display order. Steps may filter, reorder, replace or duplicate them. */
  readonly entries: ReadonlyArray<ContentEntry>;
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
   * Set when items the entry applies to have different values for it. Set by `createDefaultContentTransformer`.
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
   * Raw values of the field, one per source item: `values[i]` belongs to `ContentRecords.items[i]`. Items the field
   * doesn't apply to have `undefined` values.
   */
  readonly values: ReadonlyArray<DeepReadonly<Value>>;
}

/**
 * An entry grouping fields of a many-cardinality relationship path by related instance.
 * Created by `createDefaultContentTransformer`.
 * @public
 */
export interface RelatedInstancesEntry extends BaseContentEntry {
  /** Discriminator of the entry kind. */
  readonly kind: "related-instances";
  /** The relationship path from content target to the related instances. */
  readonly pathFromTarget: DeepReadonly<RelationshipPath>;
  /** Fields of the related instances, in display order. */
  readonly fields: ReadonlyArray<ReadonlyPropertyField>;
  /** Related instances of each source item: `values[i]` belongs to `ContentRecords.items[i]`. */
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
 * A single step of a content transformer created with {@link createContentTransformer}. Steps must not mutate
 * the given records - they return new ones instead.
 * @public
 */
export type ContentTransformStep = (records: ContentRecords) => ContentRecords;

/**
 * Content to transform with a content transformer.
 * @public
 */
interface ContentTransformerInput {
  /** Descriptor of the content. */
  descriptor: ReadonlyContentDescriptor;
  /** Content items to transform. */
  items: ReadonlyArray<ContentItem>;
}

/**
 * A function that converts content into {@link ContentRecords} and runs content transform steps over them.
 * Created with {@link createContentTransformer} or `createDefaultContentTransformer`.
 * @public
 */
export type ContentTransformer = (content: ContentTransformerInput) => ContentRecords;

/**
 * Creates a {@link ContentTransformer} that converts content into {@link ContentRecords} and runs the given steps
 * over them, in order.
 *
 * Initial records contain one `FieldEntry` per descriptor field, in descriptor order, with raw values of every
 * item. The result is meant to be mapped into a consumer-specific format, e.g. property grid data.
 *
 * Use `createDefaultContentTransformer` for the commonly needed transformation. Use this function to compose custom
 * steps instead.
 *
 * @example
 * ```ts
 * const transform = createContentTransformer(myFilteringStep, mySortingStep);
 * const propertyData = mapToPropertyData(transform({ descriptor, items }));
 * ```
 *
 * @public
 */
export function createContentTransformer(...steps: ContentTransformStep[]): ContentTransformer {
  return (content) => steps.reduce((records, step) => step(records), createInitialRecords(content));
}

function createInitialRecords({ descriptor, items }: ContentTransformerInput): ContentRecords {
  return {
    descriptor,
    items,
    categories: descriptor.categories,
    entries: Object.values(descriptor.fields).map((field): FieldEntry => ({
      kind: "field",
      field,
      ...(field.categoryId !== undefined ? { categoryId: field.categoryId } : {}),
      values: items.map((item) => item.getValue(field)),
    })),
  };
}
