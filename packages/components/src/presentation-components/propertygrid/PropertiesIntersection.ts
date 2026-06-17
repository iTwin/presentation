/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import { Id64String } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaView } from "@itwin/ecschema-metadata";
import {
  DescriptorOverrides,
  Field,
  FieldDescriptor,
  Key,
  KeySet,
  NestedContentField,
  PropertiesField,
} from "@itwin/presentation-common";
import { getClassId, hasBaseClass } from "../instance-filter-builder/SchemaViewUtils.js";

type DescriptorFieldsSelector = NonNullable<DescriptorOverrides["fieldsSelector"]>;

/**
 * Returns the set of distinct class full names (colon-separated, e.g. `"Schema:ClassName"`) present in `keys.instanceKeys`.
 * @internal
 */
export function getDistinctClassNames(keys: KeySet): string[] {
  const set = new Set<string>();
  keys.forEach((key) => Key.isInstanceKey(key) && set.add(key.className));
  return [...set];
}

/**
 * Checks whether every resolved key class is equal to or derived from at least one of the given target classes.
 * A key class that could not be resolved in the schema never matches.
 */
function matchesAllKeyClasses(keyClasses: Array<SchemaView.Class>, targetClassIds: Id64String[]): boolean {
  return keyClasses.every((keyClass) =>
    targetClassIds.some((targetId) => getClassId(keyClass) === targetId || hasBaseClass(keyClass, targetId)),
  );
}

/**
 * Checks whether a `PropertiesField` matches all distinct key classes.
 * A field matches if, for each key class K, at least one of the field's properties
 * has a class that is equal to or a base of K (K is-a property's class).
 */
function propertiesFieldMatchesAllClasses(field: PropertiesField, keyClasses: Array<SchemaView.Class>): boolean {
  return matchesAllKeyClasses(
    keyClasses,
    field.properties.map(({ property }) => property.classInfo.id),
  );
}

/**
 * Checks whether a `NestedContentField` matches all distinct key classes via `actualPrimaryClassIds`.
 * A field matches if, for each key class K, at least one id in `actualPrimaryClassIds` is
 * equal to or a base of K (K is-a that primary class).
 */
function nestedContentFieldMatchesAllClasses(field: NestedContentField, keyClasses: Array<SchemaView.Class>): boolean {
  return matchesAllKeyClasses(keyClasses, field.actualPrimaryClassIds);
}

/**
 * Collects `FieldDescriptor`s for the nested fields of an already-matched `NestedContentField`.
 * Once the parent matches, its direct leaf fields automatically match (they hold properties of the
 * related instances and aren't filtered against the primary key classes). Child nested content
 * fields, however, are re-checked against the key classes using their own `actualPrimaryClassIds`.
 *
 * Including a leaf field's descriptor in an "include" fields selector implicitly includes its parent
 * nested content field(s).
 */
function collectMatchedNestedFieldDescriptors(
  nestedFields: Field[],
  keyClasses: Array<SchemaView.Class>,
): FieldDescriptor[] {
  const descriptors: FieldDescriptor[] = [];
  for (const field of nestedFields) {
    if (field.isNestedContentField()) {
      if (nestedContentFieldMatchesAllClasses(field, keyClasses)) {
        descriptors.push(...collectMatchedNestedFieldDescriptors(field.nestedFields, keyClasses));
      }
    } else {
      // Leaf field of a matched nested content field: automatically matches.
      descriptors.push(field.getFieldDescriptor());
    }
  }
  return descriptors;
}

/**
 * Collects `FieldDescriptor`s for fields that are common to all distinct key classes.
 * - Simple fields: always included.
 * - PropertiesFields: included if they match all key classes.
 * - NestedContentFields: when the relationship applies to all key classes (i.e. `actualPrimaryClassIds`
 *   covers every key class), the whole nested block is common, so its nested fields are included (with
 *   child nested content fields re-checked by their own `actualPrimaryClassIds`).
 */
function collectMatchedFieldDescriptors(fields: Field[], keyClasses: Array<SchemaView.Class>): FieldDescriptor[] {
  const descriptors: FieldDescriptor[] = [];
  for (const field of fields) {
    if (field.isNestedContentField()) {
      if (nestedContentFieldMatchesAllClasses(field, keyClasses)) {
        descriptors.push(...collectMatchedNestedFieldDescriptors(field.nestedFields, keyClasses));
      }
    } else if (field.isPropertiesField()) {
      if (propertiesFieldMatchesAllClasses(field, keyClasses)) {
        descriptors.push(field.getFieldDescriptor());
      }
    } else {
      // Simple field: always matches
      descriptors.push(field.getFieldDescriptor());
    }
  }
  return descriptors;
}

/**
 * Builds a `DescriptorFieldsSelector` that includes only fields present for all distinct key
 * classes (intersection). Returns `undefined` when there are ≤1 distinct class (no filtering needed).
 * @internal
 */
export async function buildIntersectionFieldsSelector(
  imodel: IModelConnection,
  keys: KeySet,
  fields: Field[],
): Promise<DescriptorFieldsSelector | undefined> {
  const keyClassNames = getDistinctClassNames(keys);
  if (keyClassNames.length <= 1) {
    return undefined;
  }

  const schemaView = await imodel.getSchemaView();
  const keyClasses = keyClassNames.map((name) => {
    const classView = schemaView.findClass(name);
    if (!classView) {
      throw new Error(`Failed to resolve key class "${name}" in schema view`);
    }
    return classView;
  });

  const descriptors = collectMatchedFieldDescriptors(fields, keyClasses);
  return { type: "include", fields: descriptors };
}
