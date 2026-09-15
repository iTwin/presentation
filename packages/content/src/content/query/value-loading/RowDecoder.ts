/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";

import type { EC, ECSqlQueryRow, InstanceKey, Value, ValueDescriptor } from "@itwin/presentation-shared";
import type { CardinalityHint } from "../../ContentTarget.js";
import type { ContentDefinition } from "../../definition-building/BuildContentDefinition.js";
import type { ValueSelector } from "../../definition-building/ValueSelector.js";
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

export type RowDecoder = (row: ECSqlQueryRow) => {
  selectorValues: Map<string, Value>;
  relatedInstances: Map<string, RelatedInstanceEntry>;
};

export type PropertyValueReader = (className: string, value: Value | null) => Value;

export function createRowDecoder(props: {
  columnNames: SelectProjection["columnNames"];
  selectors: Record<ValueSelector["id"], ValueSelector>;
  propertyReaders: ContentDefinition["propertyReaders"];
}): RowDecoder {
  const { columnNames, selectors, propertyReaders } = props;
  const propertyReads = Object.entries(columnNames.propertyBlobs).map(([selectorId, column]) => {
    assert(Object.hasOwn(selectors, selectorId), `Missing selector "${selectorId}".`);
    const selector = selectors[selectorId];
    assert(selector.kind === "property", `Selector "${selectorId}" is not a property selector.`);
    assert(Object.hasOwn(propertyReaders, selectorId), `Missing property reader for selector "${selectorId}".`);
    return { selectorId, column, propertyName: selector.propertyName, read: propertyReaders[selectorId] };
  });

  return (row) => decodeRow({ row, columnNames, propertyReads });
}

/**
 * Decodes one result row into its selector values and the related-instance identities carried by its
 * related `$` blobs.
 */
function decodeRow(props: {
  row: ECSqlQueryRow;
  columnNames: SelectProjection["columnNames"];
  propertyReads: Array<{ selectorId: string; column: string; propertyName: string; read: PropertyValueReader }>;
}): { selectorValues: Map<string, Value>; relatedInstances: Map<string, RelatedInstanceEntry> } {
  const { row, columnNames, propertyReads } = props;

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
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error(`Failed to parse instance JSON for column "${column}".`);
      }
      assert(isPropertyObject(value), `Expected an instance JSON object for column "${column}".`);
      parsed = value;
    }
    parsedBlobs.set(column, parsed);
    return parsed;
  };

  const selectorValues = new Map<string, Value>();
  for (const { selectorId, column, propertyName, read } of propertyReads) {
    const blob = parseBlob(column);
    if (!blob) {
      continue;
    }
    const classColumn =
      column in columnNames.relatedBlobs
        ? columnNames.relatedBlobs[column].className
        : columnNames.primaryKey.className;
    const className: unknown = row[classColumn];
    assert(typeof className === "string", `Expected string class name in column "${classColumn}".`);
    const value = read(className, blob[propertyName]);
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

function isPropertyObject(value: unknown): value is Record<string, Value> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type PropertyValueDecoder = (value: Value | null) => Value;

export function createPropertyValueDecoder(type: ValueDescriptor): PropertyValueDecoder {
  const decode = createNonNullPropertyValueDecoder(type);
  return (value) => (value === undefined || value === null ? undefined : decode(value));
}

function createNonNullPropertyValueDecoder(type: ValueDescriptor): (value: NonNullable<Value>) => Value {
  switch (type.kind) {
    case "navigation":
      return (value) => {
        assert(
          isPropertyObject(value) && typeof value.Id === "string",
          "Expected a navigation property object with a string Id.",
        );
        return value.Id;
      };
    case "array": {
      const decodeElement = createPropertyValueDecoder(type.elementType);
      return (value) => {
        assert(Array.isArray(value), "Expected an array property value.");
        return value.map(decodeElement);
      };
    }
    case "struct": {
      const members = type.members.map((member) => ({
        name: member.name,
        decode: createPropertyValueDecoder(member.type),
      }));
      return (value) => {
        assert(isPropertyObject(value), "Expected a struct property object.");
        return Object.fromEntries(
          members
            .filter((member) => value[member.name] !== undefined)
            .map((member) => [member.name, member.decode(value[member.name])]),
        );
      };
    }
    case "primitive":
      if (type.type === "Point2d" || type.type === "Point3d") {
        return (value) => {
          assert(
            isPropertyObject(value) && typeof value.X === "number" && typeof value.Y === "number",
            "Expected a point property object with numeric X and Y coordinates.",
          );
          if (type.type === "Point3d") {
            assert(typeof value.Z === "number", "Expected a point property object with a numeric Z coordinate.");
            return { x: value.X, y: value.Y, z: value.Z };
          }
          return { x: value.X, y: value.Y };
        };
      }
      return (value) => value;
  }
}

/**
 * Decodes one query group's rows into `instance key -> values` (keyed by {@link toInstanceKeyString}),
 * giving every value the shape the group's cardinality dictates: `"one"` (the anchor, a 1:1 partition)
 * gets scalar values and single-entry related-instance arrays; `"many"` (an isolated 1:many path) gets
 * index-aligned arrays, one element per row.
 */
export function decodeGroupRows(props: {
  rows: ECSqlQueryRow[];
  rowDecoder: RowDecoder;
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
  const { rows, rowDecoder, cardinality, columnNames, keys } = props;
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
      const { selectorValues, relatedInstances } = rowDecoder(row);
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
    const { selectorValues, relatedInstances } = rowDecoder(row);
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
 * Projects decoded selector values onto descriptor fields through private field bindings, producing
 * the `ContentValues` for one instance. External fields have no binding and are left `undefined`.
 */
export function toContentValues(props: {
  descriptor: ContentDescriptor;
  fieldSelectorIds: Partial<Record<string, string>>;
  primaryKey: InstanceKey;
  values: GroupValues;
}): ContentValues {
  const { descriptor, fieldSelectorIds, primaryKey, values: groupValues } = props;
  const values: Record<string, Value> = {};
  for (const field of Object.values(descriptor.fields)) {
    const selectorId = fieldSelectorIds[field.id];
    if (selectorId === undefined) {
      continue;
    }
    const value = groupValues.selectorValues.get(selectorId);
    if (value !== undefined) {
      values[field.id] = value;
    }
  }

  return { primaryKey, values, relatedInstances: Object.fromEntries(groupValues.relatedInstances) };
}
