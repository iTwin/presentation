/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createDefaultValueFormatter, formatConcatenatedValue, getClass } from "@itwin/presentation-shared";
import {
  createCanonicalEnumeration,
  createCanonicalRelationshipPath,
  getRelationshipConstraints,
  isPointValue,
  roundFloatingPointNoise,
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
  CanonicalItemValue,
  CanonicalRelationshipStep,
  CanonicalValue,
  RelationshipConstraints,
} from "../NormalizationCommon.js";
import type { CapturedNewItem, CapturedNewValue, NewCapture } from "./Adapter.js";

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

interface InheritedPropertyMetadata {
  categoryLabel?: string;
  kindOfQuantity?: string;
  hidden: boolean;
}

/** Metadata resolved through the property's class hierarchy, keyed by `getPropertyKey`. */
type InheritedPropertiesMetadata = Record<string, InheritedPropertyMetadata | undefined>;

interface NormalizationContext {
  declaredRelationshipNames: DeclaredRelationshipNames;
  constraints: RelationshipConstraints;
  inheritedProperties: InheritedPropertiesMetadata;
}

/** Only direct fields qualify: related fields are always anchored to a class category. */
function needsInheritedCategory(field: ReadonlyPropertyField) {
  return field.categoryId === undefined && field.pathFromTarget.length === 0;
}

function getPropertyKey(field: ReadonlyPropertyField) {
  return `${field.propertyClassName}#${field.propertyName}`;
}

function hasPrimitiveValueType(type: NewFieldType): boolean {
  return type.kind === "primitive" || (type.kind === "array" && hasPrimitiveValueType(type.elementType));
}

/**
 * TODO: Workaround for https://github.com/iTwin/itwinjs-core/issues/9801: `SchemaView` doesn't inherit a property's
 * category, kind of quantity or hidden flag from its base properties, while native `ECProperty` does.
 * Remove once that is fixed.
 */
async function getInheritedPropertiesMetadata(
  descriptors: ReadonlyContentDescriptor[],
  imodelAccess: ECSchemaProvider,
): Promise<InheritedPropertiesMetadata> {
  const fields = new Map<string, ReadonlyPropertyField>();
  for (const descriptor of descriptors) {
    for (const field of Object.values(descriptor.fields)) {
      if (field.kind === "property" && !field.hidden) {
        fields.set(getPropertyKey(field), field);
      }
    }
  }
  const entries = await Promise.all(
    [...fields].map(async ([key, field]) => {
      const property = (await getClass(imodelAccess, field.propertyClassName)).getProperty(field.propertyName);
      if (!property) {
        return undefined;
      }
      const metadata: InheritedPropertyMetadata = { hidden: false };
      let currentClass: EC.Class | undefined = property.class;
      while (currentClass) {
        const classProperty = currentClass.getProperty(field.propertyName);
        if (classProperty) {
          if (classProperty.isHidden) {
            metadata.hidden = true;
          }
          if (metadata.categoryLabel === undefined && classProperty.category) {
            metadata.categoryLabel = classProperty.category.label ?? classProperty.category.name;
          }
          metadata.kindOfQuantity ??= classProperty.kindOfQuantity?.fullName;
        }
        currentClass = currentClass.baseClass;
      }
      return [key, metadata] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
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
function createCanonicalType(
  type: NewFieldType,
  isStructMember = false,
  inheritedKindOfQuantity?: string,
): CanonicalFieldType {
  switch (type.kind) {
    case "primitive":
      if (isStructMember) {
        return { kind: "primitive", name: type.enumeration !== undefined ? "enum" : (type.extendedType ?? type.type) };
      }
      const kindOfQuantity = type.kindOfQuantity ?? inheritedKindOfQuantity;
      return {
        kind: "primitive",
        name: type.type,
        ...(type.extendedType !== undefined ? { extendedType: type.extendedType } : undefined),
        ...(kindOfQuantity !== undefined ? { kindOfQuantity } : undefined),
        ...(type.enumeration !== undefined
          ? { enumeration: createCanonicalEnumeration(type.enumeration.isStrict, type.enumeration.enumerators) }
          : undefined),
      };
    case "navigation":
      return { kind: "navigation" };
    case "array":
      return { kind: "array", member: createCanonicalType(type.elementType, isStructMember, inheritedKindOfQuantity) };
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
  const inherited = context.inheritedProperties[getPropertyKey(field)];
  const inheritedCategoryLabel = needsInheritedCategory(field) ? inherited?.categoryLabel : undefined;
  const inheritedKindOfQuantity = hasPrimitiveValueType(field.type) ? inherited?.kindOfQuantity : undefined;
  const canonicalField = {
    category: field.categoryId
      ? getCategoryPath(categories[field.categoryId], categories)
      : inheritedCategoryLabel !== undefined
        ? [inheritedCategoryLabel]
        : [],
    label: field.label,
    type: createCanonicalType(field.type, false, inheritedKindOfQuantity),
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
    if (context.inheritedProperties[getPropertyKey(field)]?.hidden) {
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

function isNavigationValue(value: unknown): value is NavigationValue {
  return typeof value === "object" && value !== null && "key" in value && "label" in value;
}

async function toCanonicalValue(value: CapturedNewValue, type: CanonicalFieldType): Promise<CanonicalValue> {
  if (value === undefined) {
    return undefined;
  }
  switch (type.kind) {
    case "primitive":
      switch (type.name) {
        case "Double":
          if (typeof value === "number") {
            return roundFloatingPointNoise(value);
          }
          break;
        case "Point2d":
        case "Point3d":
          if (typeof value === "object" && !Array.isArray(value) && isPointValue(value)) {
            return roundFloatingPointNoise(value);
          }
          break;
        default:
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            return value;
          }
      }
      throw new Error(`Expected a ${type.name} value.`);
    case "navigation":
      if (!isNavigationValue(value)) {
        throw new Error("Expected a navigation value.");
      }
      return { key: value.key, label: await formatConcatenatedValue({ value: value.label, valueFormatter }) };
    case "array":
      if (!Array.isArray(value)) {
        throw new Error("Expected an array value.");
      }
      return Promise.all(value.map(async (entry) => toCanonicalValue(entry, type.member)));
    case "struct":
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected a struct value.");
      }
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).flatMap(([name, member]) => {
            const memberType = type.members.find((candidate) => candidate.name === name)?.type;
            return memberType ? [toCanonicalValue(member, memberType).then((result) => [name, result] as const)] : [];
          }),
        ),
      );
  }
}

async function createCanonicalValue(
  item: CapturedNewItem,
  field: ReadonlyPropertyField,
  type: CanonicalFieldType,
): Promise<CanonicalItemValue> {
  if (field.pathFromTarget.length === 0) {
    return toCanonicalValue(item.values[field.id], type);
  }
  const relatedGroup = item.related.find(
    (group) => stableStringify(group.path) === stableStringify(field.pathFromTarget),
  );
  const relatedValues = await Promise.all(
    (relatedGroup?.entries ?? []).map(async (entry) => ({
      primaryKeys: [entry.key],
      value: await toCanonicalValue(entry.values[field.id], type),
    })),
  );
  return relatedValues.sort((lhs, rhs) =>
    stableStringify(lhs.primaryKeys).localeCompare(stableStringify(rhs.primaryKeys)),
  );
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
          ] as const;
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
  const inheritedProperties = await getInheritedPropertiesMetadata(descriptors, imodelAccess);
  if ("descriptor" in capture) {
    const { descriptor } = createCanonicalDescriptor(capture.descriptor, {
      declaredRelationshipNames: declaredRelationshipNames[0],
      constraints,
      inheritedProperties,
    });
    return { descriptor };
  }
  return {
    items: await Promise.all(
      capture.items.map(async (item, index) =>
        createCanonicalItem(item, {
          declaredRelationshipNames: declaredRelationshipNames[index],
          constraints,
          inheritedProperties,
        }),
      ),
    ),
  };
}
