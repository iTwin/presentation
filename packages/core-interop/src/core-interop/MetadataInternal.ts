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
import {
  ECArrayProperty,
  ECClass,
  ECEntityClass,
  ECEnumeration,
  ECEnumerationArrayProperty,
  ECEnumerationProperty,
  ECKindOfQuantity,
  ECMixin,
  ECNavigationProperty,
  ECPrimitiveArrayProperty,
  ECPrimitiveProperty,
  ECProperty,
  ECRelationshipClass,
  ECRelationshipConstraint,
  ECSchema,
  ECSchemaItem,
  ECStructArrayProperty,
  ECStructClass,
  ECStructProperty,
} from "@itwin/presentation-hierarchies";

/** @internal */
export function createECSchema(schema: CoreSchema): ECSchema {
  return {
    name: schema.name,
    async getClass(name) {
      const item = await schema.getItem<CoreClass>(name);
      return item ? createECClass(item, this) : undefined;
    },
  };
}

abstract class ECSchemaItemImpl<TCoreSchemaItem extends CoreSchemaItem> implements ECSchemaItem {
  private _schema: ECSchema;
  protected constructor(
    protected _coreSchemaItem: TCoreSchemaItem,
    schema?: ECSchema,
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
export function createECClass(coreClass: CoreClass, schema?: ECSchema): ECClass {
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

abstract class ECClassImpl<TCoreClass extends CoreClass> extends ECSchemaItemImpl<TCoreClass> implements ECClass {
  protected constructor(coreClass: TCoreClass, schema?: ECSchema) {
    super(coreClass, schema);
  }
  public isEntityClass(): this is ECEntityClass {
    return false;
  }
  public isRelationshipClass(): this is ECRelationshipClass {
    return false;
  }
  public isStructClass(): this is ECStructClass {
    return false;
  }
  public isMixin(): this is ECMixin {
    return false;
  }
  public async is(classOrClassName: ECClass | string, schemaName?: string) {
    if (typeof classOrClassName === "string") {
      return this._coreSchemaItem.is(classOrClassName, schemaName!);
    }
    return this._coreSchemaItem.is(classOrClassName.name, classOrClassName.schema.name);
  }
  public async getProperty(name: string): Promise<ECProperty | undefined> {
    const coreProperty = await this._coreSchemaItem.getProperty(name, true);
    return coreProperty ? createECProperty(coreProperty, this) : undefined;
  }
  public async getProperties(): Promise<Array<ECProperty>> {
    const coreProperties = await this._coreSchemaItem.getProperties();
    return coreProperties.map((coreProperty) => createECProperty(coreProperty, this));
  }
}

class ECEntityClassImpl extends ECClassImpl<CoreEntityClass> implements ECEntityClass {
  constructor(coreClass: CoreEntityClass, schema?: ECSchema) {
    super(coreClass, schema);
  }
  public override isEntityClass(): this is ECEntityClass {
    return true;
  }
}

class ECRelationshipClassImpl extends ECClassImpl<CoreRelationshipClass> implements ECRelationshipClass {
  constructor(coreClass: CoreRelationshipClass, schema?: ECSchema) {
    super(coreClass, schema);
  }
  public override isRelationshipClass(): this is ECRelationshipClass {
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

class ECStructClassImpl extends ECClassImpl<CoreStructClass> implements ECStructClass {
  constructor(coreClass: CoreStructClass, schema?: ECSchema) {
    super(coreClass, schema);
  }
  public override isStructClass(): this is ECStructClass {
    return true;
  }
}

class ECMixinImpl extends ECClassImpl<CoreMixin> implements ECMixin {
  constructor(coreClass: CoreMixin, schema?: ECSchema) {
    super(coreClass, schema);
  }
  public override isMixin(): this is ECMixin {
    return true;
  }
}

/** @internal */
export function createECProperty(coreProperty: CoreProperty, ecClass: ECClass): ECProperty {
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

abstract class ECPropertyImpl<TCoreProperty extends CoreProperty> implements ECProperty {
  protected constructor(
    protected _coreProperty: TCoreProperty,
    protected _class: ECClass,
  ) {}
  public isArray(): this is ECArrayProperty {
    return false;
  }
  public isStruct(): this is ECStructProperty {
    return false;
  }
  public isPrimitive(): this is ECPrimitiveProperty {
    return false;
  }
  public isEnumeration(): this is ECEnumerationProperty {
    return false;
  }
  public isNavigation(): this is ECNavigationProperty {
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
  public get kindOfQuantity(): Promise<ECKindOfQuantity | undefined> {
    return createFromOptionalLazyLoaded(this._coreProperty.kindOfQuantity, (coreKindOfQuantity) => new ECKindOfQuantityImpl(coreKindOfQuantity));
  }
}

class ECPrimitivePropertyImpl<TCoreProperty extends CorePrimitiveProperty> extends ECPropertyImpl<TCoreProperty> implements ECPrimitiveProperty {
  constructor(coreProperty: TCoreProperty, c: ECClass) {
    super(coreProperty, c);
  }
  public override isPrimitive(): this is ECPrimitiveProperty {
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

class ECNavigationPropertyImpl extends ECPropertyImpl<CoreNavigationProperty> implements ECNavigationProperty {
  constructor(coreProperty: CoreNavigationProperty, c: ECClass) {
    super(coreProperty, c);
  }
  public override isNavigation(): this is ECNavigationProperty {
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

class ECEnumerationPropertyImpl<TCoreProperty extends CoreEnumerationProperty> extends ECPropertyImpl<TCoreProperty> implements ECEnumerationProperty {
  constructor(coreProperty: TCoreProperty, c: ECClass) {
    super(coreProperty, c);
  }
  public override isEnumeration(): this is ECEnumerationProperty {
    return true;
  }
  public get enumeration() {
    return createFromOptionalLazyLoaded(this._coreProperty.enumeration, (coreEnumeration) => new ECEnumerationImpl(coreEnumeration));
  }
  public get extendedTypeName() {
    return this._coreProperty.extendedTypeName;
  }
}

class ECStructPropertyImpl<TCoreProperty extends CoreStructProperty> extends ECPropertyImpl<TCoreProperty> implements ECStructProperty {
  constructor(coreProperty: TCoreProperty, c: ECClass) {
    super(coreProperty, c);
  }
  public override isStruct(): this is ECStructProperty {
    return true;
  }
  public get structClass(): ECStructClass {
    return new ECStructClassImpl(this._coreProperty.structClass);
  }
}

class ECPrimitivesArrayPropertyImpl extends ECPrimitivePropertyImpl<CorePrimitiveArrayProperty> implements ECPrimitiveArrayProperty {
  constructor(coreProperty: CorePrimitiveArrayProperty, c: ECClass) {
    super(coreProperty, c);
  }
  public override isArray(): this is ECArrayProperty {
    return true;
  }
  public get minOccurs() {
    return this._coreProperty.minOccurs;
  }
  public get maxOccurs() {
    return this._coreProperty.maxOccurs;
  }
}

class ECEnumerationArrayPropertyImpl extends ECEnumerationPropertyImpl<CoreEnumerationArrayProperty> implements ECEnumerationArrayProperty {
  constructor(coreProperty: CoreEnumerationArrayProperty, c: ECClass) {
    super(coreProperty, c);
  }
  public override isArray(): this is ECArrayProperty {
    return true;
  }
  public get minOccurs() {
    return this._coreProperty.minOccurs;
  }
  public get maxOccurs() {
    return this._coreProperty.maxOccurs;
  }
}

class ECStructArrayPropertyImpl extends ECStructPropertyImpl<CoreStructArrayProperty> implements ECStructArrayProperty {
  constructor(coreProperty: CoreStructArrayProperty, c: ECClass) {
    super(coreProperty, c);
  }
  public override isArray(): this is ECArrayProperty {
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

class ECRelationshipConstraintImpl implements ECRelationshipConstraint {
  constructor(
    private _coreConstraint: CoreRelationshipConstraint,
    private _schema: ECSchema,
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
  public get abstractConstraint(): Promise<ECEntityClass | ECMixin | ECRelationshipClass | undefined> {
    return createFromOptionalLazyLoaded(this._coreConstraint.abstractConstraint, (coreConstraint) => createECClass(coreConstraint, this._schema));
  }
}

class ECKindOfQuantityImpl extends ECSchemaItemImpl<CoreKindOfQuantity> implements ECKindOfQuantity {
  constructor(coreKindOfQuantity: CoreKindOfQuantity) {
    super(coreKindOfQuantity);
  }
}

class ECEnumerationImpl extends ECSchemaItemImpl<CoreEnumeration> implements ECEnumeration {
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
