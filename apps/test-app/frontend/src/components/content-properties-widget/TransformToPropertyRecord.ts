/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyRecord, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { createDefaultContentTransformer } from "@itwin/presentation-content";
import { createDefaultValueFormatter, formatConcatenatedValue } from "@itwin/presentation-shared";

import type { PropertyDescription, PropertyValue } from "@itwin/appui-abstract";
import type { PropertyCategory, PropertyData } from "@itwin/components-react";
import type { CategoryDefinition, ContentRecords } from "@itwin/presentation-content";
import type { Content } from "@itwin/presentation-content-react";
import type { DeepReadonly, NavigationValue, PrimitiveValue, Value, ValueDescriptor } from "@itwin/presentation-shared";

const DEFAULT_CATEGORY: CategoryDefinition = { id: "/default-category/", label: "Miscellaneous" };

const transform = createDefaultContentTransformer();

const navigationLabelFormatter = createDefaultValueFormatter();

const labelCollator = new Intl.Collator(undefined, { sensitivity: "base" });

/** Maps content of the selected instances to `PropertyData` for the `PropertyGrid` component. */
export async function createPropertyData(content: Content): Promise<PropertyData> {
  const { categories, entries } = transform(content);
  const tree = createCategoryTree(categories);
  const records: PropertyData["records"] = {};
  for (const entry of entries) {
    const category = tree.get(entry.categoryId);
    (records[category.name] ??= []).push(await createEntryRecord(entry, categories));
  }
  for (const categoryRecords of Object.values(records)) {
    categoryRecords.sort((lhs, rhs) => labelCollator.compare(lhs.property.displayLabel, rhs.property.displayLabel));
  }
  const { items } = content;
  return {
    label: PropertyRecord.fromString(items.length === 1 ? items[0].primaryKey.className : `${items.length} instances`),
    categories: sortCategories(tree.roots),
    records,
  };
}

function sortCategories(categories: PropertyCategory[]): PropertyCategory[] {
  return categories
    .map((category) => ({ ...category, childCategories: sortCategories(category.childCategories ?? []) }))
    .sort((lhs, rhs) => labelCollator.compare(lhs.label, rhs.label));
}

interface RecordProps {
  name: string;
  label: string;
  type: DeepReadonly<ValueDescriptor>;
  value: DeepReadonly<Value>;
}

type ContentEntry = ContentRecords["entries"][number];

async function createEntryRecord(
  entry: ContentEntry,
  categories: ContentRecords["categories"],
): Promise<PropertyRecord> {
  const props = getEntryRecordProps(entry, categories);
  if (entry.isMerged) {
    const record = new PropertyRecord({ valueFormat: PropertyValueFormat.Primitive }, createDescription(props));
    record.isMerged = true;
    return record;
  }
  return createRecord(props);
}

function getEntryRecordProps(entry: ContentEntry, categories: ContentRecords["categories"]): RecordProps {
  // Unless the entry is merged, all items it applies to have equal values, and the rest have no values. So the first
  // available value represents all of them.
  if (entry.kind === "field") {
    const value = entry.values.find((itemValue) => itemValue !== undefined);
    return { name: entry.field.id, label: entry.field.label, type: entry.field.type, value };
  }
  // Related instances are shown as an array of structs, one struct per related instance.
  const { fields, pathFromTarget } = entry;
  const instances = entry.values.find((itemInstances) => itemInstances.length > 0) ?? [];
  return {
    name: `related(${fields[0].id})`,
    label:
      (entry.categoryId !== undefined ? categories[entry.categoryId]?.label : undefined) ??
      pathFromTarget[pathFromTarget.length - 1].targetClassName,
    type: {
      kind: "array",
      elementType: {
        kind: "struct",
        members: fields.map((field) => ({ name: field.id, label: field.label, type: field.type })),
      },
    },
    value: instances.map((instance) => instance.values),
  };
}

async function createRecord(props: RecordProps): Promise<PropertyRecord> {
  return new PropertyRecord(await createValue(props), createDescription(props));
}

async function createValue({ type, value }: RecordProps): Promise<PropertyValue> {
  switch (type.kind) {
    case "struct": {
      const struct = value as DeepReadonly<Record<string, Value>> | undefined;
      const members = await Promise.all(
        type.members.map(async (member) => {
          const record = await createRecord({ ...member, value: struct?.[member.name] });
          return [member.name, record] as const;
        }),
      );
      return { valueFormat: PropertyValueFormat.Struct, members: Object.fromEntries(members) };
    }
    case "array": {
      const elements = (value ?? []) as Array<DeepReadonly<Value>>;
      const items = await Promise.all(
        elements.map(async (element, index) =>
          createRecord({ name: `[${index}]`, label: `[${index}]`, type: type.elementType, value: element }),
        ),
      );
      return { valueFormat: PropertyValueFormat.Array, items, itemsTypeName: getTypeName(type.elementType) };
    }
    case "navigation": {
      const navigation = value as NavigationValue | undefined;
      return {
        valueFormat: PropertyValueFormat.Primitive,
        value: navigation?.key,
        displayValue: navigation
          ? await formatConcatenatedValue({ value: navigation.label, valueFormatter: navigationLabelFormatter })
          : "",
      };
    }
    case "primitive":
      return { valueFormat: PropertyValueFormat.Primitive, value: value as PrimitiveValue | undefined };
  }
}

function createDescription({ name, label, type }: Omit<RecordProps, "value">): PropertyDescription {
  const description: PropertyDescription = { name, displayLabel: label, typename: getTypeName(type) };
  if (type.kind === "primitive") {
    description.kindOfQuantityName = type.kindOfQuantity;
    if (type.enumeration) {
      description.enum = {
        choices: type.enumeration.enumerators.map(({ label: enumeratorLabel, value }) => ({
          label: enumeratorLabel,
          value,
        })),
        isStrict: type.enumeration.isStrict,
      };
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

/**
 * Creates property categories on demand, so that only categories with records (and their ancestors) end up in the
 * tree. The default category is the only root: it holds fields without a category, and categories without a parent.
 */
function createCategoryTree(definitions: Partial<ContentRecords["categories"]>) {
  const roots: PropertyCategory[] = [];
  const created = new Map<string, PropertyCategory>();
  function get(categoryId: string | undefined): PropertyCategory {
    const definition = (categoryId !== undefined ? definitions[categoryId] : undefined) ?? DEFAULT_CATEGORY;
    let category = created.get(definition.id);
    if (!category) {
      category = { name: definition.id, label: definition.label, expand: true, childCategories: [] };
      created.set(definition.id, category);
      (definition === DEFAULT_CATEGORY ? roots : get(definition.parentId).childCategories!).push(category);
    }
    return category;
  }
  return { roots, get };
}
