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
  normalizeValueForComparison,
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
  CanonicalRelationshipStep,
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
type LegacyPropertyInfo = PropertyInfoJSON<string> & { extendedType?: string };

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
  return {
    kind: "primitive",
    name: SHARED_PRIMITIVE_TYPE_NAMES.get(primitiveTypeName) ?? primitiveTypeName,
    ...(extendedType !== undefined ? { extendedType } : undefined),
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
          .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name)),
      };
  }
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
  const fields: CanonicalDescriptor["fields"] = [];
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
    fields.push(canonicalField);
    fieldMappings.push({ canonicalKey: canonicalField.key, sourcePath, type: canonicalField.type });
  };
  descriptor.fields.forEach((field) => visit(field, [], undefined));
  return {
    descriptor: { fields: fields.sort((lhs, rhs) => lhs.key.localeCompare(rhs.key)), unsupportedFields },
    fieldMappings,
  };
}

function createCanonicalValues(
  values: ValuesDictionary<Value>,
  sourcePath: string[],
  type: CanonicalFieldType,
): unknown {
  if (sourcePath.length === 1) {
    return normalizeValueForComparison(normalizeLegacyValue(values[sourcePath[0]]), type);
  }
  const [nestedFieldName, ...rest] = sourcePath;
  const nestedValue = values[nestedFieldName];
  if (!Value.isNestedContent(nestedValue)) {
    return nestedValue;
  }
  return nestedValue
    .map((entry) => ({
      primaryKeys: entry.primaryKeys
        .map((key) => ({ className: normalizeFullClassName(key.className), id: key.id }))
        .sort((lhs, rhs) => stableStringify(lhs).localeCompare(stableStringify(rhs))),
      value: createCanonicalValues(entry.values, rest, type),
    }))
    .sort((lhs, rhs) => stableStringify(lhs.primaryKeys).localeCompare(stableStringify(rhs.primaryKeys)));
}

function normalizeLegacyValue(value: Value): unknown {
  if (Value.isNavigationValue(value)) {
    return {
      key: { className: normalizeFullClassName(value.className), id: value.id },
      label: value.label.displayValue,
    };
  }
  return value;
}

function createCanonicalItem({
  item: { descriptor: sourceDescriptor, item },
  context,
}: {
  item: CapturedLegacyItem;
  context: NormalizationContext;
}): CanonicalItem {
  const { descriptor, fieldMappings } = createCanonicalDescriptor({ descriptor: sourceDescriptor, context });
  return {
    descriptor,
    primaryKeys: item.primaryKeys.map((key) => ({ className: normalizeFullClassName(key.className), id: key.id })),
    values: Object.fromEntries(
      fieldMappings.map(({ canonicalKey, sourcePath, type }) => [
        canonicalKey,
        createCanonicalValues(item.values, sourcePath, type),
      ]),
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
