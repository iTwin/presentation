/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, DuplicatePolicy, Id64, SortedArray } from "@itwin/core-bentley";
import { CategoryDescription, createContentTraverser, Descriptor, ElementProperties, ElementPropertiesItem, ElementPropertiesPrimitiveArrayPropertyItem, ElementPropertiesPropertyItem, ElementPropertiesStructArrayPropertyItem, Field, IContentVisitor, Item, ProcessFieldHierarchiesProps, ProcessMergedValueProps, ProcessPrimitiveValueProps, PropertyValueFormat, StartArrayProps, StartCategoryProps, StartContentProps, StartFieldProps, StartItemProps, StartStructProps, Value } from "@itwin/presentation-common";

/** @internal */
export const createElementPropertiesBuilder = (): ((descriptor: Descriptor, item: Item) => ElementProperties) => {
  const builder = new ElementPropertiesBuilder();
  const traverseContent = createContentTraverser(builder);
  return (descriptor: Descriptor, item: Item) => {
    traverseContent(descriptor, [item]);
    return builder.items[0];
  };
};

interface IPropertiesAppender {
  append(label: string, item: ElementPropertiesItem): void;
  finish(): void;
}

class ElementPropertiesAppender implements IPropertiesAppender {
  private _propertyItems: { [label: string]: ElementPropertiesItem } = {};
  private _categoryItemAppenders: { [categoryName: string]: { category: CategoryDescription; appender: IPropertiesAppender } } = {};
  constructor(
    private _item: Item,
    private _onItemFinished: (item: ElementProperties) => void,
  ) {}

  public append(label: string, item: ElementPropertiesItem): void {
    this._propertyItems[label] = item;
  }

  public finish(): void {
    // create an ordered list of category depths / appenders starting with categories that have the most ancestors and finishing with categories
    // that have no ancestors, so that when we call `finish` on appenders, child categories are finished before parent categories, otherwise
    // we may skip parent categories, thinking they have no items
    const categoriesNestedToRoot = new SortedArray<{ categoryDepth: number; appender: IPropertiesAppender }>(
      (lhs, rhs) => rhs.categoryDepth - lhs.categoryDepth,
      DuplicatePolicy.Allow,
    );
    Object.entries(this._categoryItemAppenders).forEach(([_, { category, appender }]) => {
      categoriesNestedToRoot.insert({ categoryDepth: countAncestors(category), appender });
    });
    categoriesNestedToRoot.forEach(({ appender }) => appender.finish());

    this._onItemFinished({
      class: this._item.classInfo?.label ?? "",
      id: this._item.primaryKeys[0]?.id ?? Id64.invalid,
      label: this._item.label.displayValue,
      items: this._propertyItems,
    });
  }

  public getCategoryAppender(parentAppender: IPropertiesAppender, category: CategoryDescription): IPropertiesAppender {
    let entry = this._categoryItemAppenders[category.name];
    if (!entry) {
      entry = { category, appender: new CategoryItemAppender(parentAppender, category) };
      this._categoryItemAppenders[category.name] = entry;
    }
    return entry.appender;
  }
}

class CategoryItemAppender implements IPropertiesAppender {
  private _items: { [label: string]: ElementPropertiesItem } = {};
  constructor(
    private _parentAppender: IPropertiesAppender,
    private _category: CategoryDescription,
  ) {}
  public append(label: string, item: ElementPropertiesItem): void {
    this._items[label] = item;
  }
  public finish(): void {
    if (Object.keys(this._items).length === 0) {
      return;
    }

    this._parentAppender.append(this._category.label, {
      type: "category",
      items: this._items,
    });
  }
}

class ArrayItemAppender implements IPropertiesAppender {
  private _items: ElementPropertiesPropertyItem[] = [];
  constructor(
    private _parentAppender: IPropertiesAppender,
    private _props: StartArrayProps,
  ) {}
  public append(_label: string, item: ElementPropertiesItem): void {
    assert(item.type !== "category");
    this._items.push(item);
  }
  public finish(): void {
    assert(this._props.valueType.valueFormat === PropertyValueFormat.Array);
    if (this._props.valueType.memberType.valueFormat === PropertyValueFormat.Primitive) {
      this._parentAppender.append(getFieldLabel(this._props.hierarchy.field), this.createPrimitivesArray());
    } else {
      this._parentAppender.append(getFieldLabel(this._props.hierarchy.field), this.createStructsArray());
    }
  }
  private createPrimitivesArray(): ElementPropertiesPrimitiveArrayPropertyItem {
    return {
      type: "array",
      valueType: "primitive",
      values: this._items.map((item) => {
        assert(item.type === "primitive");
        return item.value;
      }),
    };
  }
  private createStructsArray(): ElementPropertiesStructArrayPropertyItem {
    return {
      type: "array",
      valueType: "struct",
      values: this._items.map((item) => {
        assert(item.type === "struct");
        return item.members;
      }),
    };
  }
}

class StructItemAppender implements IPropertiesAppender {
  private _members: { [label: string]: ElementPropertiesPropertyItem } = {};
  constructor(
    private _parentAppender: IPropertiesAppender,
    private _props: StartStructProps,
  ) {}
  public append(label: string, item: ElementPropertiesItem): void {
    assert(item.type !== "category");
    this._members[label] = item;
  }
  public finish(): void {
    assert(this._props.valueType.valueFormat === PropertyValueFormat.Struct);
    this._parentAppender.append(getFieldLabel(this._props.hierarchy.field), {
      type: "struct",
      members: this._members,
    });
  }
}

class ElementPropertiesBuilder implements IContentVisitor {
  private _appendersStack: IPropertiesAppender[] = [];
  private _items: ElementProperties[] = [];
  private _elementPropertiesAppender: ElementPropertiesAppender | undefined;

  public get items(): ElementProperties[] {
    return this._items;
  }

  private get _currentAppender(): IPropertiesAppender {
    const appender = this._appendersStack[this._appendersStack.length - 1];
    assert(appender !== undefined);
    return appender;
  }

  public startContent(_props: StartContentProps): boolean {
    this._appendersStack = [];
    this._items = [];
    this._elementPropertiesAppender = undefined;
    return true;
  }
  public finishContent(): void {}

  public processFieldHierarchies(_props: ProcessFieldHierarchiesProps): void {}

  public startItem(props: StartItemProps): boolean {
    this._elementPropertiesAppender = new ElementPropertiesAppender(props.item, (item) => this._items.push(item));
    this._appendersStack.push(this._elementPropertiesAppender);
    return true;
  }
  public finishItem(): void {
    this._appendersStack.pop();
    assert(this._elementPropertiesAppender !== undefined);
    this._elementPropertiesAppender.finish();
    this._elementPropertiesAppender = undefined;
  }

  public startCategory(props: StartCategoryProps): boolean {
    assert(this._elementPropertiesAppender !== undefined);
    this._appendersStack.push(this._elementPropertiesAppender.getCategoryAppender(this._currentAppender, props.category));
    return true;
  }
  public finishCategory(): void {
    this._appendersStack.pop();
  }

  public startField(_props: StartFieldProps): boolean {
    return true;
  }
  public finishField(): void {}

  public startStruct(props: StartStructProps): boolean {
    this._appendersStack.push(new StructItemAppender(this._currentAppender, props));
    return true;
  }
  public finishStruct(): void {
    this._appendersStack.pop()!.finish();
  }

  public startArray(props: StartArrayProps): boolean {
    this._appendersStack.push(new ArrayItemAppender(this._currentAppender, props));
    return true;
  }
  public finishArray(): void {
    this._appendersStack.pop()!.finish();
  }

  public processMergedValue(props: ProcessMergedValueProps): void {
    this._currentAppender.append(getFieldLabel(props.mergedField), {
      type: "primitive",
      value: "",
    });
  }
  public processPrimitiveValue(props: ProcessPrimitiveValueProps): void {
    const label = getFieldLabel(props.field)
    this._currentAppender.append(label, {
      type: "primitive",
      value: rawValueToString(props.rawValue),
    });
  }
}

function countAncestors<T extends { parent?: T }>(child: T): number {
  return child.parent ? 1 + countAncestors(child.parent) : 0;
}

function getFieldLabel(field: Field) {
  return field.isPropertiesField() ? field.properties[0].property.name : field.label;
}

function rawValueToString(value: Value): string {
  if (Value.isPrimitive(value)) {
    return value?.toString() ?? "";
  }

  if (Value.isNavigationValue(value)) {
    return `${value.className}-${value.id}`;
  }

  if (Value.isArray(value)) {
    return value.map((v) => rawValueToString(v)).join(", ");
  }

  if (Value.isMap(value)) {
    return Object.entries(value).map(([key, val]) => `${key}: ${rawValueToString(val)}`).join(", ");
  }
  return "";
}
