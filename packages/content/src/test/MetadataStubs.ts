/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName, parseFullClassName } from "@itwin/presentation-shared";

import type { EC, ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";

/** Creates a primitive `EC.Property` stub for tests. */
export function createPrimitiveProperty(props: {
  name: string;
  primitiveType?: EC.PrimitiveType;
  label?: string;
  koq?: string;
  /** When `true`, the property reports as an array of the given primitive type. */
  array?: boolean;
  /** Full name of the class that declares the property (defaults to the owning class). */
  declaringClassName?: EC.FullClassNameDotNotation;
  /** EC schema property category assigned to the property, if any. */
  category?: { fullName: EC.FullClassNameDotNotation; label?: string };
}): EC.Property {
  return {
    name: props.name,
    label: props.label,
    class: { fullName: props.declaringClassName ?? "TestSchema.TestClass" } as unknown as EC.Class,
    kindOfQuantity: props.koq ? ({ fullName: props.koq } as unknown as EC.KindOfQuantity) : undefined,
    category: props.category
      ? ({
          fullName: props.category.fullName,
          name: props.category.fullName.slice(props.category.fullName.indexOf(".") + 1),
          label: props.category.label,
        } as unknown as EC.PropertyCategory)
      : undefined,
    isArray: () => props.array ?? false,
    isStruct: () => false,
    isPrimitive: () => true,
    isEnumeration: () => false,
    isNavigation: () => false,
    primitiveType: props.primitiveType ?? "String",
  } as unknown as EC.Property;
}

/** Creates an entity `EC.Class` stub for tests. */
export function createEntityClass(props: {
  fullName: EC.FullClassNameDotNotation;
  label?: string;
  /** All properties visible on the class (own + inherited), returned by `getProperties`. */
  properties?: EC.Property[];
  /**
   * Properties declared directly on the class, returned by `getOwnProperties`.
   * Defaults to `properties` when omitted.
   */
  ownProperties?: EC.Property[];
  /** The class this one derives from, resolved by `baseClass`. */
  baseClass?: EC.Class;
  /** Mixins applied directly to the class. */
  mixins?: EC.Mixin[];
  /** Classes that derive directly or indirectly from this class. */
  derivedClasses?: EC.Class[];
}): EC.EntityClass {
  const { schemaName, className } = parseFullClassName(props.fullName);
  return {
    schema: { name: schemaName } as unknown as EC.Schema,
    fullName: props.fullName,
    name: className,
    label: props.label,
    baseClass: props.baseClass,
    is: () => false,
    getProperty: (name: string) => props.properties?.find((p) => p.name === name),
    getProperties: () => props.properties ?? [],
    getOwnProperties: () => props.ownProperties ?? props.properties ?? [],
    isEntityClass: () => true,
    isRelationshipClass: () => false,
    isStructClass: () => false,
    isMixin: () => false,
    getMixins: () => props.mixins ?? [],
    getDerivedClasses: async () => props.derivedClasses ?? [],
  } as unknown as EC.EntityClass;
}

/** Creates a mixin class stub for tests. */
export function createMixinClass(props: {
  fullName: EC.FullClassNameDotNotation;
  ownProperties?: EC.Property[];
  baseClass?: EC.Class;
}): EC.Mixin {
  const { schemaName, className } = parseFullClassName(props.fullName);
  return {
    schema: { name: schemaName } as unknown as EC.Schema,
    fullName: props.fullName,
    name: className,
    baseClass: props.baseClass,
    is: () => false,
    getProperty: (name: string) => props.ownProperties?.find((property) => property.name === name),
    getProperties: () => props.ownProperties ?? [],
    getOwnProperties: () => props.ownProperties ?? [],
    isEntityClass: () => false,
    isRelationshipClass: () => false,
    isStructClass: () => false,
    isMixin: () => true,
    getDerivedClasses: async () => [],
  } as unknown as EC.Mixin;
}

/**
 * Creates an `ECSchemaProvider & ECClassHierarchyInspector` stub backed by the given classes,
 * looked up by their (normalized) full name. `classDerivesFrom` walks the stubs' `baseClass` chain.
 */
export function createSchemaAccess(classes: EC.Class[]): ECSchemaProvider & ECClassHierarchyInspector {
  const byFullName = new Map(classes.map((cls) => [cls.fullName, cls]));
  return {
    getSchema: async (schemaName: string) => ({
      name: schemaName,
      version: { read: 1, write: 0, minor: 0 },
      isHidden: false,
      getClass: (className: string) => byFullName.get(`${schemaName}.${className}`),
    }),
    classDerivesFrom: async (derivedClassFullName, candidateBaseClassFullName) => {
      const target = normalizeFullClassName(candidateBaseClassFullName);
      let current = byFullName.get(normalizeFullClassName(derivedClassFullName));
      while (current) {
        if (current.fullName === target) {
          return true;
        }
        current = await current.baseClass;
      }
      return false;
    },
  };
}
