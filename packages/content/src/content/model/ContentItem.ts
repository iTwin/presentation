/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { serializeRelationshipPath } from "./Utils.js";

import type { InstanceKey, RelationshipPath, Value } from "@itwin/presentation-shared";
import type { ContentDescriptor, ReadonlyContentDescriptor } from "./ContentDescriptor.js";
import type { Field, PropertyField, ReadonlyField, ReadonlyPropertyField } from "./Field.js";
import type { DeepReadonly } from "./Utils.js";

/**
 * One related instance reached over a relationship path.
 * @public
 */
export interface RelatedInstanceEntry {
  /** Key of the related (path target) instance. */
  key: InstanceKey;
  /** Key of the last step's relationship instance (when the path's fields include relationship-class properties). */
  relationshipKey?: InstanceKey;
}

/**
 * Raw data for one row of the content result.
 * A plain data bag — serializable, no behavior, no reference to the descriptor.
 *
 * All fields (property, SQL calculated, and external) are populated by the pipeline.
 * Fields that don't apply to this instance's class have `undefined` values.
 *
 * @internal
 */
export interface ContentValues {
  /** The primary instance this row represents. */
  primaryKey: InstanceKey;
  /** Map of field ID → raw value. */
  values: Record<Field["id"], Value>;
  /**
   * Related instances reached by this item, keyed by serialized relationship path
   * ({@link serializeRelationshipPath} — same serialization used in field IDs).
   *
   * Alignment contract: for a field whose `pathFromTarget` serializes to key `P` and whose value
   * is array-shaped due to path cardinality, `values[field.id]` has exactly `relatedInstances[P].length`
   * elements — element `i` comes from `relatedInstances[P][i]`, with `undefined` holes where that
   * instance's property is `null`. For single-instance (`"one"`) paths the entry array has length
   * 0 or 1 and the field value is inlined.
   */
  relatedInstances: Record<string, RelatedInstanceEntry[]>;
}

/**
 * An accessor that pairs a descriptor with content values,
 * providing ergonomic typed access to field values.
 *
 * @public
 */
export interface ContentItem {
  /** The descriptor that defines the field schema for this item. */
  readonly descriptor: ReadonlyContentDescriptor;

  /** The primary instance this row represents. */
  readonly primaryKey: DeepReadonly<InstanceKey>;

  /** Map of field ID → raw value. */
  readonly values: DeepReadonly<Record<Field["id"], Value>>;

  /**
   * Related instances reached by this item, keyed by serialized relationship path.
   * See {@link (ContentItem:interface).getRelatedInstances} for an ergonomic accessor.
   */
  readonly relatedInstances: DeepReadonly<Record<string, RelatedInstanceEntry[]>>;

  /**
   * Retrieve a value by field reference.
   * Returns `undefined` if the field doesn't apply to this item's class.
   */
  getValue(field: ReadonlyField): DeepReadonly<Value>;

  /**
   * Retrieve the related instances reached over the given relationship path (or a property
   * field's {@link (PropertyField:interface).pathFromTarget}), each paired with a scoped
   * `getValue` that reads that instance's value for a field on the same path.
   *
   * Returns an empty array when no related instance was reached over the path.
   */
  getRelatedInstances(props: { pathFromTarget: DeepReadonly<RelationshipPath> }): ReadonlyArray<{
    /** Key of the related instance. */
    key: DeepReadonly<InstanceKey>;
    /** Key of the last step's relationship instance, when present. */
    relationshipKey?: DeepReadonly<InstanceKey>;
    /**
     * Retrieve this related instance's value for the given field.
     * Returns `undefined` if the field isn't reached over this same path.
     */
    getValue(field: ReadonlyPropertyField): DeepReadonly<Value>;
  }>;
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
    relatedInstances: contentValues.relatedInstances,
    getValue(field: ReadonlyField): DeepReadonly<Value> {
      return contentValues.values[field.id];
    },
    getRelatedInstances(props: { pathFromTarget: RelationshipPath }) {
      const pathKey = serializeRelationshipPath({ path: props.pathFromTarget });
      const entries = contentValues.relatedInstances[pathKey] ?? [];
      return entries.map((entry, index) => ({
        key: entry.key,
        relationshipKey: entry.relationshipKey,
        getValue(field: PropertyField): Value {
          if (serializeRelationshipPath({ path: field.pathFromTarget }) !== pathKey) {
            return undefined;
          }
          const rawValue = contentValues.values[field.id];
          // `pathCardinality: "many"` is what distinguishes a path-induced array from a genuine EC array property.
          return field.pathCardinality === "many" ? (Array.isArray(rawValue) ? rawValue[index] : undefined) : rawValue;
        },
      }));
    },
  };
}
