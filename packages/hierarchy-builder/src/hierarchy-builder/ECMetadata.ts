/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * An interface of an iModel metadata provider used to retrieve information about ECSchemas,
 * ECClasses, ECProperties, etc.
 *
 * @beta
 */
export interface IMetadataProvider {
  getSchema(schemaName: string): Promise<ECSchema | undefined>;
}

/**
 * Represents an ECSchema that contains classes, relationships, etc.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schema/
 * @beta
 */
export interface ECSchema {
  name: string;
  getClass(name: string): Promise<ECClass | undefined>;
}

/**
 * Represents an ECSchema item - a class, relationship, etc.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schemaitem/
 * @beta
 */
export interface ECSchemaItem {
  schema: ECSchema;
  fullName: string;
  name: string;
  label?: string;
}

/**
 * Represents an ECClass.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/ecclass/
 * @beta
 */
export interface ECClass extends ECSchemaItem {
  is(className: string, schemaName: string): Promise<boolean>;
  is(other: ECClass): Promise<boolean>;
  getBaseClass(): Promise<ECClass | undefined>;
  getProperty(name: string): Promise<ECProperty | undefined>;
  getProperties(): Promise<Array<ECProperty>>;
  isEntityClass(): this is ECEntityClass;
  isRelationshipClass(): this is ECRelationshipClass;
  isStructClass(): this is ECStructClass;
  isMixin(): this is ECMixin;
}

/**
 * Represents an entity class.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/entityclass/
 * @beta
 */
export type ECEntityClass = ECClass;

/**
 * Represents a struct class.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/structclass/
 * @beta
 */
export type ECStructClass = ECClass;

/**
 * Represents a mixin.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/mixin/
 * @beta
 */
export type ECMixin = ECClass;

/**
 * Represents a kind of quantity.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/kindofquantity/
 * @beta
 */
export type ECKindOfQuantity = ECSchemaItem;

/**
 * Represents a relationship constraint multiplicity.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/relationshipmultiplicity/
 * @beta
 */
export interface ECRelationshipConstraintMultiplicity {
  lowerLimit: number;
  upperLimit: number;
}

/**
 * Represents a relationship constraint.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/relationshipconstraint/
 * @beta
 */
export interface ECRelationshipConstraint {
  multiplicity?: ECRelationshipConstraintMultiplicity;
  polymorphic: boolean;
  abstractConstraint: Promise<ECEntityClass | ECMixin | ECRelationshipClass | undefined>;
}

/**
 * Represents a relationship class.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/relationshipclass/
 * @beta
 */
export interface ECRelationshipClass extends ECClass {
  direction: "Forward" | "Backward";
  source: ECRelationshipConstraint;
  target: ECRelationshipConstraint;
}

/**
 * Represents an enumerator.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/enumerator/
 * @beta
 */
export interface ECEnumerator<T> {
  name: string;
  value: T;
  label?: string;
  description?: string;
}

/**
 * Represents an enumeration.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/enumeration/
 * @beta
 */
export interface ECEnumeration extends ECSchemaItem {
  enumerators: Array<ECEnumerator<string | number>>;
  type: "String" | "Number";
  isStrict: boolean;
}

/**
 * Represents a property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/property/
 * @beta
 */
export interface ECProperty {
  name: string;
  class: ECClass;
  label?: string;
  kindOfQuantity: Promise<ECKindOfQuantity | undefined>;

  isArray(): this is ECArrayProperty;
  isStruct(): this is ECStructProperty;
  isPrimitive(): this is ECPrimitiveProperty;
  isEnumeration(): this is ECEnumerationProperty;
  isNavigation(): this is ECNavigationProperty;
}

/**
 * Defines array property attributes.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/arrayproperty/
 * @beta
 */
export interface ArrayPropertyAttributes {
  minOccurs: number;
  maxOccurs?: number;
}

/**
 * Defines a structs array property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/structarrayproperty/
 * @beta
 */
export type ECStructArrayProperty = ECStructProperty & ArrayPropertyAttributes;
/**
 * Defines an enumerations array property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/enumerationarrayproperty/
 * @beta
 */
export type ECEnumerationArrayProperty = ECEnumerationProperty & ArrayPropertyAttributes;
/**
 * Defines a primitives array property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/primitivearrayproperty/
 * @beta
 */
export type ECPrimitiveArrayProperty = ECPrimitiveProperty & ArrayPropertyAttributes;
/**
 * Defines an array property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/anyarrayproperty/
 * @beta
 */
export type ECArrayProperty = ECStructArrayProperty | ECEnumerationArrayProperty | ECPrimitiveArrayProperty;

/**
 * Defines a struct property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/structproperty/
 * @beta
 */
export interface ECStructProperty extends ECProperty {
  structClass: ECStructClass;
}

/**
 * Defines an enumeration property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/enumerationproperty/
 * @beta
 */
export interface ECEnumerationProperty extends ECProperty {
  enumeration: Promise<ECEnumeration | undefined>;
  extendedTypeName?: string;
}

/**
 * Defines a navigation property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/navigationproperty/
 * @beta
 */
export interface ECNavigationProperty extends ECProperty {
  relationshipClass: Promise<ECRelationshipClass>;
  direction: "Forward" | "Backward";
}

/**
 * Defines a primitive property type.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/primitivetype/
 * @beta
 */
export type ECPrimitiveType = "Binary" | "Boolean" | "DateTime" | "Double" | "Integer" | "Long" | "Point2d" | "Point3d" | "String" | "IGeometry";

/**
 * Defines a primitive property.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/primitiveproperty/
 * @beta
 */
export interface ECPrimitiveProperty extends ECProperty {
  primitiveType: ECPrimitiveType;
  extendedTypeName?: string;
}
