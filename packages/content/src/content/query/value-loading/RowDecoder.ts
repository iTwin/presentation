/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";

import type { EC, ECSqlQueryRow, InstanceKey, Value } from "@itwin/presentation-shared";
import type { CardinalityHint } from "../../ContentTarget.js";
import type { ContentDescriptor } from "../../model/ContentDescriptor.js";
import type { ContentValues, RelatedInstanceEntry } from "../../model/ContentItem.js";
import type { SelectProjection } from "../SelectBuilder.js";

/**
 * One primary instance's stitched SQL-backed values: `selectorId -> value` and
 * `join-path key -> related instances`. A `"one"`-cardinality group contributes scalar values and 0/1-entry
 * arrays; a `"many"`-cardinality group contributes index-aligned arrays (see {@link decodeGroupRows}).
 */
export interface GroupValues {
  selectorValues: Map<string, Value>;
  relatedInstances: Map<string, RelatedInstanceEntry[]>;
}

/**
 * Reads the primary instance key from a result row using the projection's class and instance column
 * aliases. The class column is projected via `ec_classname(..., 's.c')`, so it already holds the
 * dot-notation full class name expected by {@link InstanceKey}.
 */
export function decodePrimaryKey(props: {
  row: ECSqlQueryRow;
  columnNames: SelectProjection["columnNames"];
}): InstanceKey {
  const { row, columnNames } = props;
  return { className: row[columnNames.primaryKey.className], id: row[columnNames.primaryKey.id] };
}

/**
 * Serializes an instance key into a string that's unique across classes, unlike `ECInstanceId` alone —
 * e.g. a `bis.Model` and the `bis.Element` it models share an `ECInstanceId`, so keying by id alone would
 * merge their values.
 */
export function toInstanceKeyString(key: InstanceKey): string {
  return `${key.className}:${key.id}`;
}

/**
 * Decodes one result row into its selector values and the related-instance identities carried by its
 * related `$` blobs.
 */
export function decodeRow(props: {
  row: ECSqlQueryRow;
  descriptor: ContentDescriptor;
  columnNames: SelectProjection["columnNames"];
}): { selectorValues: Map<string, Value>; relatedInstances: Map<string, RelatedInstanceEntry> } {
  const { row, descriptor, columnNames } = props;

  // Property selectors sharing a table alias read from the same `$` blob column, so each blob is parsed
  // once here and reused both for those selectors' values and for the related-instance identity below. A
  // `null` blob (outer-join miss, or a class/group that doesn't supply the value) leaves its selectors
  // out of the map and contributes no identity.
  const parsedBlobs = new Map<string, Record<string, Value> | undefined>();
  const parseBlob = (column: string): Record<string, Value> | undefined => {
    if (parsedBlobs.has(column)) {
      return parsedBlobs.get(column);
    }
    const raw: unknown = row[column];
    let parsed: Record<string, Value> | undefined;
    if (raw !== undefined && raw !== null) {
      assert(typeof raw === "string", `Expected JSON blob for column "${column}", got ${typeof raw}.`);
      try {
        parsed = JSON.parse(raw) as Record<string, Value>;
      } catch {
        throw new Error(`Failed to parse instance JSON for column "${column}".`);
      }
    }
    parsedBlobs.set(column, parsed);
    return parsed;
  };

  const selectorValues = new Map<string, Value>();
  for (const [selectorId, column] of Object.entries(columnNames.propertyBlobs)) {
    const blob = parseBlob(column);
    if (!blob) {
      continue;
    }
    const selector = descriptor.selectors[selectorId];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!selector) {
      continue;
    }
    assert(selector.kind === "property", `Selector "${selectorId}" is not a property selector.`);
    const value = blob[selector.propertyName];
    if (value !== undefined) {
      selectorValues.set(selectorId, value);
    }
  }
  // Calculated selectors read directly from their scalar column, no blob involved.
  for (const [selectorId, column] of Object.entries(columnNames.calculatedValues)) {
    const value = row[column];
    if (value !== undefined && value !== null) {
      selectorValues.set(selectorId, value);
    }
  }

  const relatedInstances = new Map<string, RelatedInstanceEntry>();
  const relationshipKeys = new Map<string, InstanceKey>();
  for (const [column, { className: classNameColumn, pathKey, role }] of Object.entries(columnNames.relatedBlobs)) {
    const blob = parseBlob(column);
    if (!blob) {
      continue;
    }
    const id = blob.ECInstanceId;
    assert(typeof id === "string", `Expected string "ECInstanceId" in blob column "${column}".`);
    const className: unknown = row[classNameColumn];
    assert(typeof className === "string", `Expected string class name in column "${classNameColumn}".`);
    const key: InstanceKey = { className: className as EC.FullClassNameDotNotation, id };
    if (role === "target") {
      relatedInstances.set(pathKey, { key });
    } else {
      relationshipKeys.set(pathKey, key);
    }
  }
  // `buildSelectProjection` always projects a path's target blob alongside its relationship blob, so
  // every `relationshipKey` here finds a matching entry already in `relatedInstances`.
  for (const [pathKey, relationshipKey] of relationshipKeys) {
    const entry = relatedInstances.get(pathKey);
    if (entry) {
      entry.relationshipKey = relationshipKey;
    }
  }

  return { selectorValues, relatedInstances };
}

/**
 * Decodes one query group's rows into `instance key -> values` (keyed by {@link toInstanceKeyString}),
 * giving every value the shape the group's cardinality dictates: `"one"` (the anchor, a 1:1 partition)
 * gets scalar values and single-entry related-instance arrays; `"many"` (an isolated 1:many path) gets
 * index-aligned arrays, one element per row.
 */
export function decodeGroupRows(props: {
  rows: ECSqlQueryRow[];
  descriptor: ContentDescriptor;
  cardinality: CardinalityHint;
  columnNames: SelectProjection["columnNames"];
  /**
   * The complete set of primaries this group describes; rows for any other instance key are ignored.
   * An additional group's value query is restricted only by an `ECInstanceId` IN-list and its own
   * source's target — not by class, nor by the anchor's query filterers/value filters — so it can return
   * rows for a primary belonging to another source (overlapping targets) or another plan entirely (two
   * classes sharing an `ECInstanceId`). Omit to accept every row.
   */
  keys?: readonly InstanceKey[];
}): Map<string, GroupValues> {
  const { rows, descriptor, cardinality, columnNames, keys } = props;
  const byKey = new Map<string, GroupValues>();
  const keyOf = (row: ECSqlQueryRow) => toInstanceKeyString(decodePrimaryKey({ row, columnNames }));
  const allowedKeys = keys && new Set(keys.map(toInstanceKeyString));
  const ownRows = allowedKeys ? rows.filter((row) => allowedKeys.has(keyOf(row))) : rows;

  if (cardinality === "one") {
    // One row per primary — a second row means a `"one"` cardinality hint was wrong for this path.
    for (const row of ownRows) {
      const key = keyOf(row);
      if (byKey.has(key)) {
        const conflictingPathKeys = [...new Set(Object.values(columnNames.relatedBlobs).map((blob) => blob.pathKey))];
        throw new Error(
          `Instance "${key}" has more than one row in a "one"-cardinality group (path keys: ${conflictingPathKeys.join(", ")}). ` +
            `A "one" cardinality hint was given for a path that reaches more than one instance.`,
        );
      }
      const { selectorValues, relatedInstances } = decodeRow({ row, descriptor, columnNames });
      byKey.set(key, {
        selectorValues,
        relatedInstances: new Map(Array.from(relatedInstances, ([pathKey, entry]) => [pathKey, [entry]])),
      });
    }
    return byKey;
  }

  const selectorIds = [...Object.keys(columnNames.propertyBlobs), ...Object.keys(columnNames.calculatedValues)];
  const pathKeys = [...new Set(Object.values(columnNames.relatedBlobs).map((blob) => blob.pathKey))];
  // Every key in `keys` starts from empty arrays, so a primary that reached no related instance ends
  // with `[]` rather than an absent map entry.
  const emptyValues = (): GroupValues => ({
    selectorValues: new Map(selectorIds.map((selectorId) => [selectorId, [] as Value[]])),
    relatedInstances: new Map(pathKeys.map((pathKey) => [pathKey, [] as RelatedInstanceEntry[]])),
  });
  for (const key of keys ?? []) {
    byKey.set(toInstanceKeyString(key), emptyValues());
  }
  for (const row of ownRows) {
    const key = keyOf(row);
    let target = byKey.get(key);
    if (!target) {
      target = emptyValues();
      byKey.set(key, target);
    }
    const { selectorValues, relatedInstances } = decodeRow({ row, descriptor, columnNames });
    for (const selectorId of selectorIds) {
      (target.selectorValues.get(selectorId) as Value[]).push(selectorValues.get(selectorId));
    }
    for (const pathKey of pathKeys) {
      const entry = relatedInstances.get(pathKey);
      // The group inner-joins its path, so the target identity is present on every row; a miss would
      // silently break the `values[i] <-> relatedInstances[i]` alignment.
      assert(entry !== undefined, `Row for related path "${pathKey}" is missing its target identity.`);
      target.relatedInstances.get(pathKey)!.push(entry);
    }
  }
  return byKey;
}

/**
 * Merges `source` into `target` in place. Every selector and every join-path key is owned by exactly one
 * query group, so one already present in `target` is a stitching-ownership bug and throws.
 */
export function mergeGroupValues(target: GroupValues, source: GroupValues): void {
  for (const [selectorId, value] of source.selectorValues) {
    if (target.selectorValues.has(selectorId)) {
      throw new Error(`Selector "${selectorId}" was populated by more than one query group.`);
    }
    target.selectorValues.set(selectorId, value);
  }
  for (const [pathKey, entries] of source.relatedInstances) {
    if (target.relatedInstances.has(pathKey)) {
      throw new Error(`Related instances for path "${pathKey}" were populated by more than one query group.`);
    }
    target.relatedInstances.set(pathKey, entries);
  }
}

/**
 * Projects decoded selector values onto descriptor fields through each field's `selectorId`, producing
 * the `ContentValues` for one instance. External fields carry no selector and are left `undefined`.
 */
export function toContentValues(props: {
  descriptor: ContentDescriptor;
  primaryKey: InstanceKey;
  values: GroupValues;
}): ContentValues {
  const { descriptor, primaryKey, values: groupValues } = props;
  const values: Record<string, Value> = {};
  for (const field of Object.values(descriptor.fields)) {
    if (field.kind !== "calculated" && field.kind !== "property") {
      continue;
    }
    const value = groupValues.selectorValues.get(field.selectorId);
    if (value !== undefined) {
      values[field.id] = value;
    }
  }

  return { primaryKey, values, relatedInstances: Object.fromEntries(groupValues.relatedInstances) };
}
