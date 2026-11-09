/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import deepEqual from "fast-deep-equal/es6/index.js";
import { InstanceKey } from "@itwin/presentation-shared";
import { getOrCreate } from "../InternalUtils.js";
import { serializeRelationshipPath } from "../model/Utils.js";

import type { DeepReadonly, Value } from "@itwin/presentation-shared";
import type { ReadonlyContentDescriptor } from "../model/ContentDescriptor.js";
import type { ContentItem } from "../model/ContentItem.js";
import type { ReadonlyField, ReadonlyPropertyField } from "../model/Field.js";
import type { ContentEntries } from "./TransformContent.js";

/** Transforms content for a property grid. See `PropertyGridTransformConfig` for what's done. */
export function transformForPropertyGrid({
  descriptor,
  items,
  fields,
}: {
  descriptor: ReadonlyContentDescriptor;
  items: ContentItem[];
  fields: "common" | "all";
}): ContentEntries {
  const visibleFields = removeHiddenFields(createFieldValues({ descriptor, items }));
  const keptFields = fields === "common" ? keepCommonFields(visibleFields, items) : visibleFields;
  return { entries: identifyVaryingEntries(collapseRelatedInstances(keptFields, items), items) };
}

type ContentEntry = ContentEntries["entries"][number];

/** A field and its values of every content item, before it's known whether the values vary. */
export type FieldValues = Omit<Extract<ContentEntry, { kind: "field" }>, "varies">;

/** Related instances of every content item, before it's known whether they vary. */
export type RelatedInstancesValues = Omit<Extract<ContentEntry, { kind: "related-instances" }>, "varies">;

/**
 * Checks whether the field applies to the item, based on whether the item's primary class is in the field's
 * `primaryClassNames`. External fields apply to all items.
 */
function isFieldApplicable(field: ReadonlyField, item: ContentItem): boolean {
  return field.kind === "external" || field.primaryClassNames.includes(item.primaryKey.className);
}

/** Pairs every descriptor field, in descriptor order, with its raw values of every content item. */
export function createFieldValues({
  descriptor,
  items,
}: {
  descriptor: ReadonlyContentDescriptor;
  items: ContentItem[];
}): FieldValues[] {
  return Object.values(descriptor.fields).map((field) => ({
    kind: "field",
    field,
    values: items.map((item) => item.getValue(field)),
  }));
}

/** Drops fields marked as `hidden`. */
export function removeHiddenFields(fields: FieldValues[]): FieldValues[] {
  return fields.filter(({ field }) => !field.hidden);
}

/** Keeps only fields applicable to every content item (see `isFieldApplicable`). */
export function keepCommonFields(fields: FieldValues[], items: ContentItem[]): FieldValues[] {
  return fields.filter(({ field }) => items.every((item) => isFieldApplicable(field, item)));
}

type RelatedFieldValues = FieldValues & { field: ReadonlyPropertyField };
type RelatedInstancesPerItem = RelatedInstancesValues["values"];

/**
 * Reshapes values of fields reached over many-cardinality relationship paths (`pathCardinality: "many"`), which are
 * loaded as arrays with one value per related instance:
 *
 * - When every item reaches at most one related instance over the path, values are unwrapped: an empty array
 *   becomes `undefined` and a single-element array becomes its element.
 * - Otherwise, fields of the path within the same category are grouped into a single `RelatedInstancesValues`,
 *   positioned where the first of them was, holding related instances of every item.
 *
 * Related instances of an item are looked up by the field's `pathFromTarget`.
 */
export function collapseRelatedInstances(
  fields: FieldValues[],
  items: ContentItem[],
): Array<FieldValues | RelatedInstancesValues> {
  const instancesByPath = new Map<string, RelatedInstancesPerItem>();
  const groups = new Map<string, RelatedInstancesValues>();
  const result: Array<FieldValues | RelatedInstancesValues> = [];
  for (const fieldValues of fields) {
    if (!isManyFieldValues(fieldValues)) {
      result.push(fieldValues);
      continue;
    }
    const { pathFromTarget, categoryId } = fieldValues.field;
    const pathKey = serializeRelationshipPath({ path: pathFromTarget });
    const instances = getOrCreate({
      map: instancesByPath,
      key: pathKey,
      createFunc: () => items.map((item) => item.getRelatedInstances({ pathFromTarget })),
    });
    if (instances.every((itemInstances) => itemInstances.length <= 1)) {
      result.push({ ...fieldValues, values: fieldValues.values.map((value) => getElement(value, 0)) });
      continue;
    }
    const group = getOrCreate({
      map: groups,
      key: JSON.stringify([pathKey, categoryId]),
      createFunc: (): RelatedInstancesValues => {
        // The group takes the place of its first field; fields found later are added to it.
        const newGroup: RelatedInstancesValues = { kind: "related-instances", fields: [], values: instances };
        result.push(newGroup);
        return newGroup;
      },
    });
    group.fields.push(fieldValues.field);
  }
  return result;
}

function isManyFieldValues(fieldValues: FieldValues): fieldValues is RelatedFieldValues {
  return fieldValues.field.kind === "property" && fieldValues.field.pathCardinality === "many";
}

function getElement(value: DeepReadonly<Value>, index: number): DeepReadonly<Value> {
  return Array.isArray(value) ? (value as ReadonlyArray<DeepReadonly<Value>>)[index] : undefined;
}

/**
 * Turns field values and related instances into content entries, setting `varies` on whether their values differ
 * between content items the entry applies to (see `isFieldApplicable`). Items the entry doesn't apply to are ignored.
 *
 * Values are compared deeply. Related instances of every item are compared as a whole by their field values, ignoring
 * instance keys. As the order of related instances is unspecified, they're sorted by instance key before comparing,
 * so that the same related instances in different order don't vary.
 */
export function identifyVaryingEntries(
  entries: Array<FieldValues | RelatedInstancesValues>,
  items: ContentItem[],
): ContentEntries["entries"] {
  return entries.map((entry) => {
    const fields = entry.kind === "field" ? [entry.field] : entry.fields;
    const values: unknown[] = items.flatMap((item, index) => {
      if (!fields.some((field) => isFieldApplicable(field, item))) {
        return [];
      }
      return [
        entry.kind === "field" ? entry.values[index] : getSortedInstanceValues(entry.values[index], entry.fields),
      ];
    });
    return { ...entry, varies: values.some((value) => !deepEqual(value, values[0])) };
  });
}

function getSortedInstanceValues(instances: RelatedInstancesValues["values"][number], fields: ReadonlyPropertyField[]) {
  return [...instances]
    .sort((lhs, rhs) => InstanceKey.compare(lhs.key, rhs.key))
    .map((instance) => fields.map((field) => instance.getValue(field)));
}
