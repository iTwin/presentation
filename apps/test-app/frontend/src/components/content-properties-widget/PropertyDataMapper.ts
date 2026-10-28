/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyRecord, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { formatConcatenatedValue, TypedPrimitiveValue } from "@itwin/presentation-shared";

import type { PropertyDescription, PropertyValue } from "@itwin/appui-abstract";
import type { PropertyCategory, PropertyData } from "@itwin/components-react";
import type {
  ContentItem,
  ReadonlyContentDescriptor,
  ReadonlyField,
  ReadonlyPropertyField,
} from "@itwin/presentation-content";
import type { Content } from "@itwin/presentation-content-react";
import type {
  DeepReadonly,
  IPrimitiveValueFormatter,
  NavigationValue,
  PrimitiveValue,
  PrimitiveValueDescriptor,
  RelationshipPath,
  Value,
  ValueDescriptor,
} from "@itwin/presentation-shared";

/** Name of the category that holds records of fields without a category. */
const DEFAULT_CATEGORY_NAME = "/default-category/";

/**
 * Maps content loaded by `useContent` to `PropertyData` for the `PropertyGrid` component.
 *
 * - Hidden fields are left out.
 * - Values of all items are merged: when every instance a field applies to has an equal value, the record holds
 *   that value, otherwise the record is marked `isMerged` and the grid shows "Varies".
 * - Fields reached over a many-valued relationship path that share the path and category are combined into one
 *   array record, with one struct item per related instance.
 * - Records are placed into the descriptor's category tree, in descriptor field order.
 */
export async function createPropertyData(props: {
  content: Content;
  formatter: IPrimitiveValueFormatter;
  includeEmptyValues?: boolean;
  defaultCategoryLabel?: string;
}): Promise<PropertyData> {
  const { content, formatter } = props;
  const { descriptor, items } = content;
  const options: RecordOptions = { formatter, includeEmptyValues: !!props.includeEmptyValues };

  // Records are built after all fields are visited, so that related groups have all their fields. A group takes
  // the position of its first field.
  const entries: Array<{ categoryId: string | undefined; build: () => Promise<PropertyRecord | undefined> }> = [];
  const relatedGroups = new Map<string, ReadonlyPropertyField[]>();
  for (const field of Object.values(descriptor.fields)) {
    if (field.hidden) {
      continue;
    }
    if (field.kind === "property" && field.pathCardinality === "many") {
      const groupKey = JSON.stringify([serializePath(field.pathFromTarget), field.categoryId ?? null]);
      const group = relatedGroups.get(groupKey);
      if (group) {
        group.push(field);
        continue;
      }
      const newGroup = [field];
      relatedGroups.set(groupKey, newGroup);
      entries.push({
        categoryId: field.categoryId,
        build: async () => createRelatedGroupRecord({ descriptor, fields: newGroup, items }, options),
      });
      continue;
    }
    entries.push({ categoryId: field.categoryId, build: async () => createFieldRecord({ field, items }, options) });
  }

  const records = await Promise.all(
    entries.map(async (entry) => ({ categoryId: entry.categoryId, record: await entry.build() })),
  );
  const { categories, recordsByCategory } = buildCategoryTree({
    descriptor,
    records: records.filter(
      (entry): entry is { categoryId: string | undefined; record: PropertyRecord } => entry.record !== undefined,
    ),
    defaultCategoryLabel: props.defaultCategoryLabel ?? "Miscellaneous",
  });
  return {
    label: PropertyRecord.fromString(items.length === 1 ? items[0].primaryKey.className : `${items.length} instances`),
    categories,
    records: recordsByCategory,
  };
}

interface RecordOptions {
  formatter: IPrimitiveValueFormatter;
  includeEmptyValues: boolean;
}

interface RecordProps {
  name: string;
  label: string;
  type: DeepReadonly<ValueDescriptor>;
  isReadonly: boolean;
}

async function createFieldRecord(
  props: { field: ReadonlyField; items: ContentItem[] },
  options: RecordOptions,
): Promise<PropertyRecord | undefined> {
  const { field, items } = props;
  const values = items.filter((item) => appliesToItem(field, item)).map((item) => item.getValue(field));
  const recordProps: RecordProps = {
    name: field.id,
    label: field.label,
    type: field.type,
    isReadonly: !!field.readOnly,
  };
  return createMergedRecord({
    recordProps,
    values,
    isEmpty: (value) => value === undefined,
    includeEmptyValues: options.includeEmptyValues,
    createRecord: async (value) => createRecord({ ...recordProps, value }, options),
  });
}

/** Values of one related instance: field id → value. */
type RelatedInstanceValues = Record<string, DeepReadonly<Value>>;

async function createRelatedGroupRecord(
  props: { descriptor: ReadonlyContentDescriptor; fields: ReadonlyPropertyField[]; items: ContentItem[] },
  options: RecordOptions,
): Promise<PropertyRecord | undefined> {
  const { descriptor, fields, items } = props;
  const pathFromTarget = fields[0].pathFromTarget;
  const values = items
    .filter((item) => fields.some((field) => appliesToItem(field, item)))
    .map((item) =>
      item
        .getRelatedInstances({ pathFromTarget })
        .map((relatedInstance): RelatedInstanceValues =>
          Object.fromEntries(fields.map((field) => [field.id, relatedInstance.getValue(field)])),
        )
        .filter(
          (relatedValues) =>
            options.includeEmptyValues || Object.values(relatedValues).some((value) => value !== undefined),
        ),
    );
  const categories: Partial<ReadonlyContentDescriptor["categories"]> = descriptor.categories;
  const categoryId = fields[0].categoryId;
  const elementType: DeepReadonly<ValueDescriptor> = {
    kind: "struct",
    members: fields.map((field) => ({ name: field.id, label: field.label, type: field.type })),
  };
  const recordProps: RecordProps = {
    name: `related(${fields[0].id})`,
    label:
      (categoryId !== undefined ? categories[categoryId]?.label : undefined) ??
      pathFromTarget[pathFromTarget.length - 1].targetClassName,
    type: { kind: "array", elementType },
    isReadonly: true,
  };
  return createMergedRecord({
    recordProps,
    values,
    isEmpty: (value) => value.length === 0,
    includeEmptyValues: options.includeEmptyValues,
    createRecord: async (relatedInstances) => {
      const structRecords = await Promise.all(
        relatedInstances.map(async (relatedValues, index) => {
          const members = await Promise.all(
            fields
              .filter((field) => options.includeEmptyValues || relatedValues[field.id] !== undefined)
              .map(async (field) => {
                const member = await createRecord(
                  {
                    name: field.id,
                    label: field.label,
                    type: field.type,
                    isReadonly: !!field.readOnly,
                    value: relatedValues[field.id],
                  },
                  options,
                );
                return [field.id, member] as const;
              }),
          );
          const structRecord = new PropertyRecord(
            { valueFormat: PropertyValueFormat.Struct, members: Object.fromEntries(members) },
            createDescription({ name: `[${index}]`, label: `[${index}]`, type: elementType }),
          );
          structRecord.isReadonly = true;
          return structRecord;
        }),
      );
      const record = new PropertyRecord(
        { valueFormat: PropertyValueFormat.Array, items: structRecords, itemsTypeName: StandardTypeNames.Struct },
        createDescription(recordProps),
      );
      record.isReadonly = true;
      return record;
    },
  });
}

async function createMergedRecord<TValue>(props: {
  recordProps: RecordProps;
  values: TValue[];
  isEmpty: (value: TValue) => boolean;
  includeEmptyValues: boolean;
  createRecord: (value: TValue) => Promise<PropertyRecord>;
}): Promise<PropertyRecord | undefined> {
  const { recordProps, values, isEmpty, includeEmptyValues, createRecord: create } = props;
  if (values.length === 0) {
    return undefined;
  }
  const [first, ...rest] = values;
  if (!rest.every((value) => deepEqual(value, first))) {
    const record = new PropertyRecord({ valueFormat: PropertyValueFormat.Primitive }, createDescription(recordProps));
    record.isMerged = true;
    record.isReadonly = recordProps.isReadonly;
    return record;
  }
  if (isEmpty(first) && !includeEmptyValues) {
    return undefined;
  }
  return create(first);
}

async function createRecord(
  props: RecordProps & { value: DeepReadonly<Value> },
  options: RecordOptions,
): Promise<PropertyRecord> {
  const { value, ...recordProps } = props;
  const record = new PropertyRecord(await createValue(recordProps, value, options), createDescription(recordProps));
  record.isReadonly = recordProps.isReadonly;
  return record;
}

async function createValue(
  parent: RecordProps,
  value: DeepReadonly<Value>,
  options: RecordOptions,
): Promise<PropertyValue> {
  const type = parent.type;
  switch (type.kind) {
    case "struct": {
      const structValue = (isPlainObject(value) ? value : {}) as DeepReadonly<Record<string, Value>>;
      const members = await Promise.all(
        type.members
          .filter((member) => options.includeEmptyValues || structValue[member.name] !== undefined)
          .map(async (member) => {
            const memberRecord = await createRecord(
              {
                name: member.name,
                label: member.label,
                type: member.type,
                isReadonly: parent.isReadonly,
                value: structValue[member.name],
              },
              options,
            );
            return [member.name, memberRecord] as const;
          }),
      );
      return { valueFormat: PropertyValueFormat.Struct, members: Object.fromEntries(members) };
    }
    case "array": {
      const elements = Array.isArray(value) ? (value as Array<DeepReadonly<Value>>) : [];
      const items = await Promise.all(
        elements.map(async (element, index) =>
          createRecord(
            {
              name: `[${index}]`,
              label: `[${index}]`,
              type: type.elementType,
              isReadonly: parent.isReadonly,
              value: element,
            },
            options,
          ),
        ),
      );
      return { valueFormat: PropertyValueFormat.Array, items, itemsTypeName: getTypeName(type.elementType) };
    }
    case "navigation": {
      if (!isNavigationValue(value)) {
        return {
          valueFormat: PropertyValueFormat.Primitive,
          displayValue: value === undefined ? "" : toDisplayString(value),
        };
      }
      return {
        valueFormat: PropertyValueFormat.Primitive,
        value: { className: value.key.className, id: value.key.id },
        displayValue: await formatConcatenatedValue({ value: value.label, valueFormatter: options.formatter }),
      };
    }
    case "primitive": {
      if (value === undefined) {
        return { valueFormat: PropertyValueFormat.Primitive, displayValue: "" };
      }
      const rawValue = value as DeepReadonly<PrimitiveValue>;
      return {
        valueFormat: PropertyValueFormat.Primitive,
        value: rawValue as PrimitiveValue,
        displayValue: await formatPrimitiveValue(type, rawValue, options.formatter),
      };
    }
  }
}

function createDescription(props: Pick<RecordProps, "name" | "label" | "type">): PropertyDescription {
  const { name, label, type } = props;
  const description: PropertyDescription = { name, displayLabel: label, typename: getTypeName(type) };
  if (type.kind === "primitive") {
    if (type.enumeration) {
      description.enum = {
        choices: type.enumeration.enumerators.map((enumerator) => ({
          label: enumerator.label,
          value: enumerator.value,
        })),
        isStrict: type.enumeration.isStrict,
      };
    }
    if (type.kindOfQuantity) {
      description.kindOfQuantityName = type.kindOfQuantity;
    }
  }
  return description;
}

function getTypeName(type: DeepReadonly<ValueDescriptor>): string {
  switch (type.kind) {
    case "struct":
      return StandardTypeNames.Struct;
    case "array":
      return StandardTypeNames.Array;
    case "navigation":
      return StandardTypeNames.Navigation;
    case "primitive":
      if (type.enumeration) {
        return StandardTypeNames.Enum;
      }
      switch (type.type) {
        case "Boolean":
          return StandardTypeNames.Boolean;
        case "DateTime":
          return StandardTypeNames.DateTime;
        case "Double":
          return StandardTypeNames.Double;
        case "Integer":
        case "Long":
          return StandardTypeNames.Int;
        case "Point2d":
          return StandardTypeNames.Point2d;
        case "Point3d":
          return StandardTypeNames.Point3d;
        case "Id":
        case "String":
          return StandardTypeNames.String;
      }
  }
}

async function formatPrimitiveValue(
  type: DeepReadonly<PrimitiveValueDescriptor>,
  value: DeepReadonly<PrimitiveValue>,
  formatter: IPrimitiveValueFormatter,
): Promise<string> {
  const enumerator = type.enumeration?.enumerators.find((candidate) => candidate.value === value);
  if (enumerator) {
    return enumerator.label;
  }
  let typedValue: TypedPrimitiveValue;
  try {
    typedValue = TypedPrimitiveValue.create(value, type.type, type.kindOfQuantity, type.extendedType);
  } catch {
    // The value doesn't match the declared type - show it as-is rather than failing the whole content.
    typedValue = { type: "String", value: toDisplayString(value) };
  }
  return formatter(typedValue);
}

function buildCategoryTree(props: {
  descriptor: ReadonlyContentDescriptor;
  records: Array<{ categoryId: string | undefined; record: PropertyRecord }>;
  defaultCategoryLabel: string;
}): { categories: PropertyCategory[]; recordsByCategory: PropertyData["records"] } {
  const { descriptor, records, defaultCategoryLabel } = props;
  const definitions: Partial<ReadonlyContentDescriptor["categories"]> = descriptor.categories;
  const roots: PropertyCategory[] = [];
  const recordsByCategory: PropertyData["records"] = {};
  const attached = new Map<string, PropertyCategory>();

  // Categories are attached when their first record (or a descendant's first record) is placed, which
  // orders them by their first record and leaves out categories without records.
  function attach(categoryId: string, visiting: Set<string>): PropertyCategory {
    const existing = attached.get(categoryId);
    if (existing) {
      return existing;
    }
    const definition = definitions[categoryId];
    const category: PropertyCategory = {
      name: definition ? definition.id : DEFAULT_CATEGORY_NAME,
      label: definition ? definition.label : defaultCategoryLabel,
      expand: true,
      childCategories: [],
    };
    recordsByCategory[category.name] = [];
    visiting.add(categoryId);
    const parentId = definition?.parentId;
    if (parentId !== undefined && definitions[parentId] && !visiting.has(parentId)) {
      attach(parentId, visiting).childCategories!.push(category);
    } else {
      roots.push(category);
    }
    attached.set(categoryId, category);
    return category;
  }

  for (const { categoryId, record } of records) {
    const id = categoryId !== undefined && definitions[categoryId] ? categoryId : DEFAULT_CATEGORY_NAME;
    recordsByCategory[attach(id, new Set()).name].push(record);
  }
  return { categories: roots, recordsByCategory };
}

function appliesToItem(field: ReadonlyField, item: ContentItem): boolean {
  return field.kind === "external" || field.primaryClassNames.includes(item.primaryKey.className);
}

function serializePath(path: DeepReadonly<RelationshipPath>) {
  return path.map((step) => [
    step.sourceClassName,
    step.relationshipName,
    !!step.relationshipReverse,
    step.targetClassName,
    step.instanceFilter ?? null,
  ]);
}

function isPlainObject(value: DeepReadonly<Value>): boolean {
  return typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function isNavigationValue(value: DeepReadonly<Value>): value is NavigationValue {
  return isPlainObject(value) && "key" in (value as object) && "label" in (value as object);
}

function toDisplayString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return value instanceof Date ? value.toISOString() : JSON.stringify(value);
}

/** Structural equality for raw values: primitives, `Date`s, arrays and plain objects. */
function deepEqual(lhs: unknown, rhs: unknown): boolean {
  if (lhs === rhs) {
    return true;
  }
  if (lhs instanceof Date || rhs instanceof Date) {
    return lhs instanceof Date && rhs instanceof Date && lhs.getTime() === rhs.getTime();
  }
  if (typeof lhs !== "object" || typeof rhs !== "object" || lhs === null || rhs === null) {
    return false;
  }
  if (Array.isArray(lhs) || Array.isArray(rhs)) {
    return (
      Array.isArray(lhs) &&
      Array.isArray(rhs) &&
      lhs.length === rhs.length &&
      lhs.every((element, index) => deepEqual(element, rhs[index]))
    );
  }
  const lhsRecord = lhs as Record<string, unknown>;
  const rhsRecord = rhs as Record<string, unknown>;
  const keys = new Set([...Object.keys(lhsRecord), ...Object.keys(rhsRecord)]);
  return [...keys].every((key) => deepEqual(lhsRecord[key], rhsRecord[key]));
}
