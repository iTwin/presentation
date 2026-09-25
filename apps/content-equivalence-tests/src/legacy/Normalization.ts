/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyValueFormat, Value } from "@itwin/presentation-common";
import { normalizeFullClassName } from "@itwin/presentation-shared";
import { stableStringify } from "../Persistence.js";

import type {
  CategoryDescriptionJSON,
  DescriptorJSON,
  FieldJSON,
  PropertiesFieldJSON,
  RelationshipPathJSON,
  TypeDescription,
  ValuesDictionary,
} from "@itwin/presentation-common";
import type { PrimitiveValueType } from "@itwin/presentation-shared";
import type {
  CanonicalCapture,
  CanonicalDescriptor,
  CanonicalField,
  CanonicalFieldType,
  CanonicalItem,
  CanonicalRelationshipStep,
} from "../NormalizationCommon.js";
import type { LegacyCapture } from "./Adapter.js";

interface LegacyFieldMapping {
  canonicalKey: CanonicalField["key"];
  sourcePath: string[];
}

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

function createCanonicalFieldType(type: TypeDescription): CanonicalFieldType {
  switch (type.valueFormat) {
    case PropertyValueFormat.Primitive: {
      if (type.typeName === "navigation") {
        return { kind: "navigation" };
      }
      return { kind: "primitive", name: SHARED_PRIMITIVE_TYPE_NAMES.get(type.typeName) ?? type.typeName };
    }
    case PropertyValueFormat.Array:
      return { kind: "array", member: createCanonicalFieldType(type.memberType) };
    case PropertyValueFormat.Struct:
      return {
        kind: "struct",
        members: type.members
          .map((member) => ({ name: member.name, type: createCanonicalFieldType(member.type) }))
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
): CanonicalRelationshipStep[] {
  if (!path) {
    return [];
  }
  return [...path]
    .reverse()
    .map((step) => ({
      relationshipName: normalizeFullClassName(classes[step.relationshipInfo].name),
      targetClassName: normalizeFullClassName(classes[step.sourceClassInfo].name),
      relationshipReverse: step.isForwardRelationship,
    }));
}

function createCanonicalField(props: {
  field: PropertiesFieldJSON<string>;
  sourcePath: string[];
  path: RelationshipPathJSON<string> | undefined;
  categories: Map<string, CategoryDescriptionJSON>;
  classes: DescriptorJSON["classesMap"];
}): CanonicalField {
  const { field, sourcePath, categories, classes } = props;
  const properties = field.properties.map(({ property }) => property);
  const canonicalField = {
    category: field.category ? getCategoryPath(categories.get(field.category)!, categories) : [],
    label: field.label,
    type: createCanonicalFieldType(field.type),
    propertyNames: [...new Set(properties.map((property) => property.name))].sort(),
    propertyClassNames: [
      ...new Set(properties.map((property) => normalizeFullClassName(classes[property.classInfo].name))),
    ].sort(),
    kind: "property",
    path: createCanonicalPath(props.path, classes),
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

function createCanonicalDescriptor(descriptor: LegacyCapture["descriptor"]): {
  descriptor: CanonicalDescriptor;
  fieldMappings: LegacyFieldMapping[];
} {
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
    const canonicalField = createCanonicalField({ field, sourcePath, path: relationshipPath, categories, classes });
    fields.push(canonicalField);
    fieldMappings.push({ canonicalKey: canonicalField.key, sourcePath });
  };
  descriptor.fields.forEach((field) => visit(field, [], undefined));
  return {
    descriptor: { fields: fields.sort((lhs, rhs) => lhs.key.localeCompare(rhs.key)), unsupportedFields },
    fieldMappings,
  };
}

function createCanonicalValues(values: ValuesDictionary<Value>, sourcePath: string[]): unknown {
  if (sourcePath.length === 1) {
    return normalizeLegacyValue(values[sourcePath[0]]);
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
      value: createCanonicalValues(entry.values, rest),
    }))
    .sort((lhs, rhs) => stableStringify(lhs.primaryKeys).localeCompare(stableStringify(rhs.primaryKeys)));
}

// TODO: normalize to InstanceKey + label when https://github.com/iTwin/presentation/pull/1585 merges
function normalizeLegacyValue(value: Value): unknown {
  if (Value.isNavigationValue(value)) {
    return value.id;
  }
  return value;
}

function createCanonicalItems(
  items: NonNullable<LegacyCapture["items"]>,
  fieldMappings: LegacyFieldMapping[],
): CanonicalItem[] {
  return items.map((item) => {
    return {
      primaryKeys: item.primaryKeys.map((key) => ({ className: normalizeFullClassName(key.className), id: key.id })),
      values: Object.fromEntries(
        fieldMappings.map(({ canonicalKey, sourcePath }) => [
          canonicalKey,
          createCanonicalValues(item.values, sourcePath),
        ]),
      ),
    };
  });
}

export function createCanonicalCapture(capture: LegacyCapture): CanonicalCapture {
  const { descriptor, fieldMappings } = createCanonicalDescriptor(capture.descriptor);
  return {
    descriptor,
    ...(capture.items === undefined ? {} : { items: createCanonicalItems(capture.items, fieldMappings) }),
  };
}
