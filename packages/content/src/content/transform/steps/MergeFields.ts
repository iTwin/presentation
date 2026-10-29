/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import deepEqual from "fast-deep-equal/es6/index.js";
import { isFieldApplicable } from "./Utils.js";

import type { ContentTransformStep } from "../ContentTransformer.js";

/**
 * Creates a content transform step that sets `isMerged` on entries whose values differ between content items the
 * entry applies to (see `isFieldApplicable`). Items the entry doesn't apply to are ignored.
 *
 * Values are compared deeply. For a `RelatedInstancesEntry`, related instances of every item are compared as a whole
 * by their field values, ignoring instance keys.
 */
export function mergeFields(): ContentTransformStep {
  return (records) => ({
    ...records,
    entries: records.entries.map((entry) => {
      const fields = entry.kind === "field" ? [entry.field] : entry.fields;
      const values: unknown[] = records.items.flatMap((item, index) => {
        if (!fields.some((field) => isFieldApplicable(field, item))) {
          return [];
        }
        return [entry.kind === "field" ? entry.values[index] : entry.values[index].map((instance) => instance.values)];
      });
      return values.some((value) => !deepEqual(value, values[0])) ? { ...entry, isMerged: true } : entry;
    }),
  });
}
