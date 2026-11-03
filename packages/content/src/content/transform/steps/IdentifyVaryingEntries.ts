/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import deepEqual from "fast-deep-equal/es6/index.js";
import { InstanceKey } from "@itwin/presentation-shared";
import { isFieldApplicable } from "./Utils.js";

import type { ContentTransformStep, RelatedInstanceValues } from "../TransformContent.js";

/**
 * Creates a content transform step that sets `varies` on entries whose values differ between content items the
 * entry applies to (see `isFieldApplicable`). Items the entry doesn't apply to are ignored.
 *
 * Values are compared deeply. For a `RelatedInstancesEntry`, related instances of every item are compared as a whole
 * by their field values, ignoring instance keys. As the order of related instances is unspecified, they're sorted by
 * instance key before comparing, so that the same related instances in different order don't vary.
 */
export function identifyVaryingEntries(): ContentTransformStep {
  return (records, { items }) => ({
    ...records,
    entries: records.entries.map((entry) => {
      const fields = entry.kind === "field" ? [entry.field] : entry.fields;
      const values: unknown[] = items.flatMap((item, index) => {
        if (!fields.some((field) => isFieldApplicable(field, item))) {
          return [];
        }
        return [entry.kind === "field" ? entry.values[index] : getSortedInstanceValues(entry.values[index])];
      });
      return values.some((value) => !deepEqual(value, values[0])) ? { ...entry, varies: true } : entry;
    }),
  });
}

function getSortedInstanceValues(instances: RelatedInstanceValues[]) {
  return [...instances].sort((lhs, rhs) => InstanceKey.compare(lhs.key, rhs.key)).map((instance) => instance.values);
}
