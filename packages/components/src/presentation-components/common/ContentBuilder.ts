/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { inPlaceSort } from "fast-sort";
import {
  ArrayValue,
  PrimitiveValue,
  PropertyDescription,
  PropertyEditorInfo,
  PropertyRecord,
  StandardTypeNames,
  StructValue,
  PropertyValueFormat as UiPropertyValueFormat,
} from "@itwin/appui-abstract";
import { assert } from "@itwin/core-bentley";
import {
  combineFieldNames,
  EditorDescription,
  EnumerationInfo,
  Field,
  FieldHierarchy,
  IContentVisitor,
  Item,
  LabelDefinition,
  PropertyValueFormat as PresentationPropertyValueFormat,
  ProcessFieldHierarchiesProps,
  ProcessMergedValueProps,
  ProcessPrimitiveValueProps,
  PropertyInfo,
  RendererDescription,
  StartArrayProps,
  StartCategoryProps,
  StartContentProps,
  StartFieldProps,
  StartItemProps,
  StartStructProps,
  TypeDescription,
} from "@itwin/presentation-common";
import { NumericEditorName } from "../properties/editors/NumericPropertyEditor.js";
import { QuantityEditorName } from "../properties/editors/QuantityPropertyEditor.js";
import { WithIModelKey } from "./Utils.js";

/**
 * This is merely a copy of `PropertyValueConstraints` from @itwin/presentation-common package to support pre-5.0 version.
 * @public
 */
export type PropertyValueConstraints =
  | {
      minimumLength?: number;
      maximumLength?: number;
    }
  | {
      minimumValue?: number;
      maximumValue?: number;
    }
  | {
      minOccurs?: number;
      maxOccurs?: number;
    };

/**
 * Expands specified type with additional constraints property.
 * @public
 */
export type WithConstraints<T extends {}> = T & { constraints?: PropertyValueConstraints };

/** @internal */
export interface FieldInfo {
  type: TypeDescription;
  name: string;
  label: string;
  renderer?: RendererDescription;
  editor?: EditorDescription;
  enum?: EnumerationInfo;
  isReadonly?: boolean;
  koqName?: string;
  constraints?: PropertyValueConstraints;
}

/** @internal */
export function createFieldInfo(field: Field, parentFieldName?: string): FieldInfo {
  const property: undefined | WithConstraints<PropertyInfo> = field.isPropertiesField() ? field.properties[0].property : undefined;
  return {
    name: combineFieldNames(field.name, parentFieldName),
    type: field.isNestedContentField() ? field.type : { ...field.type, typeName: field.type.typeName.toLowerCase() },
    label: field.label,
    isReadonly: field.isReadonly,
    editor: field.editor,
    renderer: field.renderer,
    enum: property?.enumerationInfo,
    koqName: property?.kindOfQuantity?.name,
    constraints: property?.constraints,
  };
}

/** @internal */
export function createPropertyDescriptionFromFieldInfo(info: FieldInfo) {
  const description: WithConstraints<PropertyDescription> = {
    typename: info.type.typeName,
    name: info.name,
    displayLabel: info.label,
  };

  if (info.renderer) {
    description.renderer = { name: info.renderer.name };
  }

  if (info.editor) {
    description.editor = { name: info.editor.name } as PropertyEditorInfo;
  }

  if (info.koqName) {
    description.kindOfQuantityName = info.koqName;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    description.quantityType = info.koqName;
    description.editor = { name: QuantityEditorName, ...description.editor };
  }

  if (info.constraints) {
    description.constraints = info.constraints;
  }

  if (
    description.typename === StandardTypeNames.Number ||
    description.typename === StandardTypeNames.Int ||
    description.typename === StandardTypeNames.Float ||
    description.typename === StandardTypeNames.Double
  ) {
    description.editor = { name: NumericEditorName, ...description.editor };
  }

  if (info.type.valueFormat === PresentationPropertyValueFormat.Primitive && info.enum) {
    description.enum = {
      choices: info.enum.choices,
      isStrict: info.enum.isStrict,
    };
  }
  return description;
}

/** @internal */
export interface FieldHierarchyRecord {
  record: PropertyRecord;
  fieldHierarchy: FieldHierarchy;
}

/** @internal */
export interface IPropertiesAppender {
  append(record: FieldHierarchyRecord): void;
}
/** @internal */
export interface IRootPropertiesAppender extends IPropertiesAppender {
  item: Item;
}
/** @internal */
export interface INestedPropertiesAppender extends IPropertiesAppender {
  finish(): void;
}
/** @internal */
export namespace IPropertiesAppender {
  export function isRoot(appender: IPropertiesAppender): appender is IRootPropertiesAppender {
    return (appender as IRootPropertiesAppender).item !== undefined;
  }
  export function isNested(appender: IPropertiesAppender): appender is INestedPropertiesAppender {
    return (appender as INestedPropertiesAppender).finish !== undefined;
  }
}
class StructMembersAppender implements INestedPropertiesAppender {
  private _members: { [name: string]: PropertyRecord } = {};
  // eslint-disable-next-line @typescript-eslint/unbound-method
  private _labelsComparer = new Intl.Collator(undefined, { sensitivity: "base" }).compare;
  constructor(
    private _parentAppender: IPropertiesAppender,
    private _fieldHierarchy: FieldHierarchy,
    private _fieldInfo: FieldInfo,
    private _label?: LabelDefinition,
    private _propertyRecordsProcessor?: (record: PropertyRecord) => void,
  ) {}
  public append(record: FieldHierarchyRecord): void {
    this._members[record.fieldHierarchy.field.name] = record.record;
  }
  public finish(): void {
    const properties = Object.entries(this._members);
    inPlaceSort(properties).by([{ asc: (p) => p[1].property.displayLabel, comparer: this._labelsComparer }]);
    const value: StructValue = {
      valueFormat: UiPropertyValueFormat.Struct,
      members: Object.fromEntries(properties),
    };
    const record = new PropertyRecord(value, createPropertyDescriptionFromFieldInfo(this._fieldInfo));
    const displayLabel = this._label?.displayValue;
    applyPropertyRecordAttributes(
      record,
      this._fieldHierarchy.field,
      displayLabel === "@Presentation:label.notSpecified@" ? undefined : displayLabel,
      IPropertiesAppender.isRoot(this._parentAppender) ? this._parentAppender.item.extendedData : undefined,
      this._propertyRecordsProcessor,
    );
    this._parentAppender.append({ record, fieldHierarchy: this._fieldHierarchy });
  }
}
class ArrayItemsAppender implements INestedPropertiesAppender {
  private _items: PropertyRecord[] = [];
  constructor(
    private _parentAppender: IPropertiesAppender,
    private _fieldHierarchy: FieldHierarchy,
    private _fieldInfo: FieldInfo,
    private _propertyRecordsProcessor?: (record: PropertyRecord) => void,
  ) {}
  public append(record: FieldHierarchyRecord): void {
    this._items.push(record.record);
  }
  public finish(): void {
    assert(this._fieldHierarchy.field.type.valueFormat === PresentationPropertyValueFormat.Array);
    const value: ArrayValue = {
      valueFormat: UiPropertyValueFormat.Array,
      itemsTypeName: this._fieldHierarchy.field.type.memberType.typeName,
      items: this._items,
    };
    const record = new PropertyRecord(value, createPropertyDescriptionFromFieldInfo(this._fieldInfo));
    applyPropertyRecordAttributes(
      record,
      this._fieldHierarchy.field,
      undefined,
      IPropertiesAppender.isRoot(this._parentAppender) ? this._parentAppender.item.extendedData : undefined,
      this._propertyRecordsProcessor,
    );
    this._parentAppender.append({ record, fieldHierarchy: this._fieldHierarchy });
  }
}

/** @internal */
export class InternalPropertyRecordsBuilder implements IContentVisitor {
  private _appendersStack: Array<IPropertiesAppender> = [];
  private _rootAppenderFactory: (item: Item) => IRootPropertiesAppender;
  private _propertyRecordsProcessor?: (record: PropertyRecord) => void;

  public constructor(rootPropertiesAppenderFactory: (item: Item) => IRootPropertiesAppender, propertyRecordsProcessor?: (record: PropertyRecord) => void) {
    this._rootAppenderFactory = rootPropertiesAppenderFactory;
    this._propertyRecordsProcessor = propertyRecordsProcessor;
  }

  protected get currentPropertiesAppender(): IPropertiesAppender {
    const appender = this._appendersStack[this._appendersStack.length - 1];
    assert(appender !== undefined);
    return appender;
  }

  public startContent(_props: StartContentProps): boolean {
    return true;
  }
  public finishContent(): void {}

  public startItem(props: StartItemProps): boolean {
    const appender = this._rootAppenderFactory(props.item);
    this._appendersStack.push(appender);
    return true;
  }
  public finishItem(): void {}

  public processFieldHierarchies(_props: ProcessFieldHierarchiesProps): void {}

  public startCategory(_props: StartCategoryProps): boolean {
    return true;
  }
  public finishCategory(): void {}

  public startField(_props: StartFieldProps): boolean {
    return true;
  }
  public finishField(): void {}

  public startStruct(props: StartStructProps): boolean {
    const fieldInfo = {
      ...createFieldInfo(props.hierarchy.field, props.parentFieldName),
      type: props.valueType,
    };
    this._appendersStack.push(
      new StructMembersAppender(this.currentPropertiesAppender, props.hierarchy, fieldInfo, props.label, this._propertyRecordsProcessor),
    );
    return true;
  }
  public finishStruct(): void {
    const appender = this._appendersStack.pop();
    assert(!!appender && IPropertiesAppender.isNested(appender));
    appender.finish();
  }

  public startArray(props: StartArrayProps): boolean {
    this._appendersStack.push(
      new ArrayItemsAppender(
        this.currentPropertiesAppender,
        props.hierarchy,
        {
          ...createFieldInfo(props.hierarchy.field, props.parentFieldName),
          type: props.valueType,
        },
        this._propertyRecordsProcessor,
      ),
    );
    return true;
  }
  public finishArray(): void {
    const appender = this._appendersStack.pop();
    assert(!!appender && IPropertiesAppender.isNested(appender));
    appender.finish();
  }

  public processMergedValue(props: ProcessMergedValueProps): void {
    const propertyField = props.requestedField;
    const value: PrimitiveValue = {
      valueFormat: UiPropertyValueFormat.Primitive,
    };
    const record = new PropertyRecord(value, createPropertyDescriptionFromFieldInfo(createFieldInfo(propertyField, props.parentFieldName)));
    record.isMerged = true;
    record.isReadonly = true;
    record.autoExpand = propertyField.isNestedContentField() && propertyField.autoExpand;
    this._propertyRecordsProcessor?.(record);
    this.currentPropertiesAppender.append({ record, fieldHierarchy: { field: propertyField, childFields: [] } });
  }

  public processPrimitiveValue(props: ProcessPrimitiveValueProps): void {
    const appender = this.currentPropertiesAppender;
    const value: PrimitiveValue = {
      valueFormat: UiPropertyValueFormat.Primitive,
      value: props.rawValue,
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      displayValue: props.displayValue?.toString() ?? "",
    };
    const record = new PropertyRecord(
      value,
      createPropertyDescriptionFromFieldInfo({ ...createFieldInfo(props.field, props.parentFieldName), type: props.valueType }),
    );
    applyPropertyRecordAttributes(
      record,
      props.field,
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      props.displayValue?.toString(),
      IPropertiesAppender.isRoot(appender) ? appender.item.extendedData : undefined,
      this._propertyRecordsProcessor,
    );
    appender.append({ record, fieldHierarchy: { field: props.field, childFields: [] } });
  }
}

function applyPropertyRecordAttributes(
  record: WithIModelKey<PropertyRecord>,
  field: Field,
  displayValue: string | undefined,
  extendedData: typeof Item.prototype.extendedData | undefined,
  propertyRecordsProcessor?: (record: PropertyRecord) => void,
) {
  if (displayValue) {
    record.description = displayValue.toString();
  }
  if (field.isReadonly || (field.isNestedContentField() && record.value.valueFormat === UiPropertyValueFormat.Array)) {
    record.isReadonly = true;
  }
  if (field.isNestedContentField() && field.autoExpand) {
    record.autoExpand = true;
  }
  if (extendedData) {
    record.extendedData = extendedData;
  }
  propertyRecordsProcessor?.(record);
}
