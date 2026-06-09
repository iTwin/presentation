/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import {
  ECClass as CoreClass,
  PrimitiveType as CorePrimitiveType,
  SchemaItemType as CoreSchemaItemType,
  SchemaKey as CoreSchemaKey,
  StrengthDirection as CoreStrengthDirection,
} from "@itwin/ecschema-metadata";
import { normalizeFullClassName, parseFullClassName } from "@itwin/presentation-shared";

import type {
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
} from "@itwin/ecschema-metadata";
import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Defines input for `createECSchemaProvider`. Generally, this is an instance of [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/)
 * class from `@itwin/ecschema-metadata` package.
 *
 * @public
 */
export interface CoreSchemaContext {
  getSchema(key: CoreSchemaKey): Promise<CoreSchema | undefined>;
}

/** Maps a normalized full class name to its direct derived classes within a schema. */
type DerivedClassesMap = ReadonlyMap<EC.FullClassName, CoreClass[]>;

// ─── Force-load ───────────────────────────────────────────────────────────────

/**
 * Awaits all lazy schema items that require async resolution so that they are cached inside the
 * `SchemaContext`, allowing the sync sister-methods (`getBaseClassSync`, `isSync`,
 * `getKindOfQuantitySync`, etc.) to work immediately afterward.
 *
 * Returns the only piece of data that has no sync counterpart: a map of normalized full class name
 * to its direct derived classes.
 */
async function forceLoadSchemaClasses(coreSchema: CoreSchema): Promise<DerivedClassesMap> {
  const derivedMap = new Map<EC.FullClassName, CoreClass[]>();

  for (const coreClass of coreSchema.getItems(CoreClass)) {
    if (coreClass.baseClass) {
      const base = await coreClass.baseClass;
      const baseFn = normalizeFullClassName(base.fullName);
      if (!derivedMap.has(baseFn)) {
        derivedMap.set(baseFn, []);
      }
      derivedMap.get(baseFn)!.push(coreClass);
    }

    for (const prop of coreClass.getPropertiesSync()) {
      if (prop.kindOfQuantity) {
        await prop.kindOfQuantity;
      }
      if (prop.isEnumeration() && prop.enumeration) {
        await prop.enumeration;
      }
      if (prop.isNavigation()) {
        await prop.relationshipClass;
      }
    }

    if (coreClass.schemaItemType === CoreSchemaItemType.RelationshipClass) {
      const rel = coreClass as CoreRelationshipClass;
      if (rel.source.abstractConstraint) {
        await rel.source.abstractConstraint;
      }
      if (rel.target.abstractConstraint) {
        await rel.target.abstractConstraint;
      }
    }
  }

  return derivedMap;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function createECSchemaProviderFromSchemaContext(schemaContext: CoreSchemaContext): ECSchemaProvider {
  const schemaRequestsCache = new Map<string, Promise<EC.Schema | undefined>>();

  async function getSchemaUnprotected(schemaName: string) {
    const coreSchema = await schemaContext.getSchema(new CoreSchemaKey(schemaName));
    if (!coreSchema) {
      return undefined;
    }
    const derivedMap = await forceLoadSchemaClasses(coreSchema);
    return createECSchema(coreSchema, derivedMap);
  }

  async function getSchemaProtected(
    schemaName: string,
    handledExistingSchemaErrors: Set<string>,
  ): Promise<EC.Schema | undefined> {
    // workaround for https://github.com/iTwin/itwinjs-core/issues/6542
    try {
      return await getSchemaUnprotected(schemaName);
    } catch (e) {
      /* v8 ignore else -- @preserve */
      if (e instanceof Error) {
        if (e.message.includes("already exists within this cache") && !handledExistingSchemaErrors.has(schemaName)) {
          handledExistingSchemaErrors.add(schemaName);
          return getSchemaProtected(schemaName, handledExistingSchemaErrors);
        }
        if (e.message.includes("schema not found")) {
          return undefined;
        }
      }
      throw e;
    }
  }

  return {
    async getSchema(name) {
      let promise = schemaRequestsCache.get(name);
      if (!promise) {
        promise = getSchemaProtected(name, new Set());
        schemaRequestsCache.set(name, promise);
      }
      return promise;
    },
  };
}

// ─── EC.Schema ────────────────────────────────────────────────────────────────

export function createECSchema(coreSchema: CoreSchema, derivedClassesMap: DerivedClassesMap): EC.Schema {
  return {
    name: coreSchema.name,
    version: coreSchema.schemaKey.version,
    get isHidden() {
      const ca = coreSchema.customAttributes?.get("CoreCustomAttributes.HiddenSchema");
      if (!ca) {
        return false;
      }
      return (ca as { ["ShowClasses"]?: boolean }).ShowClasses !== true;
    },
    getClass(name) {
      const item = coreSchema.getItemSync(name, CoreClass);
      if (!item) {
        return undefined;
      }
      return createECClass(item, this, derivedClassesMap);
    },
  };
}

// ─── EC.Class ────────────────────────────────────────────────────────────────

abstract class ECSchemaItemImpl<TCoreSchemaItem extends CoreSchemaItem> implements EC.SchemaItem {
  private _schema: EC.Schema;
  protected constructor(
    protected _coreSchemaItem: TCoreSchemaItem,
    schema?: EC.Schema,
  ) {
    this._schema = schema ?? createECSchema(this._coreSchemaItem.schema, new Map());
  }
  public get schema() {
    return this._schema;
  }
  public get fullName() {
    return normalizeFullClassName(this._coreSchemaItem.fullName);
  }
  public get name() {
    return this._coreSchemaItem.name;
  }
  public get label() {
    return this._coreSchemaItem.label;
  }
}

export function createECClass(
  coreClass: CoreClass,
  schema?: EC.Schema,
  derivedClassesMap?: DerivedClassesMap,
): EC.Class {
  switch (coreClass.schemaItemType) {
    case CoreSchemaItemType.EntityClass:
      return new ECEntityClassImpl(coreClass as CoreEntityClass, schema, derivedClassesMap);
    case CoreSchemaItemType.RelationshipClass:
      return new ECRelationshipClassImpl(coreClass as CoreRelationshipClass, schema, derivedClassesMap);
    case CoreSchemaItemType.StructClass:
      return new ECStructClassImpl(coreClass, schema, derivedClassesMap);
    case CoreSchemaItemType.Mixin:
      return new ECMixinImpl(coreClass as CoreMixin, schema, derivedClassesMap);
  }
  throw new Error(`Invalid class type "${coreClass.schemaItemType}" for class ${coreClass.fullName}`);
}

abstract class ECClassImpl<TCoreClass extends CoreClass> extends ECSchemaItemImpl<TCoreClass> implements EC.Class {
  protected constructor(
    coreClass: TCoreClass,
    schema: EC.Schema | undefined,
    protected readonly _derivedMap: DerivedClassesMap | undefined,
  ) {
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

  public get isHidden(): boolean | undefined {
    const ca = this._coreSchemaItem.customAttributes?.get("CoreCustomAttributes.HiddenClass");
    if (ca) {
      return (ca as { ["Show"]?: boolean }).Show === true ? false : true;
    }
    if (this.schema.isHidden) {
      return true;
    }
    return undefined;
  }

  public get baseClass(): EC.Class | undefined {
    const base = this._coreSchemaItem.getBaseClassSync();
    return base ? createECClass(base, this.schema, this._derivedMap) : undefined;
  }

  public is(classOrClassName: EC.Class | string, schemaName?: string): boolean {
    if (typeof classOrClassName === "string") {
      return this._coreSchemaItem.isSync(classOrClassName, schemaName!);
    }
    const { schemaName: sn, className: cn } = parseFullClassName(classOrClassName.fullName);
    return this._coreSchemaItem.isSync(cn, sn);
  }

  public getProperty(name: string): EC.Property | undefined {
    const coreProperty = this._coreSchemaItem.getPropertySync(name, false);
    if (!coreProperty) {
      return undefined;
    }
    return createECProperty(coreProperty, this);
  }

  public getProperties(): Array<EC.Property> {
    const result: EC.Property[] = [];
    for (const coreProperty of this._coreSchemaItem.getPropertiesSync()) {
      result.push(createECProperty(coreProperty, this));
    }
    return result;
  }

  public getDerivedClasses(): EC.Class[] {
    return (this._derivedMap?.get(this.fullName) ?? []).map((c) => createECClass(c, this.schema, this._derivedMap));
  }
}

class ECEntityClassImpl extends ECClassImpl<CoreEntityClass> implements EC.EntityClass {
  constructor(coreClass: CoreEntityClass, schema?: EC.Schema, derivedMap?: DerivedClassesMap) {
    super(coreClass, schema, derivedMap);
  }
  public override isEntityClass(): this is EC.EntityClass {
    return true;
  }
}

class ECRelationshipClassImpl extends ECClassImpl<CoreRelationshipClass> implements EC.RelationshipClass {
  constructor(coreClass: CoreRelationshipClass, schema?: EC.Schema, derivedMap?: DerivedClassesMap) {
    super(coreClass, schema, derivedMap);
  }
  public override isRelationshipClass(): this is EC.RelationshipClass {
    return true;
  }
  public get direction() {
    switch (this._coreSchemaItem.strengthDirection) {
      case CoreStrengthDirection.Forward:
        return "Forward" as const;
      case CoreStrengthDirection.Backward:
        return "Backward" as const;
    }
  }
  public get source(): EC.RelationshipConstraint {
    return new ECRelationshipConstraintImpl(
      this._coreSchemaItem.source,
      this._coreSchemaItem.schema,
      this.schema,
      this._derivedMap,
    );
  }
  public get target(): EC.RelationshipConstraint {
    return new ECRelationshipConstraintImpl(
      this._coreSchemaItem.target,
      this._coreSchemaItem.schema,
      this.schema,
      this._derivedMap,
    );
  }
}

class ECStructClassImpl extends ECClassImpl<CoreStructClass> implements EC.StructClass {
  constructor(coreClass: CoreStructClass, schema?: EC.Schema, derivedMap?: DerivedClassesMap) {
    super(coreClass, schema, derivedMap);
  }
  public override isStructClass(): this is EC.StructClass {
    return true;
  }
}

class ECMixinImpl extends ECClassImpl<CoreMixin> implements EC.Mixin {
  constructor(coreClass: CoreMixin, schema?: EC.Schema, derivedMap?: DerivedClassesMap) {
    super(coreClass, schema, derivedMap);
  }
  public override isMixin(): this is EC.Mixin {
    return true;
  }
}

// ─── EC.Property ─────────────────────────────────────────────────────────────

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
  public get isHidden(): boolean {
    const ca = this._coreProperty.customAttributes?.get("CoreCustomAttributes.HiddenProperty");
    if (ca) {
      return (ca as { ["Show"]?: boolean }).Show === true ? false : true;
    }
    return false;
  }
  public get kindOfQuantity(): EC.KindOfQuantity | undefined {
    const koq = this._coreProperty.getKindOfQuantitySync();
    return koq ? new ECKindOfQuantityImpl(koq) : undefined;
  }
}

class ECPrimitivePropertyImpl<TCoreProperty extends CorePrimitiveProperty>
  extends ECPropertyImpl<TCoreProperty>
  implements EC.PrimitiveProperty
{
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
      case CorePrimitiveType.Binary:
        return "Binary" as const;
      case CorePrimitiveType.Boolean:
        return "Boolean" as const;
      case CorePrimitiveType.DateTime:
        return "DateTime" as const;
      case CorePrimitiveType.Double:
        return "Double" as const;
      case CorePrimitiveType.IGeometry:
        return "IGeometry" as const;
      case CorePrimitiveType.Integer:
        return "Integer" as const;
      case CorePrimitiveType.Long:
        return "Long" as const;
      case CorePrimitiveType.Point2d:
        return "Point2d" as const;
      case CorePrimitiveType.Point3d:
        return "Point3d" as const;
      case CorePrimitiveType.String:
        return "String" as const;
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
  public get relationshipClass(): EC.RelationshipClass {
    const relClass = this._coreProperty.getRelationshipClassSync();
    assert(relClass !== undefined, "Navigation property relationship class must be pre-loaded");
    return new ECRelationshipClassImpl(relClass);
  }
  public get direction() {
    switch (this._coreProperty.direction) {
      case CoreStrengthDirection.Backward:
        return "Backward" as const;
      case CoreStrengthDirection.Forward:
        return "Forward" as const;
    }
  }
}

class ECEnumerationPropertyImpl<TCoreProperty extends CoreEnumerationProperty>
  extends ECPropertyImpl<TCoreProperty>
  implements EC.EnumerationProperty
{
  constructor(coreProperty: TCoreProperty, c: EC.Class) {
    super(coreProperty, c);
  }
  public override isEnumeration(): this is EC.EnumerationProperty {
    return true;
  }
  public get enumeration(): EC.Enumeration | undefined {
    const enumRef = this._coreProperty.enumeration;
    if (!enumRef) {
      return undefined;
    }
    // After forceLoad, the enumeration is cached in SchemaContext; retrieve it synchronously via the owning schema.
    const resolved = this._coreProperty.class.schema.lookupItemSync(enumRef) as CoreEnumeration | undefined;
    return resolved ? new ECEnumerationImpl(resolved) : undefined;
  }
  public get extendedTypeName() {
    return this._coreProperty.extendedTypeName;
  }
}

class ECStructPropertyImpl<TCoreProperty extends CoreStructProperty>
  extends ECPropertyImpl<TCoreProperty>
  implements EC.StructProperty
{
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

class ECPrimitivesArrayPropertyImpl
  extends ECPrimitivePropertyImpl<CorePrimitiveArrayProperty>
  implements EC.PrimitiveArrayProperty
{
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

class ECEnumerationArrayPropertyImpl
  extends ECEnumerationPropertyImpl<CoreEnumerationArrayProperty>
  implements EC.EnumerationArrayProperty
{
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

class ECStructArrayPropertyImpl
  extends ECStructPropertyImpl<CoreStructArrayProperty>
  implements EC.StructArrayProperty
{
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

// ─── EC.RelationshipConstraint ────────────────────────────────────────────────

class ECRelationshipConstraintImpl implements EC.RelationshipConstraint {
  constructor(
    private _coreConstraint: CoreRelationshipConstraint,
    private _coreSchema: CoreSchema,
    private _schema: EC.Schema,
    private _derivedMap: DerivedClassesMap | undefined,
  ) {}
  public get multiplicity() {
    return this._coreConstraint.multiplicity;
  }
  public get polymorphic() {
    return this._coreConstraint.polymorphic;
  }
  public get abstractConstraint(): EC.EntityClass | EC.Mixin | EC.RelationshipClass | undefined {
    const ref = this._coreConstraint.abstractConstraint;
    if (!ref) {
      return undefined;
    }
    // After forceLoad, the abstract constraint class is cached in SchemaContext; retrieve it synchronously.
    const cls = this._coreSchema.lookupItemSync(ref, CoreClass);
    if (!cls) {
      return undefined;
    }
    return createECClass(cls, this._schema, this._derivedMap);
  }
}

// ─── EC.KindOfQuantity ────────────────────────────────────────────────────────

class ECKindOfQuantityImpl extends ECSchemaItemImpl<CoreKindOfQuantity> implements EC.KindOfQuantity {
  constructor(coreKindOfQuantity: CoreKindOfQuantity) {
    super(coreKindOfQuantity);
  }
}

// ─── EC.Enumeration ──────────────────────────────────────────────────────────

class ECEnumerationImpl extends ECSchemaItemImpl<CoreEnumeration> implements EC.Enumeration {
  constructor(coreEnumeration: CoreEnumeration) {
    super(coreEnumeration);
  }
  public get enumerators() {
    return this._coreSchemaItem.enumerators.map((coreEnumerator) => ({ ...coreEnumerator }));
  }
  public get type() {
    switch (this._coreSchemaItem.type) {
      case CorePrimitiveType.String:
        return "String" as const;
      case CorePrimitiveType.Integer:
      default:
        return "Number" as const;
    }
  }
  public get isStrict() {
    return this._coreSchemaItem.isStrict;
  }
}
