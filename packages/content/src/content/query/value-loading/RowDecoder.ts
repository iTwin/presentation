/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";

import type { ECSqlQueryRow, InstanceKey, Value } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../model/ContentDescriptor.js";
import type { ContentValues } from "../../model/ContentItem.js";
import type { SelectProjection } from "../SelectBuilder.js";

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
 * Decodes the selector values carried by one result row into a `selectorId -> value` map.
 *
 * Property selectors sharing a table alias read from the same `$` blob column; the blob is parsed once
 * per column and each selector reads its `propertyName` from it. Calculated selectors are read directly
 * from their scalar column and are never JSON-parsed. Absent columns (a source/class/group that does not
 * supply a value) leave the selector out of the map, so its field decodes to `undefined`.
 *
 * @internal
 */
export function decodeSelectorValues(props: {
  row: ECSqlQueryRow;
  descriptor: ContentDescriptor;
  columnNames: SelectProjection["columnNames"];
}): Map<string, Value> {
  const { row, descriptor, columnNames } = props;
  const values = new Map<string, Value>();

  const parsedBlobs = new Map<string, Record<string, Value> | undefined>();
  const parseBlob = (column: string): Record<string, Value> | undefined => {
    if (parsedBlobs.has(column)) {
      return parsedBlobs.get(column);
    }
    const raw: unknown = row[column];
    let parsed: Record<string, Value> | undefined;
    if (raw === undefined || raw === null) {
      parsed = undefined;
    } else {
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
      values.set(selectorId, value);
    }
  }

  for (const [selectorId, column] of Object.entries(columnNames.calculatedValues)) {
    const value = row[column];
    if (value !== undefined && value !== null) {
      values.set(selectorId, value);
    }
  }

  return values;
}

/**
 * Merges `source` selector values into `target` in place. Each selector must be owned by a single query
 * group, so a selector already present in `target` is a stitching-ownership bug and throws.
 *
 * @internal
 */
export function mergeSelectorValues(target: Map<string, Value>, source: Map<string, Value>): void {
  for (const [selectorId, value] of source) {
    if (target.has(selectorId)) {
      throw new Error(`Selector "${selectorId}" was populated by more than one query group.`);
    }
    target.set(selectorId, value);
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
  selectorValues: Map<string, Value>;
}): ContentValues {
  const { descriptor, primaryKey, selectorValues } = props;
  const values: Record<string, Value> = {};
  for (const field of Object.values(descriptor.fields)) {
    if (field.kind !== "calculated" && field.kind !== "property") {
      continue;
    }
    const value = selectorValues.get(field.selectorId);
    if (value !== undefined) {
      values[field.id] = value;
    }
  }
  // TODO: Related instance keys are not yet projected by this stage - no path has related instances to report.
  return { primaryKey, values, relatedInstances: {} };
}
