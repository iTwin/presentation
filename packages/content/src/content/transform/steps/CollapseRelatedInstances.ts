/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getOrCreate } from "../../InternalUtils.js";
import { serializeRelationshipPath } from "../../model/Utils.js";

import type { DeepReadonly, Value } from "@itwin/presentation-shared";
import type { ReadonlyPropertyField } from "../../model/Field.js";
import type { ContentEntry, ContentTransformStep, FieldEntry, RelatedInstancesEntry } from "../TransformContent.js";

/**
 * Creates a content transform step that reshapes values of fields reached over many-cardinality relationship
 * paths (`pathCardinality: "many"`), which are loaded as arrays with one value per related instance:
 *
 * - When every item reaches at most one related instance over the path, values are unwrapped: an empty array
 *   becomes `undefined` and a single-element array becomes its element.
 * - Otherwise, fields of the path within the same category are grouped into a single `RelatedInstancesEntry`,
 *   positioned where the first of them was, holding related instances of every item.
 *
 * Related instances of an item are looked up by the field's `pathFromTarget`.
 *
 * Should run before `identifyVaryingEntries`.
 */
export function collapseRelatedInstances(): ContentTransformStep {
  return (records, { items }) => {
    const instancesByPath = new Map<string, RelatedInstancesPerItem>();
    const groups = new Map<
      string,
      { index: number; instances: RelatedInstancesPerItem; entries: RelatedFieldEntry[] }
    >();
    const entries: Array<ContentEntry | undefined> = [];
    for (const entry of records.entries) {
      if (!isManyEntry(entry)) {
        entries.push(entry);
        continue;
      }
      const pathKey = serializeRelationshipPath({ path: entry.field.pathFromTarget });
      const instances = getOrCreate({
        map: instancesByPath,
        key: pathKey,
        createFunc: () => items.map((item) => item.getRelatedInstances({ pathFromTarget: entry.field.pathFromTarget })),
      });
      if (instances.every((itemInstances) => itemInstances.length <= 1)) {
        entries.push({ ...entry, values: entry.values.map((value) => getElement(value, 0)) });
        continue;
      }
      const group = getOrCreate({
        map: groups,
        key: JSON.stringify([pathKey, entry.field.categoryId]),
        createFunc: () => {
          entries.push(undefined);
          return { index: entries.length - 1, instances, entries: [] };
        },
      });
      group.entries.push(entry);
    }
    for (const group of groups.values()) {
      entries[group.index] = createRelatedInstancesEntry(group);
    }
    return { ...records, entries: entries as ContentEntry[] };
  };
}

type RelatedInstancesPerItem = RelatedInstancesEntry["values"];
type RelatedFieldEntry = FieldEntry & { field: ReadonlyPropertyField };

function isManyEntry(entry: ContentEntry): entry is RelatedFieldEntry {
  return entry.kind === "field" && entry.field.kind === "property" && entry.field.pathCardinality === "many";
}

function createRelatedInstancesEntry({
  entries,
  instances,
}: {
  entries: RelatedFieldEntry[];
  instances: RelatedInstancesPerItem;
}): RelatedInstancesEntry {
  return { kind: "related-instances", fields: entries.map(({ field }) => field), values: instances };
}

function getElement(value: DeepReadonly<Value>, index: number): DeepReadonly<Value> {
  return Array.isArray(value) ? (value as ReadonlyArray<DeepReadonly<Value>>)[index] : undefined;
}
