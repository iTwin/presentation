/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";
import { normalizeFloatingPointValue } from "../NormalizationCommon.js";
import { stableStringify } from "../Persistence.js";

import type { CategoryDefinition, ReadonlyPropertyField } from "@itwin/presentation-content";
import type {
  CanonicalCapture,
  CanonicalDescriptor,
  CanonicalField,
  CanonicalFieldType,
  CanonicalItem,
  CanonicalRelationshipStep,
} from "../NormalizationCommon.js";
import type { CapturedNewItem, CapturedNewValue, NewCapture } from "./Adapter.js";

type NewFieldType = NewCapture["descriptor"]["fields"][string]["type"];

interface NewFieldMapping {
  canonicalKey: CanonicalField["key"];
  sourceFields: ReadonlyPropertyField[];
  type: CanonicalFieldType;
}

interface CanonicalRelatedValue {
  primaryKeys: CapturedNewItem["primaryKey"][];
  value: CapturedNewValue;
}

function getCategoryPath(
  category: Readonly<CategoryDefinition>,
  categories: Readonly<Record<string, Readonly<CategoryDefinition>>>,
): string[] {
  return [...(category.parentId ? getCategoryPath(categories[category.parentId], categories) : []), category.label];
}

function createCanonicalPath(field: ReadonlyPropertyField): CanonicalRelationshipStep[] {
  return field.pathFromTarget.map((step) => ({
    relationshipName: step.relationshipName,
    targetClassName: step.targetClassName,
    relationshipReverse: step.relationshipReverse ?? false,
  }));
}

function createCanonicalType(type: NewFieldType): CanonicalFieldType {
  switch (type.kind) {
    case "primitive":
      return { kind: "primitive", name: type.type };
    case "navigation":
      return { kind: "navigation" };
    case "array":
      return { kind: "array", member: createCanonicalType(type.elementType) };
    case "struct":
      return {
        kind: "struct",
        members: type.members
          .map((member) => ({ name: member.name, type: createCanonicalType(member.type) }))
          .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name)),
      };
  }
}

function createCanonicalField(
  field: ReadonlyPropertyField,
  categories: NewCapture["descriptor"]["categories"],
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

function createCanonicalDescriptor(descriptor: NewCapture["descriptor"]): {
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

function createCanonicalValue(item: CapturedNewItem, field: ReadonlyPropertyField, type: CanonicalFieldType): unknown {
  if (field.pathFromTarget.length === 0) {
    return normalizeFloatingPointValue(item.values[field.id], type);
  }
  const relatedGroup = item.related.find(
    (group) => stableStringify(group.path) === stableStringify(field.pathFromTarget),
  );
  return (relatedGroup?.entries ?? [])
    .map((entry) => ({
      primaryKeys: [{ className: normalizeFullClassName(entry.key.className), id: entry.key.id }],
      value: normalizeFloatingPointValue(entry.values[field.id], type),
    }))
    .sort((lhs, rhs) => stableStringify(lhs.primaryKeys).localeCompare(stableStringify(rhs.primaryKeys)));
}

function createCanonicalItems(
  items: NonNullable<NewCapture["items"]>,
  fieldMappings: NewFieldMapping[],
): CanonicalItem[] {
  return items.map((item) => {
    return {
      primaryKeys: [{ className: normalizeFullClassName(item.primaryKey.className), id: item.primaryKey.id }],
      values: Object.fromEntries(
        fieldMappings.map(({ canonicalKey, sourceFields, type }) => {
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
            applicableFields[0] ? createCanonicalValue(item, applicableFields[0], type) : undefined,
          ];
        }),
      ),
    };
  });
}

export function createCanonicalCapture(capture: NewCapture): CanonicalCapture {
  const { descriptor, fieldMappings } = createCanonicalDescriptor(capture.descriptor);
  return {
    descriptor,
    ...(capture.items === undefined ? {} : { items: createCanonicalItems(capture.items, fieldMappings) }),
  };
}
