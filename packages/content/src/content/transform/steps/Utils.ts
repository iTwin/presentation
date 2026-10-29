/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentItem } from "../../model/ContentItem.js";
import type { ReadonlyField } from "../../model/Field.js";
import type { ContentEntry } from "../ContentTransformer.js";

/**
 * Checks whether the field applies to the item, based on whether the item's primary class is in the field's
 * `primaryClassNames`. External fields apply to all items.
 */
export function isFieldApplicable(field: ReadonlyField, item: ContentItem): boolean {
  return field.kind === "external" || field.primaryClassNames.includes(item.primaryKey.className);
}

/**
 * Filters fields of the given entries. Fields of a `RelatedInstancesEntry` are filtered individually, and the entry
 * is dropped when none of its fields remain.
 */
export function filterFields(
  entries: ReadonlyArray<ContentEntry>,
  predicate: (field: ReadonlyField) => boolean,
): ContentEntry[] {
  return entries.flatMap((entry): ContentEntry[] => {
    if (entry.kind === "field") {
      return predicate(entry.field) ? [entry] : [];
    }
    const fields = entry.fields.filter(predicate);
    if (fields.length === 0) {
      return [];
    }
    if (fields.length === entry.fields.length) {
      return [entry];
    }
    return [
      {
        ...entry,
        fields,
        values: entry.values.map((itemInstances) =>
          itemInstances.map((instance) => ({
            ...instance,
            values: Object.fromEntries(fields.map((field) => [field.id, instance.values[field.id]])),
          })),
        ),
      },
    ];
  });
}
