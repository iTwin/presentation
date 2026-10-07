/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyValueFormat, Value } from "@itwin/presentation-common";
import { normalizeFullClassName } from "@itwin/presentation-shared";
import {
  createCanonicalEnumeration,
  createCanonicalRelationshipPath,
  getRelationshipConstraints,
  isPointValue,
  roundFloatingPointNoise,
} from "../NormalizationCommon.js";
import { stableStringify } from "../Persistence.js";

import type {
  CategoryDescriptionJSON,
  DescriptorJSON,
  FieldJSON,
  PropertiesFieldJSON,
  PropertyInfoJSON,
  RelationshipPathJSON,
  TypeDescription,
  ValuesDictionary,
} from "@itwin/presentation-common";
import type { EC, ECSchemaProvider, PrimitiveValueType } from "@itwin/presentation-shared";
import type {
  CanonicalCapture,
  CanonicalDescriptor,
  CanonicalField,
  CanonicalFieldType,
  CanonicalItem,
  CanonicalItemValue,
  CanonicalRelatedValue,
  CanonicalRelationshipStep,
  CanonicalValue,
  RelationshipConstraints,
} from "../NormalizationCommon.js";
import type { CapturedLegacyItem, LegacyCapture } from "./Adapter.js";

interface LegacyFieldMapping {
  canonicalKey: CanonicalField["key"];
  sourcePath: string[];
  type: CanonicalFieldType;
}

/**
 * Legacy's `PropertyInfoJSON` carries an `extendedType` at runtime (e.g. `"Json"`, `"BeGuid"`) that its
 * type declarations omit.
 */
type LegacyPropertyInfo = PropertyInfoJSON<string> & { extendedType?: string; kindOfQuantity?: { name?: string } };

/**
 * Maps a legacy `TypeDescription.typeName` to the `presentation-shared` primitive vocabulary used
 * by the new-generation pipeline, so canonical field keys and value types compare equal across
 * implementations.
 */
const SHARED_PRIMITIVE_TYPE_NAMES = new Map<string, PrimitiveValueType>([
  ["int", "Integer"],
  ["long", "Long"],
  ["double", "Double"],
  ["string", "String"],
  ["boolean", "Boolean"],
  ["dateTime", "DateTime"],
  ["point2d", "Point2d"],
  ["point3d", "Point3d"],
]);

function getCategoryPath(
  category: CategoryDescriptionJSON,
  categories: Map<string, CategoryDescriptionJSON>,
): string[] {
  const path = [
    ...(category.parent ? getCategoryPath(categories.get(category.parent)!, categories) : []),
    category.label,
  ];
  return path.length === 1 && path[0] === "Selected Item(s)" ? [] : path;
}

/**
 * Builds the canonical type for a primitive field's `typeName`, using `properties` (the field's raw
 * EC properties) to recover its `extendedType` and enumeration metadata.
 *
 * Legacy reports a primitive property's `extendedTypeName` (e.g. `"Json"`) by replacing the type's
 * `typeName` with the extended type name itself, rather than keeping the underlying primitive name and
 * exposing the extended type separately (the way `presentation-shared`'s `PrimitiveValueDescriptor`
 * does, via its own `extendedType` property). This detects that substitution and recovers the real
 * primitive name from the raw property's own `type`, so the canonical type compares equal to the
 * new-generation pipeline's.
 *
 * Legacy does the same for enumeration-backed properties: `typeName` becomes the generic `"enum"`
 * sentinel instead of the backing primitive type name, and the raw property's own `type` is `"enum"`
 * too (unlike the `extendedType` case, it can't be recovered from there). The backing type is instead
 * inferred from the declared enumerator values' JS type (EC enumerations are only backed by `int` or
 * `string`). Legacy's `EnumerationInfo` also doesn't expose the enumeration's own name, so the
 * canonical enumeration only carries what both implementations can supply: strictness and enumerators.
 *
 * `properties` is `undefined` for struct members, which have no EC property context to recover any of
 * this from, so their substituted `typeName` is kept as-is.
 */
function createCanonicalPrimitiveFieldType(
  typeName: string,
  properties: LegacyPropertyInfo[] | undefined,
): CanonicalFieldType {
  if (!properties) {
    return { kind: "primitive", name: SHARED_PRIMITIVE_TYPE_NAMES.get(typeName) ?? typeName };
  }
  if (typeName === "enum") {
    const enumerationInfo = properties.find((property) => property.enumerationInfo !== undefined)?.enumerationInfo;
    if (!enumerationInfo) {
      // Same fallback the new-generation pipeline uses for enumerations it can't resolve.
      return { kind: "primitive", name: "String" };
    }
    const isNumeric = enumerationInfo.choices.every((choice) => typeof choice.value === "number");
    return {
      kind: "primitive",
      name: isNumeric ? "Integer" : "String",
      enumeration: createCanonicalEnumeration(enumerationInfo.isStrict, enumerationInfo.choices),
    };
  }
  const extendedType = properties.find((property) => property.extendedType !== undefined)?.extendedType;
  const isSubstitutedByExtendedType = extendedType !== undefined && extendedType === typeName;
  const primitiveTypeName = isSubstitutedByExtendedType
    ? properties.find((property) => property.extendedType === extendedType)!.type
    : typeName;
  const kindOfQuantity = properties.find((property) => property.kindOfQuantity?.name !== undefined)?.kindOfQuantity
    ?.name;
  return {
    kind: "primitive",
    name: SHARED_PRIMITIVE_TYPE_NAMES.get(primitiveTypeName) ?? primitiveTypeName,
    ...(extendedType !== undefined ? { extendedType } : undefined),
    ...(kindOfQuantity !== undefined ? { kindOfQuantity: normalizeFullClassName(kindOfQuantity) } : undefined),
  };
}

function createCanonicalFieldType(
  type: TypeDescription,
  properties: LegacyPropertyInfo[] | undefined,
): CanonicalFieldType {
  switch (type.valueFormat) {
    case PropertyValueFormat.Primitive: {
      if (type.typeName === "navigation") {
        return { kind: "navigation" };
      }
      return createCanonicalPrimitiveFieldType(type.typeName, properties);
    }
    case PropertyValueFormat.Array:
      return { kind: "array", member: createCanonicalFieldType(type.memberType, properties) };
    case PropertyValueFormat.Struct:
      return {
        kind: "struct",
        // A struct member's enumeration and extended type metadata isn't captured in legacy's
        // `TypeDescription`, so it can't be recovered here - members are normalized without `properties` context.
        members: type.members
          .map((member) => ({ name: member.name, type: createCanonicalFieldType(member.type, undefined) }))
          .filter(({ type: memberType }) => isAllowedFieldType(memberType))
          .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name)),
      };
  }
}

function isAllowedFieldType(type: CanonicalFieldType): boolean {
  const disallowed = ["Bentley.Geometry.Common.IGeometry", "Binary"];
  if (type.kind === "primitive" && disallowed.includes(type.name)) {
    return false;
  }
  if (type.kind === "array" && type.member.kind === "primitive" && disallowed.includes(type.member.name)) {
    return false;
  }
  return true;
}

/**
 * The accumulated `pathToPrimaryClass` steps run from a nested field's own class back to the content's
 * primary class, the opposite direction of the new-generation `pathFromTarget`. Reversing them (and
 * flipping the forward flag, since going against a step also flips whether it matches the relationship's declared direction)
 * yields the same target-oriented identity `pathFromTarget` uses.
 */
function createCanonicalPath(
  path: RelationshipPathJSON<string> | undefined,
  classes: DescriptorJSON["classesMap"],
  constraints: RelationshipConstraints,
): CanonicalRelationshipStep[] {
  if (!path) {
    return [];
  }
  return createCanonicalRelationshipPath({
    steps: [...path].reverse().map((step, index, steps) => ({
      relationshipName: normalizeFullClassName(classes[step.relationshipInfo].name),
      relationshipReverse: step.isForwardRelationship,
      // The last step's target is the nested field's own concrete class.
      ...(index === steps.length - 1
        ? { targetClassName: normalizeFullClassName(classes[step.sourceClassInfo].name) }
        : undefined),
    })),
    constraints,
  });
}

function createCanonicalField(props: {
  field: PropertiesFieldJSON<string>;
  sourcePath: string[];
  path: RelationshipPathJSON<string> | undefined;
  categories: Map<string, CategoryDescriptionJSON>;
  classes: DescriptorJSON["classesMap"];
  constraints: RelationshipConstraints;
}): CanonicalField {
  const { field, sourcePath, categories, classes, constraints } = props;
  const properties: LegacyPropertyInfo[] = field.properties.map(({ property }) => property);
  const canonicalField = {
    category: field.category ? getCategoryPath(categories.get(field.category)!, categories) : [],
    label: field.label,
    type: createCanonicalFieldType(field.type, properties),
    propertyNames: [...new Set(properties.map((property) => property.name))].sort(),
    propertyClassNames: [
      ...new Set(properties.map((property) => normalizeFullClassName(classes[property.classInfo].name))),
    ].sort(),
    kind: "property",
    path: createCanonicalPath(props.path, classes, constraints),
    sourcePaths: [sourcePath],
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

interface NormalizationContext {
  constraints: RelationshipConstraints;
}

function createCanonicalDescriptor({
  descriptor,
  context,
}: {
  descriptor: DescriptorJSON;
  context: NormalizationContext;
}): { descriptor: CanonicalDescriptor; fieldMappings: LegacyFieldMapping[] } {
  const { constraints } = context;
  const categories = new Map(descriptor.categories.map((category) => [category.name, category]));
  const classes = descriptor.classesMap;
  const fieldsByKey = new Map<string, CanonicalField>();
  const fieldMappings: LegacyFieldMapping[] = [];
  const unsupportedFields: CanonicalDescriptor["unsupportedFields"] = [];

  const visit = (
    field: FieldJSON<string>,
    parentPath: string[],
    relationshipPath: RelationshipPathJSON<string> | undefined,
  ) => {
    const sourcePath = [...parentPath, field.name];
    if ("nestedFields" in field) {
      const pathToPrimaryClass = [...field.pathToPrimaryClass, ...(relationshipPath ?? [])];
      field.nestedFields.forEach((child) => visit(child, sourcePath, pathToPrimaryClass));
      return;
    }
    if (!("properties" in field)) {
      unsupportedFields.push({ sourcePath, reason: "Legacy field is not property-backed." });
      return;
    }
    const canonicalField = createCanonicalField({
      field,
      sourcePath,
      path: relationshipPath,
      categories,
      classes,
      constraints,
    });
    // Consolidated legacy descriptors can contain several related-content fields that normalize to the same
    // canonical identity. While merging related-content paths, native `RelatedClass::Unify` widens the target
    // selection to polymorphic when two paths differ only by SQL alias. `EndsWithSameRelatedClass` then rejects
    // later paths whose target is still non-polymorphic, so a field is created per source-class path instead
    // of one. Merge them here.
    const existing = fieldsByKey.get(canonicalField.key);
    if (existing) {
      existing.propertyClassNames = [
        ...new Set([...existing.propertyClassNames, ...canonicalField.propertyClassNames]),
      ].sort();
      existing.sourcePaths.push(...canonicalField.sourcePaths);
    } else {
      fieldsByKey.set(canonicalField.key, canonicalField);
    }
    fieldMappings.push({ canonicalKey: canonicalField.key, sourcePath, type: canonicalField.type });
  };
  descriptor.fields.forEach((field) => visit(field, [], undefined));
  const fields = [...fieldsByKey.values()];
  return {
    descriptor: { fields: fields.sort((lhs, rhs) => lhs.key.localeCompare(rhs.key)), unsupportedFields },
    fieldMappings,
  };
}

function createCanonicalValues(
  values: ValuesDictionary<Value>,
  sourcePath: string[],
  type: CanonicalFieldType,
): CanonicalItemValue {
  if (sourcePath.length === 1) {
    return toCanonicalValue(values[sourcePath[0]], type);
  }
  return collectRelatedValues(values, sourcePath, type).sort((lhs, rhs) =>
    stableStringify(lhs.primaryKeys).localeCompare(stableStringify(rhs.primaryKeys)),
  );
}

/**
 * Legacy nests each relationship hop inside the previous one's content. Walks every hop and keeps
 * just the terminal instances.
 */
function collectRelatedValues(
  values: ValuesDictionary<Value>,
  [nestedFieldName, ...rest]: string[],
  type: CanonicalFieldType,
): CanonicalRelatedValue[] {
  const nestedValue = values[nestedFieldName];
  if (nestedValue === undefined) {
    return [];
  }
  if (!Value.isNestedContent(nestedValue)) {
    throw new Error(`Expected field '${nestedFieldName}' to contain nested content.`);
  }
  return nestedValue.flatMap((entry) =>
    rest.length > 1
      ? collectRelatedValues(entry.values, rest, type)
      : [
          {
            primaryKeys: entry.primaryKeys
              .map((key) => ({ className: normalizeFullClassName(key.className), id: key.id }))
              .sort((lhs, rhs) => stableStringify(lhs).localeCompare(stableStringify(rhs))),
            value: toCanonicalValue(entry.values[rest[0]], type),
          },
        ],
  );
}

function toCanonicalValue(value: Value, type: CanonicalFieldType): CanonicalValue {
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
          if (Value.isMap(value) && isPointValue(value)) {
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
      if (!Value.isNavigationValue(value)) {
        throw new Error("Expected a navigation value.");
      }
      return {
        key: { className: normalizeFullClassName(value.className), id: value.id },
        label: value.label.displayValue,
      };
    case "array":
      if (!Value.isArray(value)) {
        throw new Error("Expected an array value.");
      }
      return value.map((entry) => toCanonicalValue(entry, type.member));
    case "struct":
      if (!Value.isMap(value)) {
        throw new Error("Expected a struct value.");
      }
      return Object.fromEntries(
        Object.entries(value).flatMap(([name, member]) => {
          const memberType = type.members.find((candidate) => candidate.name === name)?.type;
          return memberType ? [[name, toCanonicalValue(member, memberType)]] : [];
        }),
      );
  }
}

function createCanonicalItem({
  item: { descriptor: sourceDescriptor, item },
  context,
}: {
  item: CapturedLegacyItem;
  context: NormalizationContext;
}): CanonicalItem {
  const { descriptor, fieldMappings } = createCanonicalDescriptor({ descriptor: sourceDescriptor, context });
  const sourcePathsByCanonicalKey = new Map<string, string[]>();
  for (const { canonicalKey, sourcePath } of fieldMappings) {
    const previousSourcePath = sourcePathsByCanonicalKey.get(canonicalKey);
    if (previousSourcePath) {
      const itemIdentity = item.primaryKeys
        .map(({ className, id }) => `${normalizeFullClassName(className)}:${id}`)
        .join(", ");
      throw new Error(
        `Legacy item '${itemIdentity}' has multiple source fields for canonical key '${canonicalKey}': '${previousSourcePath.join(".")}' and '${sourcePath.join(".")}'.`,
      );
    }
    sourcePathsByCanonicalKey.set(canonicalKey, sourcePath);
  }
  return {
    descriptor,
    primaryKeys: item.primaryKeys.map((key) => ({ className: normalizeFullClassName(key.className), id: key.id })),
    values: Object.fromEntries(
      fieldMappings.map(
        ({ canonicalKey, sourcePath, type }) =>
          [canonicalKey, createCanonicalValues(item.values, sourcePath, type)] as const,
      ),
    ),
  };
}

function collectRelationshipNames(descriptors: DescriptorJSON[]): Set<EC.FullClassNameDotNotation> {
  const names = new Set<EC.FullClassNameDotNotation>();
  for (const descriptor of descriptors) {
    const visit = (field: FieldJSON<string>) => {
      if ("nestedFields" in field) {
        field.pathToPrimaryClass.forEach((step) =>
          names.add(normalizeFullClassName(descriptor.classesMap[step.relationshipInfo].name)),
        );
        field.nestedFields.forEach(visit);
      }
    };
    descriptor.fields.forEach(visit);
  }
  return names;
}

export async function createCanonicalCapture(
  capture: LegacyCapture,
  schemaProvider: ECSchemaProvider,
): Promise<CanonicalCapture> {
  const descriptors = "descriptor" in capture ? [capture.descriptor] : capture.items.map((item) => item.descriptor);
  const context = {
    constraints: await getRelationshipConstraints(schemaProvider, collectRelationshipNames(descriptors)),
  };
  if ("descriptor" in capture) {
    const { descriptor } = createCanonicalDescriptor({ descriptor: capture.descriptor, context });
    return { descriptor };
  }
  return { items: capture.items.map((item) => createCanonicalItem({ item, context })) };
}
