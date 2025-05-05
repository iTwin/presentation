/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import {
  ECClass as CoreClass,
  EntityClass as CoreEntityClass,
  Enumeration as CoreEnumeration,
  EnumerationArrayProperty as CoreEnumerationArrayProperty,
  EnumerationProperty as CoreEnumerationProperty,
  KindOfQuantity as CoreKindOfQuantity,
  Mixin as CoreMixin,
  NavigationProperty as CoreNavigationProperty,
  PrimitiveArrayProperty as CorePrimitiveArrayProperty,
  PrimitiveProperty as CorePrimitiveProperty,
  Property as CoreProperty,
  RelationshipClass as CoreRelationshipClass,
  RelationshipConstraint as CoreRelationshipConstraint,
  Schema as CoreSchema,
  SchemaItem as CoreSchemaItem,
  StructArrayProperty as CoreStructArrayProperty,
  StructClass as CoreStructClass,
  StructProperty as CoreStructProperty,
  LazyLoadedSchemaItem,
  PrimitiveType,
  SchemaItemType,
  StrengthDirection,
} from "@itwin/ecschema-metadata";
import * as ecschemaMetadata from "@itwin/ecschema-metadata";
import { EC } from "@itwin/presentation-shared";

/** @internal */
export function createECSchema(schema: CoreSchema): EC.Schema {
  return {
    name: schema.name,
    async getClass(name) {
      // TODO: replace with `schema.getItem(name, CoreClass)` when itwinjs-core 4.x is dropped
      const item = await schema.getItem(name);
      return item ? createECClass(item as CoreClass, this) : undefined;
    },
  };
}

abstract class ECSchemaItemImpl<TCoreSchemaItem extends CoreSchemaItem> implements EC.SchemaItem {
  private _schema: EC.Schema;
  protected constructor(
    protected _coreSchemaItem: TCoreSchemaItem,
    schema?: EC.Schema,
  ) {
    this._schema = schema ?? createECSchema(this._coreSchemaItem.schema);
  }
  public get schema() {
    return this._schema;
  }
  public get fullName() {
    return this._coreSchemaItem.fullName;
  }
  public get name() {
    return this._coreSchemaItem.name;
  }
  public get label() {
    return this._coreSchemaItem.label;
  }
}

/** @internal */
export function createECClass(coreClass: CoreClass, schema?: EC.Schema): EC.Class {
  switch (coreClass.schemaItemType) {
    case SchemaItemType.EntityClass:
      return new ECEntityClassImpl(coreClass as CoreEntityClass, schema);
    case SchemaItemType.RelationshipClass:
      return new ECRelationshipClassImpl(coreClass as CoreRelationshipClass, schema);
    case SchemaItemType.StructClass:
      return new ECStructClassImpl(coreClass as CoreStructClass, schema);
    case SchemaItemType.Mixin:
      return new ECMixinImpl(coreClass as CoreMixin, schema);
  }
  throw new Error(`Invalid class type "${coreClass.schemaItemType}" for class ${coreClass.fullName}`);
}

abstract class ECClassImpl<TCoreClass extends CoreClass> extends ECSchemaItemImpl<TCoreClass> implements EC.Class {
  protected constructor(coreClass: TCoreClass, schema?: EC.Schema) {
    super(coreClass, schema);
  }
  public isEntityClass(): this is EC.EntityClass {
    return false;
  }
  public isRelationshipClass(): this is EC.RelationshipClass {
    return false;
  }
  public isStructClass(): this is EC.StructClass {
    return false;
  }
  public isMixin(): this is EC.Mixin {
    return false;
  }
  public async is(classOrClassName: EC.Class | string, schemaName?: string) {
    if (typeof classOrClassName === "string") {
      return this._coreSchemaItem.is(classOrClassName, schemaName!);
    }
    return this._coreSchemaItem.is(classOrClassName.name, classOrClassName.schema.name);
  }
  public async getProperty(name: string): Promise<EC.Property | undefined> {
    const coreProperty = await this._coreSchemaItem.getProperty(
      name,
      // `SchemaFormatsProvider` was introduced around the same time the meaning of this second argument was changed
      // from `includeInherited` to `excludeInherited` - we're using its existence to determine what we need to pass to get
      // inherited properties
      ecschemaMetadata.SchemaFormatsProvider ? false : true,
    );
    return coreProperty ? createECProperty(coreProperty, this) : undefined;
  }
  public async getProperties(): Promise<Array<EC.Property>> {
    const coreProperties = await this._coreSchemaItem.getProperties();
    const result = new Array<EC.Property>();
    for (const coreProperty of coreProperties) {
      result.push(createECProperty(coreProperty, this));
    }
    return result;
  }
}

class ECEntityClassImpl extends ECClassImpl<CoreEntityClass> implements EC.EntityClass {
  constructor(coreClass: CoreEntityClass, schema?: EC.Schema) {
    super(coreClass, schema);
  }
  public override isEntityClass(): this is EC.EntityClass {
    return true;
  }
}

class ECRelationshipClassImpl extends ECClassImpl<CoreRelationshipClass> implements EC.RelationshipClass {
  constructor(coreClass: CoreRelationshipClass, schema?: EC.Schema) {
    super(coreClass, schema);
  }
  public override isRelationshipClass(): this is EC.RelationshipClass {
    return true;
  }
  public get direction() {
    switch (this._coreSchemaItem.strengthDirection) {
      case StrengthDirection.Forward:
        return "Forward";
      case StrengthDirection.Backward:
        return "Backward";
    }
  }
  public get source() {
    return new ECRelationshipConstraintImpl(this._coreSchemaItem.source, this.schema);
  }
  public get target() {
    return new ECRelationshipConstraintImpl(this._coreSchemaItem.target, this.schema);
  }
}

class ECStructClassImpl extends ECClassImpl<CoreStructClass> implements EC.StructClass {
  constructor(coreClass: CoreStructClass, schema?: EC.Schema) {
    super(coreClass, schema);
  }
  public override isStructClass(): this is EC.StructClass {
    return true;
  }
}

class ECMixinImpl extends ECClassImpl<CoreMixin> implements EC.Mixin {
  constructor(coreClass: CoreMixin, schema?: EC.Schema) {
    super(coreClass, schema);
  }
  public override isMixin(): this is EC.Mixin {
    return true;
  }
}

/** @internal */
export function createECProperty(coreProperty: CoreProperty, ecClass: EC.Class): EC.Property {
  if (coreProperty.isArray()) {
    if (coreProperty.isPrimitive()) {
      return new ECPrimitivesArrayPropertyImpl(coreProperty, ecClass);
    }
    if (coreProperty.isEnumeration()) {
      return new ECEnumerationArrayPropertyImpl(coreProperty, ecClass);
    }
    return new ECStructArrayPropertyImpl(coreProperty, ecClass);
  }
  if (coreProperty.isStruct()) {
    return new ECStructPropertyImpl(coreProperty, ecClass);
  }
  if (coreProperty.isEnumeration()) {
    return new ECEnumerationPropertyImpl(coreProperty, ecClass);
  }
  if (coreProperty.isNavigation()) {
    return new ECNavigationPropertyImpl(coreProperty, ecClass);
  }
  assert(coreProperty.isPrimitive());
  return new ECPrimitivePropertyImpl(coreProperty, ecClass);
}

abstract class ECPropertyImpl<TCoreProperty extends CoreProperty> implements EC.Property {
  protected constructor(
    protected _coreProperty: TCoreProperty,
    protected _class: EC.Class,
  ) {}
  public isArray(): this is EC.ArrayProperty {
    return false;
  }
  public isStruct(): this is EC.StructProperty {
    return false;
  }
  public isPrimitive(): this is EC.PrimitiveProperty {
    return false;
  }
  public isEnumeration(): this is EC.EnumerationProperty {
    return false;
  }
  public isNavigation(): this is EC.NavigationProperty {
    return false;
  }
  public get class() {
    return this._class;
  }
  public get name() {
    return this._coreProperty.name;
  }
  public get label() {
    return this._coreProperty.label;
  }
  public get kindOfQuantity(): Promise<EC.KindOfQuantity | undefined> {
    return createFromOptionalLazyLoaded(this._coreProperty.kindOfQuantity, (coreKindOfQuantity) => new ECKindOfQuantityImpl(coreKindOfQuantity));
  }
}

class ECPrimitivePropertyImpl<TCoreProperty extends CorePrimitiveProperty> extends ECPropertyImpl<TCoreProperty> implements EC.PrimitiveProperty {
  constructor(coreProperty: TCoreProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isPrimitive(): this is EC.PrimitiveProperty {
    return true;
  }
  public get extendedTypeName() {
    return this._coreProperty.extendedTypeName;
  }
  public get primitiveType() {
    switch (this._coreProperty.primitiveType) {
      case PrimitiveType.Binary:
        return "Binary";
      case PrimitiveType.Boolean:
        return "Boolean";
      case PrimitiveType.DateTime:
        return "DateTime";
      case PrimitiveType.Double:
        return "Double";
      case PrimitiveType.IGeometry:
        return "IGeometry";
      case PrimitiveType.Integer:
        return "Integer";
      case PrimitiveType.Long:
        return "Long";
      case PrimitiveType.Point2d:
        return "Point2d";
      case PrimitiveType.Point3d:
        return "Point3d";
      case PrimitiveType.String:
        return "String";
    }
    throw new Error("Primitive property is not initialized");
  }
}

class ECNavigationPropertyImpl extends ECPropertyImpl<CoreNavigationProperty> implements EC.NavigationProperty {
  constructor(coreProperty: CoreNavigationProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isNavigation(): this is EC.NavigationProperty {
    return true;
  }
  public get relationshipClass() {
    return createFromLazyLoaded(this._coreProperty.relationshipClass, (r) => new ECRelationshipClassImpl(r));
  }
  public get direction() {
    switch (this._coreProperty.direction) {
      case StrengthDirection.Backward:
        return "Backward";
      case StrengthDirection.Forward:
        return "Forward";
    }
  }
}

class ECEnumerationPropertyImpl<TCoreProperty extends CoreEnumerationProperty> extends ECPropertyImpl<TCoreProperty> implements EC.EnumerationProperty {
  constructor(coreProperty: TCoreProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isEnumeration(): this is EC.EnumerationProperty {
    return true;
  }
  public get enumeration() {
    return createFromOptionalLazyLoaded(this._coreProperty.enumeration, (coreEnumeration) => new ECEnumerationImpl(coreEnumeration));
  }
  public get extendedTypeName() {
    return this._coreProperty.extendedTypeName;
  }
}

class ECStructPropertyImpl<TCoreProperty extends CoreStructProperty> extends ECPropertyImpl<TCoreProperty> implements EC.StructProperty {
  constructor(coreProperty: TCoreProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isStruct(): this is EC.StructProperty {
    return true;
  }
  public get structClass(): EC.StructClass {
    return new ECStructClassImpl(this._coreProperty.structClass);
  }
}

class ECPrimitivesArrayPropertyImpl extends ECPrimitivePropertyImpl<CorePrimitiveArrayProperty> implements EC.PrimitiveArrayProperty {
  constructor(coreProperty: CorePrimitiveArrayProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isArray(): this is EC.ArrayProperty {
    return true;
  }
  public get minOccurs() {
    return this._coreProperty.minOccurs;
  }
  public get maxOccurs() {
    return this._coreProperty.maxOccurs;
  }
}

class ECEnumerationArrayPropertyImpl extends ECEnumerationPropertyImpl<CoreEnumerationArrayProperty> implements EC.EnumerationArrayProperty {
  constructor(coreProperty: CoreEnumerationArrayProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isArray(): this is EC.ArrayProperty {
    return true;
  }
  public get minOccurs() {
    return this._coreProperty.minOccurs;
  }
  public get maxOccurs() {
    return this._coreProperty.maxOccurs;
  }
}

class ECStructArrayPropertyImpl extends ECStructPropertyImpl<CoreStructArrayProperty> implements EC.StructArrayProperty {
  constructor(coreProperty: CoreStructArrayProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isArray(): this is EC.ArrayProperty {
    return true;
  }
  public get minOccurs() {
    return this._coreProperty.minOccurs;
  }
  public get maxOccurs() {
    return this._coreProperty.maxOccurs;
  }
}

async function createFromLazyLoaded<TSource extends CoreSchemaItem, TTarget>(
  source: LazyLoadedSchemaItem<TSource>,
  convert: (source: TSource) => TTarget,
): Promise<TTarget> {
  return source.then(convert);
}

async function createFromOptionalLazyLoaded<TSource extends CoreSchemaItem, TTarget>(
  source: LazyLoadedSchemaItem<TSource> | undefined,
  convert: (source: TSource) => TTarget,
): Promise<TTarget | undefined> {
  if (!source) {
    return undefined;
  }
  return source.then(convert);
}

class ECRelationshipConstraintImpl implements EC.RelationshipConstraint {
  constructor(
    private _coreConstraint: CoreRelationshipConstraint,
    private _schema: EC.Schema,
  ) {}
  public get multiplicity() {
    return this._coreConstraint.multiplicity
      ? {
          lowerLimit: this._coreConstraint.multiplicity.lowerLimit,
          upperLimit: this._coreConstraint.multiplicity.upperLimit,
        }
      : undefined;
  }
  public get polymorphic() {
    return this._coreConstraint.polymorphic ?? false;
  }
  public get abstractConstraint(): Promise<EC.EntityClass | EC.Mixin | EC.RelationshipClass | undefined> {
    return createFromOptionalLazyLoaded(this._coreConstraint.abstractConstraint, (coreConstraint) => createECClass(coreConstraint, this._schema));
  }
}

class ECKindOfQuantityImpl extends ECSchemaItemImpl<CoreKindOfQuantity> implements EC.KindOfQuantity {
  constructor(coreKindOfQuantity: CoreKindOfQuantity) {
    super(coreKindOfQuantity);
  }
}

class ECEnumerationImpl extends ECSchemaItemImpl<CoreEnumeration> implements EC.Enumeration {
  constructor(coreEnumeration: CoreEnumeration) {
    super(coreEnumeration);
  }
  public get enumerators() {
    return this._coreSchemaItem.enumerators.map((coreEnumerator) => ({ ...coreEnumerator }));
  }
  public get type() {
    switch (this._coreSchemaItem.type) {
      case PrimitiveType.String:
        return "String";
      case PrimitiveType.Integer:
      default:
        return "Number";
    }
  }
  public get isStrict() {
    return this._coreSchemaItem.isStrict;
  }
}
