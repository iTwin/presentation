/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  CategoryDescription,
  ClassInfo,
  Descriptor,
  DescriptorSource,
  DisplayValuesMap,
  EditorDescription,
  Field,
  InstanceKey,
  Item,
  LabelDefinition,
  NestedContentField,
  PropertiesField,
  Property,
  PropertyValueFormat,
  RelationshipMeaning,
  RelationshipPath,
  RendererDescription,
  SelectClassInfo,
  StructTypeDescription,
  TypeDescription,
  ValuesMap,
} from "@itwin/presentation-common";
import { createTestECClassInfo, createTestECInstanceKey, createTestRelationshipPath } from "./Common.js";

// cspell:words Parentship

export const createTestCategoryDescription = (props?: Partial<CategoryDescription>) => ({
  name: "test-category",
  label: "Test Category",
  description: "Test category description",
  priority: 0,
  expand: false,
  ...props,
});

export const createTestSelectClassInfo = (props?: Partial<SelectClassInfo>) => ({
  selectClassInfo: createTestECClassInfo(),
  isSelectPolymorphic: false,
  ...props,
});

export function createTestSimpleContentField(props?: {
  category?: CategoryDescription;
  type?: TypeDescription;
  name?: string;
  label?: string;
  isReadonly?: boolean;
  priority?: number;
  editor?: EditorDescription;
  renderer?: RendererDescription;
}) {
  return new Field({
    ...props,
    category: props?.category ?? createTestCategoryDescription(),
    name: props?.name ?? "SimpleField",
    label: props?.label ?? "Simple Field",
    type: props?.type ?? { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
    isReadonly: props?.isReadonly ?? false,
    priority: props?.priority ?? 0,
  });
}

export function createTestPropertiesContentField(props: {
  properties: Property[];
  category?: CategoryDescription;
  type?: TypeDescription;
  name?: string;
  label?: string;
  isReadonly?: boolean;
  priority?: number;
  editor?: EditorDescription;
  renderer?: RendererDescription;
}) {
  return new PropertiesField({
    ...props,
    category: props.category ?? createTestCategoryDescription(),
    name: props.name ?? "PropertiesField",
    label: props.label ?? "Properties Field",
    type: props.type ?? { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
    isReadonly: props.isReadonly ?? false,
    priority: props.priority ?? 0,
  });
}

export function createTestNestedContentField(props: {
  nestedFields: Field[];
  category?: CategoryDescription;
  name?: string;
  label?: string;
  isReadonly?: boolean;
  priority?: number;
  contentClassInfo?: ClassInfo;
  pathToPrimaryClass?: RelationshipPath;
  autoExpand?: boolean;
  editor?: EditorDescription;
  renderer?: RendererDescription;
  relationshipMeaning?: RelationshipMeaning;
}) {
  const nestedContentFieldType: StructTypeDescription = {
    valueFormat: PropertyValueFormat.Struct,
    typeName: "NestedContentFieldType",
    members: props.nestedFields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
    })),
  };
  const field = new NestedContentField({
    category: props.category ?? createTestCategoryDescription(),
    name: props.name ?? "NestedContentField",
    label: props.label ?? "Nested Content",
    type: nestedContentFieldType,
    isReadonly: props.isReadonly ?? false,
    priority: props.priority ?? 0,
    contentClassInfo: props.contentClassInfo ?? createTestECClassInfo(),
    pathToPrimaryClass: props.pathToPrimaryClass ?? createTestRelationshipPath(1),
    nestedFields: props.nestedFields,
    editor: props.editor,
    autoExpand: !!props.autoExpand,
    renderer: props.renderer,
  });
  if (props.relationshipMeaning) {
    field.relationshipMeaning = props.relationshipMeaning;
  }
  field.rebuildParentship();
  return field;
}

export function createTestContentDescriptor(props: Partial<DescriptorSource> & { fields: Field[] }) {
  return new Descriptor({
    connectionId: "",
    displayType: "",
    contentFlags: 0,
    selectClasses: [createTestSelectClassInfo()],
    categories: [createTestCategoryDescription()],
    ...props,
  });
}

export function createTestContentItem(props: {
  primaryKeys?: InstanceKey[];
  label?: LabelDefinition | string;
  imageId?: string;
  classInfo?: ClassInfo;
  values: ValuesMap;
  displayValues: DisplayValuesMap;
  mergedFieldNames?: string[];
  extendedData?: { [key: string]: any };
}) {
  return new Item({
    ...props,
    primaryKeys: props.primaryKeys ?? [createTestECInstanceKey()],
    label: props.label && typeof props.label !== "string" ? props.label : LabelDefinition.fromLabelString(props.label ?? ""),
    mergedFieldNames: props.mergedFieldNames ?? [],
  });
}
