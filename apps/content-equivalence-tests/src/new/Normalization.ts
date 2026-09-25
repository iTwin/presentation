/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  createDefaultValueFormatter,
  formatConcatenatedValue,
  normalizeFullClassName,
} from "@itwin/presentation-shared";
import { createCanonicalEnumeration, normalizeValueForComparison } from "../NormalizationCommon.js";
import { stableStringify } from "../Persistence.js";

import type { CategoryDefinition, ReadonlyContentDescriptor, ReadonlyPropertyField } from "@itwin/presentation-content";
import type { NavigationValue } from "@itwin/presentation-shared";
import type {
  CanonicalCapture,
  CanonicalDescriptor,
  CanonicalField,
  CanonicalFieldType,
  CanonicalItem,
  CanonicalRelationshipStep,
} from "../NormalizationCommon.js";
import type { CapturedNewItem, NewCapture } from "./Adapter.js";

const valueFormatter = createDefaultValueFormatter();

type NewFieldType = ReadonlyContentDescriptor["fields"][string]["type"];

interface NewFieldMapping {
  canonicalKey: CanonicalField["key"];
  sourceFields: ReadonlyPropertyField[];
  type: CanonicalFieldType;
}

function getCategoryPath(
  category: Readonly<CategoryDefinition>,
  categories: Readonly<Record<string, Readonly<CategoryDefinition>>>,
): string[] {
  return [...(category.parentId ? getCategoryPath(categories[category.parentId], categories) : []), category.label];
}

function createCanonicalPath(field: ReadonlyPropertyField): CanonicalRelationshipStep[] {
  return field.pathFromTarget.map((step, index, steps) => ({
    relationshipName: step.relationshipName,
    relationshipReverse: step.relationshipReverse ?? false,
    ...(index === steps.length - 1 ? { targetClassName: step.targetClassName } : undefined),
  }));
}

/**
 * `isStructMember` reduces primitives to the shape legacy reports for struct members, which lack the EC
 * property context to recover enumeration and extended type metadata: legacy substitutes the type name
 * with the `"enum"` sentinel or the extended type name instead.
 */
function createCanonicalType(type: NewFieldType, isStructMember = false): CanonicalFieldType {
  switch (type.kind) {
    case "primitive":
      if (isStructMember) {
        return { kind: "primitive", name: type.enumeration !== undefined ? "enum" : (type.extendedType ?? type.type) };
      }
      return {
        kind: "primitive",
        name: type.type,
        ...(type.extendedType !== undefined ? { extendedType: type.extendedType } : undefined),
        ...(type.enumeration !== undefined
          ? { enumeration: createCanonicalEnumeration(type.enumeration.isStrict, type.enumeration.enumerators) }
          : undefined),
      };
    case "navigation":
      return { kind: "navigation" };
    case "array":
      return { kind: "array", member: createCanonicalType(type.elementType, isStructMember) };
    case "struct":
      return {
        kind: "struct",
        members: type.members
          .map((member) => ({ name: member.name, type: createCanonicalType(member.type, true) }))
          .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name)),
      };
  }
}

function createCanonicalField(
  field: ReadonlyPropertyField,
  categories: ReadonlyContentDescriptor["categories"],
): CanonicalField {
  const canonicalField = {
    category: field.categoryId ? getCategoryPath(categories[field.categoryId], categories) : [],
    label: field.label,
    type: createCanonicalType(field.type),
    propertyNames: [field.propertyName],
    propertyClassNames: [normalizeFullClassName(field.propertyClassName)],
    kind: "property",
    path: createCanonicalPath(field),
    sourcePaths: [[field.id]],
  } satisfies Omit<CanonicalField, "key">;
  return {
    ...canonicalField,
    key: stableStringify({
      category: canonicalField.category,
      label: canonicalField.label,
      type: canonicalField.type,
      propertyNames: canonicalField.propertyNames,
      kind: canonicalField.kind,
      path: canonicalField.path,
    }),
  };
}

function createCanonicalDescriptor(descriptor: ReadonlyContentDescriptor): {
  descriptor: CanonicalDescriptor;
  fieldMappings: NewFieldMapping[];
} {
  const fieldsByKey = new Map<string, CanonicalDescriptor["fields"][number]>();
  const sourceFieldsByKey = new Map<string, ReadonlyPropertyField[]>();
  const unsupportedFields: CanonicalDescriptor["unsupportedFields"] = [];
  for (const [id, field] of Object.entries(descriptor.fields)) {
    if (field.hidden) {
      continue;
    }
    if (field.kind !== "property") {
      unsupportedFields.push({ sourcePath: [id], reason: `Unsupported new field kind '${String(field.kind)}'.` });
      continue;
    }
    const normalized = createCanonicalField(field, descriptor.categories);
    const existing = fieldsByKey.get(normalized.key);
    if (existing) {
      existing.propertyClassNames = [
        ...new Set([...existing.propertyClassNames, ...normalized.propertyClassNames]),
      ].sort();
      existing.sourcePaths.push(...normalized.sourcePaths);
      sourceFieldsByKey.get(normalized.key)!.push(field);
    } else {
      fieldsByKey.set(normalized.key, normalized);
      sourceFieldsByKey.set(normalized.key, [field]);
    }
  }
  const fields = [...fieldsByKey.values()].sort((lhs, rhs) => lhs.key.localeCompare(rhs.key));
  return {
    descriptor: { fields, unsupportedFields },
    fieldMappings: fields.map((field) => ({
      canonicalKey: field.key,
      sourceFields: sourceFieldsByKey.get(field.key)!,
      type: field.type,
    })),
  };
}

function isNavigationValue(value: unknown, type: CanonicalFieldType): value is NavigationValue {
  return (
    type.kind === "navigation" && typeof value === "object" && value !== null && "key" in value && "label" in value
  );
}

async function createCanonicalValue(
  item: CapturedNewItem,
  field: ReadonlyPropertyField,
  type: CanonicalFieldType,
): Promise<unknown> {
  if (field.pathFromTarget.length === 0) {
    let value = item.values[field.id];
    if (isNavigationValue(value, type)) {
      value = { key: value.key, label: await formatConcatenatedValue({ value: value.label, valueFormatter }) };
    }
    return normalizeValueForComparison(value, type);
  }
  const relatedGroup = item.related.find(
    (group) => stableStringify(group.path) === stableStringify(field.pathFromTarget),
  );
  return (relatedGroup?.entries ?? [])
    .map((entry) => ({
      primaryKeys: [{ className: normalizeFullClassName(entry.key.className), id: entry.key.id }],
      value: normalizeValueForComparison(entry.values[field.id], type),
    }))
    .sort((lhs, rhs) => stableStringify(lhs.primaryKeys).localeCompare(stableStringify(rhs.primaryKeys)));
}

async function createCanonicalItem(item: CapturedNewItem): Promise<CanonicalItem> {
  const { descriptor, fieldMappings } = createCanonicalDescriptor(item.descriptor);
  return {
    descriptor,
    primaryKeys: [{ className: normalizeFullClassName(item.primaryKey.className), id: item.primaryKey.id }],
    values: Object.fromEntries(
      await Promise.all(
        fieldMappings.map(async ({ canonicalKey, sourceFields, type }) => {
          const applicableFields = sourceFields.filter((field) =>
            field.primaryClassNames.includes(item.primaryKey.className),
          );
          if (applicableFields.length > 1) {
            throw new Error(
              `Expected at most one source field for canonical field '${canonicalKey}' and primary class '${item.primaryKey.className}', found ${applicableFields.length}.`,
            );
          }
          return [
            canonicalKey,
            applicableFields[0] ? await createCanonicalValue(item, applicableFields[0], type) : undefined,
          ];
        }),
      ),
    ),
  };
}

export async function createCanonicalCapture(capture: NewCapture): Promise<CanonicalCapture> {
  if ("descriptor" in capture) {
    const { descriptor } = createCanonicalDescriptor(capture.descriptor);
    return { descriptor };
  }
  return { items: await Promise.all(capture.items.map(createCanonicalItem)) };
}
