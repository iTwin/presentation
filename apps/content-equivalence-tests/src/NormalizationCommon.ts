/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { stableStringify } from "./Persistence.js";

import type { EC, ECSchemaProvider, InstanceKey } from "@itwin/presentation-shared";

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

export interface RelationshipConstraintClasses {
  sourceClassName: EC.FullClassNameDotNotation;
  targetClassName: EC.FullClassNameDotNotation;
}

/** Schema constraint classes of a relationship, keyed by normalized relationship class name. */
export type RelationshipConstraints = Record<EC.FullClassNameDotNotation, RelationshipConstraintClasses>;

function getConstraintClassName(constraint: EC.RelationshipConstraint): EC.FullClassNameDotNotation {
  const constraintClass = constraint.abstractConstraint ?? constraint.constraintClasses[0];
  return constraintClass.fullName;
}

export async function getRelationshipConstraints(
  schemaProvider: ECSchemaProvider,
  relationshipNames: Iterable<EC.FullClassNameDotNotation>,
): Promise<RelationshipConstraints> {
  const names = [...relationshipNames].sort();
  const entries = await Promise.all(
    names.map(async (name) => {
      const relationship = await getClass(schemaProvider, name);
      if (!relationship.isRelationshipClass()) {
        throw new Error(`Expected '${name}' to be a relationship class.`);
      }
      return [
        name,
        {
          sourceClassName: getConstraintClassName(relationship.source),
          targetClassName: getConstraintClassName(relationship.target),
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * A single relationship hop from the content target class to a related class, expressed through the
 * relationship selected by the path's declaration (rather than the concrete relationship subclass found
 * in the data) and that relationship's schema constraint classes at each end. Only the last step's
 * target stays concrete: it's the class the field's properties are read from. `instanceFilter` is
 * omitted, since legacy captures no equivalent.
 */
export interface CanonicalRelationshipStep {
  sourceClassName: EC.FullClassNameDotNotation;
  relationshipName: EC.FullClassNameDotNotation;
  relationshipReverse: boolean;
  targetClassName: EC.FullClassNameDotNotation;
}

/** Builds canonical steps, falling back to the relationship's constraint classes for step classes that aren't set. */
export function createCanonicalRelationshipPath(props: {
  steps: Array<
    Pick<CanonicalRelationshipStep, "relationshipName" | "relationshipReverse"> &
      Partial<Pick<CanonicalRelationshipStep, "sourceClassName" | "targetClassName">>
  >;
  constraints: RelationshipConstraints;
}): CanonicalRelationshipStep[] {
  const { steps, constraints } = props;
  return steps.map((step) => {
    const { relationshipName, relationshipReverse } = step;
    const relationship = constraints[relationshipName] as RelationshipConstraintClasses | undefined;
    if (!relationship) {
      throw new Error(`Missing captured constraints for relationship '${relationshipName}'.`);
    }
    const [sourceClassName, targetClassName] = relationshipReverse
      ? [relationship.targetClassName, relationship.sourceClassName]
      : [relationship.sourceClassName, relationship.targetClassName];
    return {
      sourceClassName: step.sourceClassName ?? sourceClassName,
      relationshipName,
      relationshipReverse,
      targetClassName: step.targetClassName ?? targetClassName,
    };
  });
}

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
  descriptor: CanonicalDescriptor;
  primaryKeys: InstanceKey[];
  values: Record<string, unknown>;
}

export type CanonicalCapture =
  | { descriptor: CanonicalDescriptor; items?: never }
  | { descriptor?: never; items: CanonicalItem[] };

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
export function normalizeValueForComparison(value: unknown, type: CanonicalFieldType): unknown {
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
      return Array.isArray(value) ? value.map((entry) => normalizeValueForComparison(entry, type.member)) : value;
    case "struct":
      return typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value as JsonObject).map(([key, memberValue]) => {
              const memberType = type.members.find((member) => member.name === key)?.type;
              return [key, memberType ? normalizeValueForComparison(memberValue, memberType) : memberValue];
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

function getItemIdentity(item: CanonicalItem): string {
  return item.primaryKeys
    .map((key) => `${key.className}:${key.id}`)
    .sort()
    .join("|");
}

function indexItems(items: CanonicalItem[]): Map<string, CanonicalItem[]> {
  const result = new Map<string, CanonicalItem[]>();
  for (const item of items) {
    const identity = getItemIdentity(item);
    const matchingItems = result.get(identity);
    if (matchingItems) {
      matchingItems.push(item);
    } else {
      result.set(identity, [item]);
    }
  }
  return result;
}

function getPrimaryKeys(items: CanonicalItem[]): string[] {
  return items.flatMap((item) => item.primaryKeys.map((key) => `${key.className}:${key.id}`)).sort();
}

function comparableDescriptor(descriptor: CanonicalDescriptor) {
  return {
    fields: descriptor.fields.map(({ sourcePaths: _sourcePaths, ...field }) => field),
    unsupportedFields: descriptor.unsupportedFields.map(({ sourcePath: _sourcePath, ...field }) => field),
  };
}

function collectDescriptorDifferences(
  legacy: CanonicalDescriptor | undefined,
  current: CanonicalDescriptor | undefined,
  path: string,
): Difference[] {
  const differences = collectDifferences(
    legacy ? comparableDescriptor(legacy) : undefined,
    current ? comparableDescriptor(current) : undefined,
    path,
  );
  const legacyUnsupportedFields = legacy?.unsupportedFields ?? [];
  const currentUnsupportedFields = current?.unsupportedFields ?? [];
  if (legacyUnsupportedFields.length > 0 || currentUnsupportedFields.length > 0) {
    differences.push({
      path: `${path}.unsupportedFields`,
      legacy: legacyUnsupportedFields,
      new: currentUnsupportedFields,
    });
  }
  return differences;
}

export function compareDescriptors(legacy: CanonicalDescriptor, current: CanonicalDescriptor): ComparisonResult {
  return { descriptorDifferences: collectDescriptorDifferences(legacy, current, "descriptor"), valueDifferences: [] };
}

function comparableItem(item: CanonicalItem | undefined) {
  if (!item) {
    return undefined;
  }
  const { descriptor: _descriptor, ...result } = item;
  return result;
}

export function compareContentItems(
  legacy: CanonicalItem[],
  current: CanonicalItem[],
  expectedKeys: InstanceKey[],
): ComparisonResult {
  const descriptorDifferences: Difference[] = [];
  const valueDifferences: Difference[] = [];
  const legacyItems = indexItems(legacy);
  const currentItems = indexItems(current);
  const identities = new Set([...legacyItems.keys(), ...currentItems.keys()]);
  for (const identity of [...identities].sort()) {
    const matchingLegacyItems = legacyItems.get(identity) ?? [];
    const matchingCurrentItems = currentItems.get(identity) ?? [];
    const matchingItemCount = Math.max(matchingLegacyItems.length, matchingCurrentItems.length);
    for (let index = 0; index < matchingItemCount; ++index) {
      const legacyItem = matchingLegacyItems.at(index);
      const currentItem = matchingCurrentItems.at(index);
      const identityPath = `${identity}${matchingItemCount > 1 ? `[${index}]` : ""}`;
      descriptorDifferences.push(
        ...collectDescriptorDifferences(legacyItem?.descriptor, currentItem?.descriptor, `descriptor.${identityPath}`),
      );
      valueDifferences.push(
        ...collectDifferences(comparableItem(legacyItem), comparableItem(currentItem), `items.${identityPath}`),
      );
    }
  }
  const expected = expectedKeys.map((key) => `${key.className}:${key.id}`).sort();
  const legacyKeys = getPrimaryKeys(legacy);
  const currentKeys = getPrimaryKeys(current);
  if (stableStringify(legacyKeys) !== stableStringify(expected)) {
    valueDifferences.push({ path: "items.legacyPrimaryKeys", legacy: legacyKeys, new: expected });
  }
  if (stableStringify(currentKeys) !== stableStringify(expected)) {
    valueDifferences.push({ path: "items.newPrimaryKeys", legacy: expected, new: currentKeys });
  }
  return { descriptorDifferences, valueDifferences };
}
