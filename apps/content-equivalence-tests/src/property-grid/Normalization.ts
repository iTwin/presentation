/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";
import {
  collectDifferences,
  createCanonicalEnumeration,
  isPointValue,
  roundFloatingPointNoise,
} from "../NormalizationCommon.js";
import { stableStringify } from "../Persistence.js";

import type { InstanceKey } from "@itwin/presentation-shared";
import type { CanonicalEnumerationInfo, CanonicalValue, ComparisonResult, Difference } from "../NormalizationCommon.js";
import type {
  CapturedPropertyCategory,
  CapturedPropertyData,
  CapturedPropertyRecord,
  PropertyGridCapture,
} from "./Capture.js";

/**
 * Names of the categories each implementation puts fields without a category into: legacy's "Selected Item(s)" and
 * the test app's "Miscellaneous". Their labels differ, and legacy localizes its label, so both are labeled
 * `ROOT_CATEGORY_LABEL`.
 */
const ROOT_CATEGORY_NAMES = new Set(["/selected-item/", "/default-category/"]);
const ROOT_CATEGORY_LABEL = "$root";

/** How a record is presented, without its value. Struct members and categories are keyed by label. */
export interface CanonicalPropertyRecordType {
  typename: string;
  kindOfQuantityName?: string;
  enum?: CanonicalEnumerationInfo;
  isMerged?: boolean;
  itemsTypeName?: string;
  members?: Record<string, CanonicalPropertyRecordType>;
}

export interface CanonicalPropertyCategory {
  records: Record<string, CanonicalPropertyRecordType>;
  childCategories: Record<string, CanonicalPropertyCategory>;
}

/**
 * Property grid data of a single instance. Records are identified by their category and display labels, because
 * record and category names are implementation-specific identifiers.
 */
export interface CanonicalPropertyGridItem {
  primaryKey: InstanceKey;
  categories: Record<string, CanonicalPropertyCategory>;
  /** Record values, keyed by category label path and record label, joined with ` / `. */
  values: Record<string, CanonicalValue>;
}

/**
 * Creates a key for each entry that's unique among `entries`, based on the entry's label. Labels aren't unique, so
 * later duplicates are keyed by a `[label, occurrence]` tuple. Labels that look like such a tuple are always keyed by
 * one, so they can't collide with keys of duplicates.
 */
function keyByLabel<TEntry>(entries: TEntry[], getLabel: (entry: TEntry) => string): Array<[string, TEntry]> {
  const counts = new Map<string, number>();
  return entries.map((entry) => {
    const label = getLabel(entry);
    const count = (counts.get(label) ?? 0) + 1;
    counts.set(label, count);
    return [count > 1 || label.startsWith("[") ? JSON.stringify([label, count]) : label, entry];
  });
}

function createCanonicalRecordType(record: CapturedPropertyRecord): CanonicalPropertyRecordType {
  const { property, value } = record;
  return {
    typename: property.typename,
    ...(property.kindOfQuantityName !== undefined
      ? { kindOfQuantityName: normalizeFullClassName(property.kindOfQuantityName) }
      : undefined),
    ...(property.enum
      ? { enum: createCanonicalEnumeration(property.enum.isStrict ?? false, property.enum.choices) }
      : undefined),
    ...(record.isMerged ? { isMerged: true } : undefined),
    ...(value.valueFormat === "array" ? { itemsTypeName: value.itemsTypeName } : undefined),
    ...(value.valueFormat === "struct"
      ? {
          members: Object.fromEntries(
            keyByLabel(Object.values(value.members), (member) => member.property.displayLabel).map(([key, member]) => [
              key,
              createCanonicalRecordType(member),
            ]),
          ),
        }
      : undefined),
  };
}

function isInstanceKey(value: unknown): value is InstanceKey {
  return (
    typeof value === "object" &&
    value !== null &&
    "className" in value &&
    typeof value.className === "string" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

function createCanonicalPrimitiveValue(record: CapturedPropertyRecord & { value: { valueFormat: "primitive" } }) {
  const { value, displayValue } = record.value;
  if (record.property.typename === "navigation") {
    // Navigation values are shown by their labels, which only display values carry.
    return isInstanceKey(value)
      ? { key: { className: normalizeFullClassName(value.className), id: value.id }, label: displayValue ?? "" }
      : undefined;
  }
  // Only navigation display values are compared: the test app leaves formatting of other values to the property grid.
  if (value === undefined || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : roundFloatingPointNoise(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && value !== null && isPointValue(value)) {
    return roundFloatingPointNoise(value);
  }
  throw new Error(`Unexpected '${record.property.typename}' value: ${stableStringify(value)}.`);
}

function createCanonicalRecordValue(record: CapturedPropertyRecord): CanonicalValue {
  const { value } = record;
  switch (value.valueFormat) {
    case "primitive":
      return createCanonicalPrimitiveValue({ ...record, value });
    case "struct":
      return Object.fromEntries(
        keyByLabel(Object.values(value.members), (member) => member.property.displayLabel).map(([key, member]) => [
          key,
          createCanonicalRecordValue(member),
        ]),
      );
    case "array": {
      const items = value.items.map(createCanonicalRecordValue);
      // Arrays of structs hold related instances, whose order isn't defined.
      return value.itemsTypeName === "struct"
        ? items.sort((lhs, rhs) => stableStringify(lhs).localeCompare(stableStringify(rhs)))
        : items;
    }
  }
}

function createCanonicalPropertyGridItem(
  primaryKey: InstanceKey,
  data: CapturedPropertyData,
): CanonicalPropertyGridItem {
  const values: Record<string, CanonicalValue> = {};
  const createCategories = (
    categories: CapturedPropertyCategory[],
    parentPath: string[],
  ): Record<string, CanonicalPropertyCategory> =>
    Object.fromEntries(
      keyByLabel(categories, (category) =>
        parentPath.length === 0 && ROOT_CATEGORY_NAMES.has(category.name) ? ROOT_CATEGORY_LABEL : category.label,
      ).map(([categoryKey, category]) => {
        const path = [...parentPath, categoryKey];
        const records = keyByLabel(data.records[category.name] ?? [], (record) => record.property.displayLabel);
        for (const [recordKey, record] of records) {
          values[[...path, recordKey].join(" / ")] = createCanonicalRecordValue(record);
        }
        return [
          categoryKey,
          {
            records: Object.fromEntries(
              records.map(([recordKey, record]) => [recordKey, createCanonicalRecordType(record)]),
            ),
            childCategories: createCategories(category.childCategories, path),
          },
        ];
      }),
    );
  // Data labels and descriptions aren't compared: the test app shows the class name in place of the instance label.
  return {
    primaryKey: { className: normalizeFullClassName(primaryKey.className), id: primaryKey.id },
    categories: createCategories(data.categories, []),
    values,
  };
}

export function createCanonicalPropertyGridCapture(capture: PropertyGridCapture): CanonicalPropertyGridItem[] {
  return capture.items.map((item) => createCanonicalPropertyGridItem(item.primaryKey, item.data));
}

function getIdentity(key: InstanceKey): string {
  return `${key.className}:${key.id}`;
}

/** Compares property grid structure (categories and record types) and record values of each instance. */
export function comparePropertyGridItems(
  legacy: CanonicalPropertyGridItem[],
  current: CanonicalPropertyGridItem[],
  expectedKeys: InstanceKey[],
): ComparisonResult {
  const descriptorDifferences: Difference[] = [];
  const valueDifferences: Difference[] = [];
  const legacyItems = new Map(legacy.map((item) => [getIdentity(item.primaryKey), item]));
  const currentItems = new Map(current.map((item) => [getIdentity(item.primaryKey), item]));
  const identities = new Set([...expectedKeys.map(getIdentity), ...legacyItems.keys(), ...currentItems.keys()]);
  for (const identity of [...identities].sort()) {
    const legacyItem = legacyItems.get(identity);
    const currentItem = currentItems.get(identity);
    if (!legacyItem || !currentItem) {
      valueDifferences.push({
        path: `items.${identity}`,
        legacy: legacyItem !== undefined,
        new: currentItem !== undefined,
      });
      continue;
    }
    descriptorDifferences.push(
      ...collectDifferences(legacyItem.categories, currentItem.categories, `categories.${identity}`),
    );
    valueDifferences.push(...collectDifferences(legacyItem.values, currentItem.values, `values.${identity}`));
  }
  return { descriptorDifferences, valueDifferences };
}
