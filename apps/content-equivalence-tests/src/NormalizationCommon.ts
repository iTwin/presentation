/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { stableStringify } from "./Persistence.js";

import type { InstanceKey, RelationshipPath } from "@itwin/presentation-shared";
import type { Scenario } from "./Persistence.js";

export type JsonObject = Record<string, unknown>;

/**
 * Metadata about the enumeration backing a primitive value. Deliberately omits the enumeration's own
 * name, since legacy's `EnumerationInfo` doesn't expose it - only what both implementations can supply
 * (the strictness flag and declared enumerators) is comparable.
 */
export interface CanonicalEnumerationInfo {
  isStrict: boolean;
  enumerators: Array<{ label: string; value: string | number }>;
}

export type CanonicalFieldType =
  | { kind: "primitive"; name: string; extendedType?: string; enumeration?: CanonicalEnumerationInfo }
  | { kind: "navigation" }
  | { kind: "array"; member: CanonicalFieldType }
  | { kind: "struct"; members: Array<{ name: string; type: CanonicalFieldType }> };

/** Sorts enumerators by value so both implementations produce the same order regardless of declaration order. */
export function createCanonicalEnumeration(
  isStrict: boolean,
  enumerators: ReadonlyArray<{ label: string; value: string | number }>,
): CanonicalEnumerationInfo {
  return {
    isStrict,
    enumerators: enumerators
      .map(({ label, value }) => ({ label, value }))
      .sort((lhs, rhs) => (lhs.value < rhs.value ? -1 : lhs.value > rhs.value ? 1 : 0)),
  };
}

/**
 * A single relationship hop from the content target class to a related class. Deliberately omits
 * `sourceClassName` and `instanceFilter` from `RelationshipPathStep`, and makes `targetClassName`
 * optional, populated only for the path's last step:
 * - `sourceClassName` - legacy reports the concrete runtime class of the source instance where
 *   new-generation reports the query's declared target class, so the two aren't comparable.
 * - `targetClassName` (non-last steps) - legacy reports the relationship's schema-declared (often
 *   abstract/base) constraint class uniformly for every intermediate step, while new-generation
 *   enumerates the concrete classes that actually have instances in scope for the step, intentionally
 *   splitting what legacy treats as a single field into several concrete-class-specific fields.
 *   Omitting it from the canonical identity lets those concrete-class variants collapse back into
 *   one comparable field, matching legacy's shape.
 * - `targetClassName` (last step) - both implementations report the concrete class of the actual
 *   related instance the property is read from (it's determined by the queried data itself, not by
 *   path-node specialization), so it's kept as part of the field's identity.
 * - `instanceFilter` - legacy captures no equivalent.
 */
export type CanonicalRelationshipStep = Omit<
  RelationshipPath[number],
  "sourceClassName" | "targetClassName" | "instanceFilter"
> & { targetClassName?: RelationshipPath[number]["targetClassName"] };

export interface CanonicalField {
  key: string;
  category: string[];
  label: string;
  type: CanonicalFieldType;
  propertyNames: string[];
  propertyClassNames: string[];
  kind: string;
  /** The relationship path from the content target to this field's related class, empty for direct fields. */
  path: CanonicalRelationshipStep[];
  sourcePaths: string[][];
}

export interface CanonicalDescriptor {
  fields: CanonicalField[];
  unsupportedFields: Array<{ sourcePath: string[]; reason: string }>;
}

export interface CanonicalItem {
  primaryKeys: InstanceKey[];
  values: Record<string, unknown>;
}

export interface CanonicalCapture {
  descriptor: CanonicalDescriptor;
  items?: CanonicalItem[];
}

interface Difference {
  path: string;
  legacy: unknown;
  new: unknown;
}

export interface ComparisonResult {
  descriptorDifferences: Difference[];
  valueDifferences: Difference[];
}

const SIGNIFICANT_DIGITS_FOR_FLOATING_POINT_COMPARISON = 12;

/**
 * Rounds a `Double` value to a fixed number of significant digits, discarding the last few bits of a double's
 * ~15-17 significant decimal digits. The legacy and new-generation pipelines can produce values that differ only
 * in those last bits (e.g. due to differing floating-point computation or serialization paths for the same
 * underlying value).
 */
function roundFloatingPointNoise(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(SIGNIFICANT_DIGITS_FOR_FLOATING_POINT_COMPARISON)) : value;
}

/**
 * Recursively rounds away floating-point noise (see `roundFloatingPointNoise`) in values of `Double`, `Point2d`,
 * and `Point3d` typed canonical fields, guided by the field's `CanonicalFieldType` so that unrelated numeric
 * values (e.g. `Integer`/`Long` property values, which must compare exactly) are left untouched.
 */
export function normalizeFloatingPointValue(value: unknown, type: CanonicalFieldType): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  switch (type.kind) {
    case "primitive":
      if (type.name === "Double") {
        return typeof value === "number" ? roundFloatingPointNoise(value) : value;
      }
      if (type.name === "Point2d" || type.name === "Point3d") {
        return typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value as JsonObject).map(([key, coordinate]) => [
                key,
                typeof coordinate === "number" ? roundFloatingPointNoise(coordinate) : coordinate,
              ]),
            )
          : value;
      }
      return value;
    case "array":
      return Array.isArray(value) ? value.map((entry) => normalizeFloatingPointValue(entry, type.member)) : value;
    case "struct":
      return typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value as JsonObject).map(([key, memberValue]) => {
              const memberType = type.members.find((member) => member.name === key)?.type;
              return [key, memberType ? normalizeFloatingPointValue(memberValue, memberType) : memberValue];
            }),
          )
        : value;
    case "navigation":
      return value;
  }
}

export function asObject(value: unknown, description: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be an object.`);
  }
  return value as JsonObject;
}

export function asArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${description} must be an array.`);
  }
  return value;
}

function collectDifferences(legacy: unknown, current: unknown, path: string): Difference[] {
  if (stableStringify(legacy) === stableStringify(current)) {
    return [];
  }
  if (
    legacy &&
    current &&
    typeof legacy === "object" &&
    typeof current === "object" &&
    !Array.isArray(legacy) &&
    !Array.isArray(current)
  ) {
    const keys = new Set([...Object.keys(legacy), ...Object.keys(current)]);
    return [...keys]
      .sort()
      .flatMap((key) =>
        collectDifferences((legacy as JsonObject)[key], (current as JsonObject)[key], `${path}.${key}`),
      );
  }
  return [{ path, legacy, new: current }];
}

function itemsByPrimaryKey(items: CanonicalItem[] | undefined): Record<string, CanonicalItem[]> | undefined {
  if (!items) {
    return undefined;
  }
  const result: Record<string, CanonicalItem[]> = {};
  for (const item of items) {
    const identity = item.primaryKeys
      .map((key) => `${key.className}:${key.id}`)
      .sort()
      .join("|");
    (result[identity] ??= []).push(item);
  }
  return result;
}

function getPrimaryKeys(items: CanonicalItem[] | undefined): string[] {
  return (items ?? []).flatMap((item) => item.primaryKeys.map((key) => `${key.className}:${key.id}`)).sort();
}

export function compareCaptures(
  legacy: CanonicalCapture,
  current: CanonicalCapture,
  scenario: Scenario,
): ComparisonResult {
  const comparableDescriptor = (descriptor: CanonicalDescriptor) => ({
    fields: descriptor.fields.map(({ sourcePaths: _sourcePaths, ...field }) => field),
    unsupportedFields: descriptor.unsupportedFields.map(({ sourcePath: _sourcePath, ...field }) => field),
  });
  const descriptorDifferences = collectDifferences(
    comparableDescriptor(legacy.descriptor),
    comparableDescriptor(current.descriptor),
    "descriptor",
  );
  const valueDifferences = collectDifferences(
    itemsByPrimaryKey(legacy.items),
    itemsByPrimaryKey(current.items),
    "items",
  );
  if (legacy.descriptor.unsupportedFields.length > 0 || current.descriptor.unsupportedFields.length > 0) {
    descriptorDifferences.push({
      path: "descriptor.unsupportedFields",
      legacy: legacy.descriptor.unsupportedFields,
      new: current.descriptor.unsupportedFields,
    });
  }
  if (scenario.id === "sampled-elements") {
    const expected = scenario.keys.map((key) => `${key.className}:${key.id}`).sort();
    const legacyKeys = getPrimaryKeys(legacy.items);
    const newKeys = getPrimaryKeys(current.items);
    if (stableStringify(legacyKeys) !== stableStringify(expected)) {
      valueDifferences.push({ path: "items.legacyPrimaryKeys", legacy: legacyKeys, new: expected });
    }
    if (stableStringify(newKeys) !== stableStringify(expected)) {
      valueDifferences.push({ path: "items.newPrimaryKeys", legacy: expected, new: newKeys });
    }
  }
  return { descriptorDifferences, valueDifferences };
}
