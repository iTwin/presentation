/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";

import type { Id64String } from "@itwin/core-bentley";
import type { EC, ECSqlQueryRow, InstanceKey, Value } from "@itwin/presentation-shared";
import type { CardinalityHint } from "../../ContentTarget.js";
import type { ContentDescriptor } from "../../model/ContentDescriptor.js";
import type { ContentValues, RelatedInstanceEntry } from "../../model/ContentItem.js";
import type { SelectProjection } from "../SelectBuilder.js";

/**
 * One primary instance's stitched SQL-backed values: `selectorId -> value` and
 * `join-path key -> related instances`. A `"one"`-cardinality group contributes scalar values and 0/1-entry
 * arrays; a `"many"`-cardinality group contributes index-aligned arrays (see {@link decodeGroupRows}).
 *
 * @internal
 */
export interface GroupValues {
  selectorValues: Map<string, Value>;
  relatedInstances: Map<string, RelatedInstanceEntry[]>;
}

/**
 * Reads the primary instance key from a result row using the projection's class and instance column
 * aliases. The class column is projected via `ec_classname(..., 's.c')`, so it already holds the
 * dot-notation full class name expected by {@link InstanceKey}.
 *
 * @internal
 */
export function decodePrimaryKey(props: {
  row: ECSqlQueryRow;
  columnNames: SelectProjection["columnNames"];
}): InstanceKey {
  const { row, columnNames } = props;
  return { className: row[columnNames.primaryKey.className], id: row[columnNames.primaryKey.id] };
}

/**
 * Decodes one result row into its selector values and the related-instance identities carried by its
 * related `$` blobs.
 *
 * Property selectors sharing a table alias read from the same `$` blob column; each blob is parsed once and
 * serves both the selectors that read from it and the identity (`ECInstanceId` + the paired
 * `ec_classname(...)` column) of the instance it represents. Calculated selectors are read directly from
 * their scalar column. A `null` blob (an outer-join miss, or a class/group that does not supply the value)
 * leaves its selectors out of the map and contributes no identity. `buildSelectProjection` always projects a
 * path's target blob alongside its relationship blob, so a `relationshipKey` never appears without its `key`.
 *
 * @internal
 */
export function decodeRow(props: {
  row: ECSqlQueryRow;
  descriptor: ContentDescriptor;
  columnNames: SelectProjection["columnNames"];
}): { selectorValues: Map<string, Value>; relatedInstances: Map<string, RelatedInstanceEntry> } {
  const { row, descriptor, columnNames } = props;

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
  for (const [pathKey, relationshipKey] of relationshipKeys) {
    const entry = relatedInstances.get(pathKey);
    if (entry) {
      entry.relationshipKey = relationshipKey;
    }
  }

  return { selectorValues, relatedInstances };
}

/**
 * Decodes one query group's rows into `primary id -> values`, giving every value the shape the group's
 * cardinality dictates:
 *
 * - `"one"` (the anchor, a 1:1 partition): one row per primary — scalar selector values and a single-entry
 *   related-instance array per path key.
 * - `"many"` (an isolated 1:many path): zero or more rows per primary — every projected selector becomes an
 *   index-aligned array with one element per row (`undefined` where the row lacks the value) and every
 *   projected path key an equally long array of related instances. Each id in `ids` starts from empty arrays,
 *   so a primary that reached no related instance ends with `[]` rather than nothing.
 *
 * When `ids` is given, it is the complete set of primaries the group describes: rows for any other id are
 * ignored. A page's ids span every source, and an additional group's query is restricted only by its own
 * source's target — not by the anchor's query filterers and value filters — so an overlapping source's group
 * can return rows for a primary that belongs to another source.
 *
 * @internal
 */
export function decodeGroupRows(props: {
  rows: ECSqlQueryRow[];
  descriptor: ContentDescriptor;
  cardinality: CardinalityHint;
  columnNames: SelectProjection["columnNames"];
  /** The primaries this group describes — see above. Omit to accept every row. */
  ids?: Id64String[];
}): Map<Id64String, GroupValues> {
  const { rows, descriptor, cardinality, columnNames, ids } = props;
  const byId = new Map<Id64String, GroupValues>();
  const idOf = (row: ECSqlQueryRow) => row[columnNames.primaryKey.id] as Id64String;
  const allowedIds = ids && new Set(ids);
  const ownRows = allowedIds ? rows.filter((row) => allowedIds.has(idOf(row))) : rows;

  if (cardinality === "one") {
    for (const row of ownRows) {
      const id = idOf(row);
      if (byId.has(id)) {
        const conflictingPathKeys = [...new Set(Object.values(columnNames.relatedBlobs).map((blob) => blob.pathKey))];
        throw new Error(
          `Instance "${id}" has more than one row in a "one"-cardinality group (path keys: ${conflictingPathKeys.join(", ")}). ` +
            `A "one" cardinality hint was given for a path that reaches more than one instance.`,
        );
      }
      const { selectorValues, relatedInstances } = decodeRow({ row, descriptor, columnNames });
      byId.set(id, {
        selectorValues,
        relatedInstances: new Map(Array.from(relatedInstances, ([pathKey, entry]) => [pathKey, [entry]])),
      });
    }
    return byId;
  }

  const selectorIds = [...Object.keys(columnNames.propertyBlobs), ...Object.keys(columnNames.calculatedValues)];
  const pathKeys = [...new Set(Object.values(columnNames.relatedBlobs).map((blob) => blob.pathKey))];
  const emptyValues = (): GroupValues => ({
    selectorValues: new Map(selectorIds.map((selectorId) => [selectorId, [] as Value[]])),
    relatedInstances: new Map(pathKeys.map((pathKey) => [pathKey, [] as RelatedInstanceEntry[]])),
  });
  for (const id of ids ?? []) {
    byId.set(id, emptyValues());
  }
  for (const row of ownRows) {
    const id = idOf(row);
    let target = byId.get(id);
    if (!target) {
      target = emptyValues();
      byId.set(id, target);
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
  return byId;
}

/**
 * Merges `source` into `target` in place. Every selector and every join-path key is owned by exactly one
 * query group, so one already present in `target` is a stitching-ownership bug and throws.
 *
 * @internal
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
 *
 * @internal
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
