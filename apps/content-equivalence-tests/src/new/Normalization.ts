/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createDefaultValueFormatter, formatConcatenatedValue } from "@itwin/presentation-shared";
import {
  createCanonicalEnumeration,
  createCanonicalRelationshipPath,
  getRelationshipConstraints,
  normalizeValueForComparison,
} from "../NormalizationCommon.js";
import { stableStringify } from "../Persistence.js";
import { createDeclaredRelationshipsResolver } from "./DeclaredRelationships.js";

import type { CategoryDefinition, ReadonlyContentDescriptor, ReadonlyPropertyField } from "@itwin/presentation-content";
import type { EC, ECSchemaProvider, ECSqlQueryExecutor, NavigationValue } from "@itwin/presentation-shared";
import type {
  CanonicalCapture,
  CanonicalDescriptor,
  CanonicalField,
  CanonicalFieldType,
  CanonicalItem,
  CanonicalRelationshipStep,
  RelationshipConstraints,
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

/** Relationships selected by each related field's declaration, per `pathFromTarget` step, keyed by field id. */
type DeclaredRelationshipNames = Record<string, EC.FullClassNameDotNotation[]>;

interface NormalizationContext {
  declaredRelationshipNames: DeclaredRelationshipNames;
  constraints: RelationshipConstraints;
}

function createCanonicalPath(
  id: string,
  field: ReadonlyPropertyField,
  { declaredRelationshipNames, constraints }: NormalizationContext,
): CanonicalRelationshipStep[] {
  if (field.pathFromTarget.length === 0) {
    return [];
  }
  const names = declaredRelationshipNames[id];
  return createCanonicalRelationshipPath({
    steps: field.pathFromTarget.map((step, index, steps) => ({
      relationshipName: names[index],
      relationshipReverse: step.relationshipReverse ?? false,
      ...(index === steps.length - 1 ? { targetClassName: step.targetClassName } : undefined),
    })),
    constraints,
  });
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
  id: string,
  field: ReadonlyPropertyField,
  categories: ReadonlyContentDescriptor["categories"],
  context: NormalizationContext,
): CanonicalField {
  const canonicalField = {
    category: field.categoryId ? getCategoryPath(categories[field.categoryId], categories) : [],
    label: field.label,
    type: createCanonicalType(field.type),
    propertyNames: [field.propertyName],
    propertyClassNames: [field.propertyClassName],
    kind: "property",
    path: createCanonicalPath(id, field, context),
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

function createCanonicalDescriptor(
  descriptor: ReadonlyContentDescriptor,
  context: NormalizationContext,
): { descriptor: CanonicalDescriptor; fieldMappings: NewFieldMapping[] } {
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
    const normalized = createCanonicalField(id, field, descriptor.categories, context);
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
    .map((entry) => ({ primaryKeys: [entry.key], value: normalizeValueForComparison(entry.values[field.id], type) }))
    .sort((lhs, rhs) => stableStringify(lhs.primaryKeys).localeCompare(stableStringify(rhs.primaryKeys)));
}

async function createCanonicalItem(item: CapturedNewItem, context: NormalizationContext): Promise<CanonicalItem> {
  const { descriptor, fieldMappings } = createCanonicalDescriptor(item.descriptor, context);
  return {
    descriptor,
    primaryKeys: [item.primaryKey],
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

async function getDeclaredRelationshipNames(
  descriptor: ReadonlyContentDescriptor,
  resolve: (field: ReadonlyPropertyField) => Promise<EC.FullClassNameDotNotation[]>,
): Promise<DeclaredRelationshipNames> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(descriptor.fields)
        .filter((entry): entry is [string, ReadonlyPropertyField] => {
          const field = entry[1];
          return !field.hidden && field.kind === "property" && field.pathFromTarget.length > 0;
        })
        .map(async ([id, field]) => [id, await resolve(field)] as const),
    ),
  );
}

export async function createCanonicalCapture(
  capture: NewCapture,
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor,
): Promise<CanonicalCapture> {
  const resolve = await createDeclaredRelationshipsResolver(imodelAccess);
  const descriptors = "descriptor" in capture ? [capture.descriptor] : capture.items.map((item) => item.descriptor);
  const declaredRelationshipNames = await Promise.all(
    descriptors.map(async (descriptor) => getDeclaredRelationshipNames(descriptor, resolve)),
  );
  const constraints = await getRelationshipConstraints(
    imodelAccess,
    new Set(declaredRelationshipNames.flatMap((namesByField) => Object.values(namesByField).flat())),
  );
  if ("descriptor" in capture) {
    const { descriptor } = createCanonicalDescriptor(capture.descriptor, {
      declaredRelationshipNames: declaredRelationshipNames[0],
      constraints,
    });
    return { descriptor };
  }
  return {
    items: await Promise.all(
      capture.items.map(async (item, index) =>
        createCanonicalItem(item, { declaredRelationshipNames: declaredRelationshipNames[index], constraints }),
      ),
    ),
  };
}
