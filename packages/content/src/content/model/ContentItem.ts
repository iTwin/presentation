/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { InstanceKey, Value } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "./ContentDescriptor.js";
import type { Field } from "./Field.js";
import type { DeepReadonly } from "./Utils.js";

/**
 * Raw data for one row of the content result.
 * A plain data bag — serializable, no behavior, no reference to the descriptor.
 *
 * All fields (property, SQL calculated, and external) are populated by the pipeline.
 * Fields that don't apply to this instance's class have `undefined` values.
 *
 * @public
 */
export interface ContentValues {
  /** The primary instance this row represents. */
  primaryKey: InstanceKey;
  /** Map of field ID → raw value. */
  values: Record<Field["id"], Value>;
}

/**
 * An accessor that pairs a descriptor with content values,
 * providing ergonomic typed access to field values.
 *
 * @public
 */
export interface ContentItem {
  /** The descriptor that defines the field schema for this item. */
  readonly descriptor: DeepReadonly<ContentDescriptor>;

  /** The primary instance this row represents. */
  readonly primaryKey: DeepReadonly<InstanceKey>;

  /** Map of field ID → raw value. */
  readonly values: DeepReadonly<Record<Field["id"], Value>>;

  /**
   * Retrieve a value by field reference.
   * Returns `undefined` if the field doesn't apply to this item's class.
   */
  getValue(field: Field): DeepReadonly<Value>;
}

/**
 * Create a `ContentItem` accessor from a descriptor and raw content values.
 *
 * @internal
 */
export function createContentItem({
  descriptor,
  contentValues,
}: {
  descriptor: ContentDescriptor;
  contentValues: ContentValues;
}): ContentItem {
  return {
    descriptor,
    primaryKey: contentValues.primaryKey,
    values: contentValues.values,
    getValue(field: Field): Value {
      return contentValues.values[field.id];
    },
  };
}
