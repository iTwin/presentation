/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { stableStringify } from "./Persistence.js";

import type { InstanceKey } from "@itwin/presentation-shared";
import type { Scenario } from "./Persistence.js";

export type JsonObject = Record<string, unknown>;

export type CanonicalFieldType =
  | { kind: "primitive"; name: string }
  | { kind: "navigation"; name: "navigation" }
  | { kind: "array"; name: "array"; member: CanonicalFieldType }
  | { kind: "struct"; name: "struct"; members: Array<{ name: string; type: CanonicalFieldType }> };

export interface CanonicalField {
  key: string;
  category: string[];
  label: string;
  type: CanonicalFieldType;
  propertyNames: string[];
  propertyClassNames: string[];
  kind: string;
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
