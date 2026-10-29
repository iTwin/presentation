/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getOrCreate } from "../../InternalUtils.js";
import { serializeRelationshipPath } from "../../model/Utils.js";

import type { DeepReadonly, RelationshipPath, Value } from "@itwin/presentation-shared";
import type { ContentItem } from "../../model/ContentItem.js";
import type { ReadonlyPropertyField } from "../../model/Field.js";
import type {
  ContentEntry,
  ContentTransformStep,
  FieldEntry,
  RelatedInstancesEntry,
  RelatedInstanceValues,
} from "../ContentTransformer.js";

/**
 * Creates a content transform step that reshapes values of fields reached over many-cardinality relationship
 * paths (`pathCardinality: "many"`), which are loaded as arrays with one value per related instance:
 *
 * - When every item reaches at most one related instance over the path, values are unwrapped: an empty array
 *   becomes `undefined` and a single-element array becomes its element.
 * - Otherwise, fields of the path within the same category are grouped into a single `RelatedInstancesEntry`,
 *   positioned where the first of them was, with values grouped by related instance.
 *
 * Related instances of an item are looked up by the field's `pathFromTarget`. A field that stands for several
 * original fields (see `keepCommonFields`) may reach related instances of different items over different paths -
 * `getFieldPaths` returns all of them. Each item's related instances are taken from the first path that reaches any.
 *
 * Should run before `mergeFields`.
 */
export function collapseRelatedInstances(props?: {
  getFieldPaths?: (field: ReadonlyPropertyField) => ReadonlyArray<DeepReadonly<RelationshipPath>>;
}): ContentTransformStep {
  const getFieldPaths = props?.getFieldPaths ?? ((field) => [field.pathFromTarget]);
  return (records) => {
    const pathsByKey = new Map<string, Map<string, DeepReadonly<RelationshipPath>>>();
    for (const entry of records.entries) {
      if (isManyEntry(entry)) {
        const paths = getOrCreate({
          map: pathsByKey,
          key: serializeRelationshipPath({ path: entry.field.pathFromTarget }),
          createFunc: () => new Map(),
        });
        getFieldPaths(entry.field).forEach((path) => paths.set(serializeRelationshipPath({ path }), path));
      }
    }
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
        createFunc: () => {
          const paths = [...pathsByKey.get(pathKey)!.values()];
          return records.items.map(
            (item) =>
              paths
                .map((path) => item.getRelatedInstances({ pathFromTarget: path }))
                .find((itemInstances) => itemInstances.length > 0) ?? [],
          );
        },
      });
      if (instances.every((itemInstances) => itemInstances.length <= 1)) {
        entries.push({ ...entry, values: entry.values.map((value) => getElement(value, 0)) });
        continue;
      }
      const group = getOrCreate({
        map: groups,
        key: JSON.stringify([pathKey, entry.categoryId]),
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

type RelatedInstancesPerItem = Array<ReturnType<ContentItem["getRelatedInstances"]>>;
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
  const first = entries[0];
  return {
    kind: "related-instances",
    pathFromTarget: first.field.pathFromTarget,
    fields: entries.map(({ field }) => field),
    ...(first.categoryId !== undefined ? { categoryId: first.categoryId } : {}),
    values: instances.map((itemInstances, itemIndex) =>
      itemInstances.map((instance, instanceIndex): RelatedInstanceValues => ({
        key: instance.key,
        ...(instance.relationshipKey ? { relationshipKey: instance.relationshipKey } : {}),
        values: Object.fromEntries(
          entries.map(({ field, values }) => [field.id, getElement(values[itemIndex], instanceIndex)]),
        ),
      })),
    ),
  };
}

function getElement(value: DeepReadonly<Value>, index: number): DeepReadonly<Value> {
  return Array.isArray(value) ? (value as ReadonlyArray<DeepReadonly<Value>>)[index] : undefined;
}
