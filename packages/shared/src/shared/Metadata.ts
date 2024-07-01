/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LRUMap } from "@itwin/core-bentley";
import { parseFullClassName } from "./Utils";

/**
 * An interface for an object that knows how to get an ECSchema from an iModel.
 *
 * @see `createECSchemaProvider` in `@itwin/presentation-core-interop`.
 * @beta
 */
export interface ECSchemaProvider {
  getSchema(schemaName: string): Promise<EC.Schema | undefined>;
}

/**
 * An interface for a class hierarchy inspector that can be used to determine if one class derives from another.
 * @see `createCachingECClassHierarchyInspector`
 * @beta
 */
export interface ECClassHierarchyInspector {
  classDerivesFrom(derivedClassFullName: string, candidateBaseClassFullName: string): Promise<boolean> | boolean;
}

/**
 * Creates a new `ECClassHierarchyInspector` that caches results of `derivesFrom` calls.
 * @beta
 */
export function createCachingECClassHierarchyInspector(props: {
  /** Schema provider used to load schemas and their classes. */
  schemaProvider: ECSchemaProvider;
  /** Optional cache size, describing the number of derived/base class combinations to store in cache. Defaults to `0`, which means no caching. */
  cacheSize?: number;
}): ECClassHierarchyInspector {
  const map = new LRUMap<string, Promise<boolean> | boolean>(props.cacheSize ?? 0);
  function createCacheKey(derivedClassName: string, baseClassName: string) {
    return `${derivedClassName}/${baseClassName}`;
  }
  return {
    classDerivesFrom(derivedClassFullName: string, candidateBaseClassFullName: string): Promise<boolean> | boolean {
      const cacheKey = createCacheKey(derivedClassFullName, candidateBaseClassFullName);
      let result = map.get(cacheKey);
      if (result === undefined) {
        result = Promise.all([getClass(props.schemaProvider, derivedClassFullName), getClass(props.schemaProvider, candidateBaseClassFullName)]).then(
          async ([derivedClass, baseClass]) => {
            const resolvedResult = await derivedClass.is(baseClass);
            map.set(cacheKey, resolvedResult);
            return resolvedResult;
          },
        );
        map.set(cacheKey, result);
      }
      return result;
    },
  };
}

/**
 * A namespace containing various [EC types](https://www.itwinjs.org/bis/ec/).
 * @beta
 * @see `ECSchemaProvider`
 */
export namespace EC {
  /**
   * Represents an ECSchema that contains classes, relationships, etc.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schema/
   * @beta
   */
  export interface Schema {
    name: string;
    getClass(name: string): Promise<Class | undefined>;
  }

  /**
   * Represents an ECSchema item - a class, relationship, etc.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schemaitem/
   * @beta
   */
  export interface SchemaItem {
    schema: Schema;
    fullName: string;
    name: string;
    label?: string;
  }

  /**
   * Represents an ECClass.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/ecclass/
   * @beta
   */
  export interface Class extends SchemaItem {
    is(className: string, schemaName: string): Promise<boolean>;
    is(other: Class): Promise<boolean>;
    getProperty(name: string): Promise<Property | undefined>;
    getProperties(): Promise<Array<Property>>;
    isEntityClass(): this is EntityClass;
    isRelationshipClass(): this is RelationshipClass;
    isStructClass(): this is StructClass;
    isMixin(): this is Mixin;
  }

  /**
   * Represents an entity class.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/entityclass/
   * @beta
   */
  export type EntityClass = Class;

  /**
   * Represents a struct class.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/structclass/
   * @beta
   */
  export type StructClass = Class;

  /**
   * Represents a mixin.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/mixin/
   * @beta
   */
  export type Mixin = Class;

  /**
   * Represents a kind of quantity.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/kindofquantity/
   * @beta
   */
  export type KindOfQuantity = SchemaItem;

  /**
   * Represents a relationship constraint multiplicity.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/relationshipmultiplicity/
   * @beta
   */
  export interface RelationshipConstraintMultiplicity {
    lowerLimit: number;
    upperLimit: number;
  }

  /**
   * Represents a relationship constraint.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/relationshipconstraint/
   * @beta
   */
  export interface RelationshipConstraint {
    multiplicity?: RelationshipConstraintMultiplicity;
    polymorphic: boolean;
    abstractConstraint: Promise<EntityClass | Mixin | RelationshipClass | undefined>;
  }

  /**
   * Represents a relationship class.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/relationshipclass/
   * @beta
   */
  export interface RelationshipClass extends Class {
    direction: "Forward" | "Backward";
    source: RelationshipConstraint;
    target: RelationshipConstraint;
  }

  /**
   * Represents an enumerator.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/enumerator/
   * @beta
   */
  export interface Enumerator<T> {
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
  export interface Enumeration extends SchemaItem {
    enumerators: Array<Enumerator<string | number>>;
    type: "String" | "Number";
    isStrict: boolean;
  }

  /**
   * Represents a property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/property/
   * @beta
   */
  export interface Property {
    name: string;
    class: Class;
    label?: string;
    kindOfQuantity: Promise<KindOfQuantity | undefined>;

    isArray(): this is ArrayProperty;
    isStruct(): this is StructProperty;
    isPrimitive(): this is PrimitiveProperty;
    isEnumeration(): this is EnumerationProperty;
    isNavigation(): this is NavigationProperty;
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
  export type StructArrayProperty = StructProperty & ArrayPropertyAttributes;
  /**
   * Defines an enumerations array property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/enumerationarrayproperty/
   * @beta
   */
  export type EnumerationArrayProperty = EnumerationProperty & ArrayPropertyAttributes;
  /**
   * Defines a primitives array property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/primitivearrayproperty/
   * @beta
   */
  export type PrimitiveArrayProperty = PrimitiveProperty & ArrayPropertyAttributes;
  /**
   * Defines an array property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/anyarrayproperty/
   * @beta
   */
  export type ArrayProperty = StructArrayProperty | EnumerationArrayProperty | PrimitiveArrayProperty;

  /**
   * Defines a struct property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/structproperty/
   * @beta
   */
  export interface StructProperty extends Property {
    structClass: StructClass;
  }

  /**
   * Defines an enumeration property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/enumerationproperty/
   * @beta
   */
  export interface EnumerationProperty extends Property {
    enumeration: Promise<Enumeration | undefined>;
    extendedTypeName?: string;
  }

  /**
   * Defines a navigation property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/navigationproperty/
   * @beta
   */
  export interface NavigationProperty extends Property {
    relationshipClass: Promise<RelationshipClass>;
    direction: "Forward" | "Backward";
  }

  /**
   * Defines a primitive property type.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/primitivetype/
   * @beta
   */
  export type PrimitiveType = "Binary" | "Boolean" | "DateTime" | "Double" | "Integer" | "Long" | "Point2d" | "Point3d" | "String" | "IGeometry";

  /**
   * Defines a primitive property.
   * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/primitiveproperty/
   * @beta
   */
  export interface PrimitiveProperty extends Property {
    primitiveType: PrimitiveType;
    extendedTypeName?: string;
  }
}

/**
 * An identifiers' union of all supported primitive value types.
 * @beta
 */
export type PrimitiveValueType = "Id" | Exclude<EC.PrimitiveType, "Binary" | "IGeometry">;

/**
 * Describes a single step through an ECRelationship from source ECClass to target ECClass.
 * @beta
 */
export interface RelationshipPathStep {
  /** Full name of the source ECClass */
  sourceClassName: string;
  /** Full name of the target ECClass */
  targetClassName: string;
  /** Full name of the ECRelationshipClass */
  relationshipName: string;
  /**
   * Indicates that the relationship direction be reversed. This should be set to `true` when step direction
   * doesn't match relationship direction, e.g. relationship is from source `A` to target `B` and the step
   * describes a step from `B` to `A`.
   */
  relationshipReverse?: boolean;
}

/**
 * Describes a path from source ECClass to target ECClass through multiple ECRelationships.
 * @beta
 */
export type RelationshipPath<TStep extends RelationshipPathStep = RelationshipPathStep> = TStep[];

/**
 * Finds a class with the specified full class name using the given `ECSchemaProvider`.
 * @throws Error if the schema or class is not found.
 * @beta
 */
export async function getClass(schemaProvider: ECSchemaProvider, fullClassName: string): Promise<EC.Class> {
  const { schemaName, className } = parseFullClassName(fullClassName);
  const schema = await schemaProvider.getSchema(schemaName);
  if (!schema) {
    throw new Error(`Schema "${schemaName}" not found.`);
  }
  const lookupClass = await schema.getClass(className);
  if (!lookupClass) {
    throw new Error(`Class "${className}" not found in schema "${schemaName}".`);
  }
  return lookupClass;
}
