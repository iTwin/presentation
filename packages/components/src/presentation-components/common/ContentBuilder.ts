/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
  PropertyValueFormat as PresentationPropertyValueFormat,
  ProcessFieldHierarchiesProps,
  ProcessMergedValueProps,
  ProcessPrimitiveValueProps,
  RendererDescription,
  StartArrayProps,
  StartCategoryProps,
  StartContentProps,
  StartFieldProps,
  StartItemProps,
  StartStructProps,
  TypeDescription,
} from "@itwin/presentation-common";
import { NumericEditorName } from "../properties/editors/NumericPropertyEditor";
import { QuantityEditorName } from "../properties/editors/QuantityPropertyEditor";
import { inPlaceSort } from "fast-sort";

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
}

function createFieldInfo(field: Field, parentFieldName?: string) {
  return {
    type: field.isNestedContentField() ? field.type : { ...field.type, typeName: field.type.typeName.toLowerCase() },
    name: combineFieldNames(field.name, parentFieldName),
    label: field.label,
    editor: field.editor,
    renderer: field.renderer,
    enum: field.isPropertiesField() ? field.properties[0].property.enumerationInfo : undefined,
    koqName: field.isPropertiesField() ? field.properties[0].property.kindOfQuantity?.name : undefined,
  };
}

/** @internal */
export function createPropertyDescriptionFromFieldInfo(info: FieldInfo) {
  const descr: PropertyDescription = {
    typename: info.type.typeName,
    name: info.name,
    displayLabel: info.label,
  };

  if (info.renderer) {
    descr.renderer = { name: info.renderer.name };
  }

  if (info.editor) {
    descr.editor = { name: info.editor.name } as PropertyEditorInfo;
  }

  if (info.koqName) {
    descr.quantityType = info.koqName;
    descr.editor = { name: QuantityEditorName, ...descr.editor };
  }

  if (
    descr.typename === StandardTypeNames.Number ||
    descr.typename === StandardTypeNames.Int ||
    descr.typename === StandardTypeNames.Float ||
    descr.typename === StandardTypeNames.Double
  ) {
    descr.editor = { name: NumericEditorName, ...descr.editor };
  }

  if (info.type.valueFormat === PresentationPropertyValueFormat.Primitive && info.enum) {
    descr.enum = {
      choices: info.enum.choices,
      isStrict: info.enum.isStrict,
    };
  }
  return descr;
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
  private _labelsComparer = new Intl.Collator(undefined, { sensitivity: "base" }).compare;
  constructor(
    private _parentAppender: IPropertiesAppender,
    private _fieldHierarchy: FieldHierarchy,
    private _fieldInfo: FieldInfo,
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
    applyPropertyRecordAttributes(
      record,
      this._fieldHierarchy.field,
      undefined,
      IPropertiesAppender.isRoot(this._parentAppender) ? this._parentAppender.item.extendedData : undefined,
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
    );
    this._parentAppender.append({ record, fieldHierarchy: this._fieldHierarchy });
  }
}

/** @internal */
export class InternalPropertyRecordsBuilder implements IContentVisitor {
  private _appendersStack: Array<IPropertiesAppender> = [];
  private _rootAppenderFactory: (item: Item) => IRootPropertiesAppender;

  public constructor(rootPropertiesAppenderFactory: (item: Item) => IRootPropertiesAppender) {
    this._rootAppenderFactory = rootPropertiesAppenderFactory;
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
    this._appendersStack.push(
      new StructMembersAppender(this.currentPropertiesAppender, props.hierarchy, {
        ...createFieldInfo(props.hierarchy.field, props.parentFieldName),
        type: props.valueType,
      }),
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
      new ArrayItemsAppender(this.currentPropertiesAppender, props.hierarchy, {
        ...createFieldInfo(props.hierarchy.field, props.parentFieldName),
        type: props.valueType,
      }),
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
    this.currentPropertiesAppender.append({ record, fieldHierarchy: { field: propertyField, childFields: [] } });
  }

  public processPrimitiveValue(props: ProcessPrimitiveValueProps): void {
    const appender = this.currentPropertiesAppender;
    const value: PrimitiveValue = {
      valueFormat: UiPropertyValueFormat.Primitive,
      value: props.rawValue,
      displayValue: props.displayValue?.toString() ?? "",
    };
    const record = new PropertyRecord(
      value,
      createPropertyDescriptionFromFieldInfo({ ...createFieldInfo(props.field, props.parentFieldName), type: props.valueType }),
    );
    applyPropertyRecordAttributes(
      record,
      props.field,
      props.displayValue?.toString(),
      IPropertiesAppender.isRoot(appender) ? appender.item.extendedData : undefined,
    );
    appender.append({ record, fieldHierarchy: { field: props.field, childFields: [] } });
  }
}

function applyPropertyRecordAttributes(
  record: PropertyRecord,
  field: Field,
  displayValue: string | undefined,
  extendedData: typeof Item.prototype.extendedData | undefined,
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
}
