/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";
import {
  collectDifferences,
  createCanonicalEnumeration,
  isPointValue,
  isUnsupportedLegacyTypeName,
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
  /** Distinct types of array items, so that types of items' members are compared too. */
  items?: CanonicalPropertyRecordType[];
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
  /** Record values, keyed by JSON arrays of the category keys path and the record key. */
  values: Record<string, CanonicalValue>;
}

/**
 * Creates a key for each entry that's unique among `entries`, based on the entry's label. Labels aren't unique, so
 * duplicates after the first one are keyed by a `[label, occurrence]` tuple. Labels that look like such a tuple are
 * always keyed by one, so they can't collide with keys of duplicates.
 *
 * Implementations list entries with equal labels in different orders, so duplicates are numbered in the order of
 * their normalized content. Equal entries then get equal keys on both sides, regardless of their order.
 */
function keyByLabel<TEntry>(entries: Array<{ label: string; entry: TEntry }>): Array<[string, TEntry]> {
  const groups = Map.groupBy(entries, ({ label }) => label);
  return [...groups].flatMap(([label, group]) => {
    const ordered =
      group.length > 1
        ? group
            .map(({ entry }) => ({ entry, content: stableStringify(entry) }))
            .sort((lhs, rhs) => lhs.content.localeCompare(rhs.content))
        : group;
    return ordered.map(({ entry }, index): [string, TEntry] => [
      index > 0 || label.startsWith("[") ? JSON.stringify([label, index + 1]) : label,
      entry,
    ]);
  });
}

/** Normalized type and value of a record. They're created together, so that both key struct members the same way. */
interface CanonicalRecord {
  type: CanonicalPropertyRecordType;
  value: CanonicalValue;
}

function getDistinctTypes(types: CanonicalPropertyRecordType[]): CanonicalPropertyRecordType[] {
  const distinct = new Map(types.map((type) => [stableStringify(type), type]));
  return [...distinct].sort(([lhs], [rhs]) => lhs.localeCompare(rhs)).map(([, type]) => type);
}

function createCanonicalRecord(record: CapturedPropertyRecord): CanonicalRecord {
  const { property, value } = record;
  const type: CanonicalPropertyRecordType = {
    typename: property.typename,
    ...(property.kindOfQuantityName !== undefined
      ? { kindOfQuantityName: normalizeFullClassName(property.kindOfQuantityName) }
      : undefined),
    ...(property.enum
      ? { enum: createCanonicalEnumeration(property.enum.isStrict ?? false, property.enum.choices) }
      : undefined),
    ...(record.isMerged ? { isMerged: true } : undefined),
  };
  switch (value.valueFormat) {
    case "primitive":
      return { type, value: createCanonicalPrimitiveValue({ ...record, value }) };
    case "struct": {
      const members = keyByLabel(
        Object.values(value.members)
          .filter((member) => !isUnsupportedLegacyTypeName(member.property.typename))
          .map((member) => ({ label: member.property.displayLabel, entry: createCanonicalRecord(member) })),
      );
      return {
        type: { ...type, members: Object.fromEntries(members.map(([key, member]) => [key, member.type])) },
        value: Object.fromEntries(members.map(([key, member]) => [key, member.value])),
      };
    }
    case "array": {
      const items = value.items.map(createCanonicalRecord);
      return {
        // Distinct item types are included, so that types of items' members are compared too.
        type: { ...type, itemsTypeName: value.itemsTypeName, items: getDistinctTypes(items.map((item) => item.type)) },
        // Only the items matter, not their order: related instances aren't ordered, and differences in the order of
        // array property items aren't what these tests look for.
        value: items
          .map((item) => item.value)
          .sort((lhs, rhs) => stableStringify(lhs).localeCompare(stableStringify(rhs))),
      };
    }
  }
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

/**
 * A normalized category, with values of its records and descendant categories' records, keyed by relative path.
 * Values are sorted by path, so that equal categories have equal content regardless of the order of their records.
 */
interface CanonicalCategoryContent {
  category: CanonicalPropertyCategory;
  values: Array<[path: string[], value: CanonicalValue]>;
}

function createCanonicalCategories(
  categories: CapturedPropertyCategory[],
  data: CapturedPropertyData,
  isRoot: boolean,
): Array<[string, CanonicalCategoryContent]> {
  return keyByLabel(
    categories.map((category) => ({
      label: isRoot && ROOT_CATEGORY_NAMES.has(category.name) ? ROOT_CATEGORY_LABEL : category.label,
      entry: createCanonicalCategory(category, data),
    })),
  );
}

function createCanonicalCategory(category: CapturedPropertyCategory, data: CapturedPropertyData) {
  const records = keyByLabel(
    (data.records[category.name] ?? []).map((record) => ({
      label: record.property.displayLabel,
      entry: createCanonicalRecord(record),
    })),
  );
  const childCategories = createCanonicalCategories(category.childCategories, data, false);
  return {
    category: {
      records: Object.fromEntries(records.map(([key, record]) => [key, record.type])),
      childCategories: Object.fromEntries(childCategories.map(([key, child]) => [key, child.category])),
    },
    values: [
      ...records.map(([key, record]): [string[], CanonicalValue] => [[key], record.value]),
      ...childCategories.flatMap(([key, child]) =>
        child.values.map(([path, value]): [string[], CanonicalValue] => [[key, ...path], value]),
      ),
    ].sort(([lhs], [rhs]) => JSON.stringify(lhs).localeCompare(JSON.stringify(rhs))),
  } satisfies CanonicalCategoryContent;
}

function createCanonicalPropertyGridItem(
  primaryKey: InstanceKey,
  data: CapturedPropertyData,
): CanonicalPropertyGridItem {
  const categories = createCanonicalCategories(data.categories, data, true);
  // Data labels and descriptions aren't compared: the test app shows the class name in place of the instance label.
  return {
    primaryKey: { className: normalizeFullClassName(primaryKey.className), id: primaryKey.id },
    categories: Object.fromEntries(categories.map(([key, category]) => [key, category.category])),
    // Paths are JSON-encoded, because labels may contain any separator.
    values: Object.fromEntries(
      categories.flatMap(([key, category]) =>
        category.values.map(([path, value]) => [JSON.stringify([key, ...path]), value]),
      ),
    ),
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
