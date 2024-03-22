/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

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
 * An utility to parse schema and class names from full class name, where
 * schema and class names are separated by either `:` or `.`
 * @beta
 */
export function parseFullClassName(fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  return { schemaName, className };
}
