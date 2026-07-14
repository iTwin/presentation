/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";

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
  declaringClassName?: EC.FullClassName;
  /** EC schema property category assigned to the property, if any. */
  category?: { fullName: EC.FullClassName; label?: string };
}): EC.Property {
  return {
    name: props.name,
    label: props.label,
    class: { fullName: props.declaringClassName ?? "TestSchema.TestClass" } as unknown as EC.Class,
    kindOfQuantity: Promise.resolve(props.koq ? ({ fullName: props.koq } as unknown as EC.KindOfQuantity) : undefined),
    category: Promise.resolve(
      props.category
        ? ({
            fullName: props.category.fullName,
            name: props.category.fullName.slice(props.category.fullName.indexOf(".") + 1),
            label: props.category.label,
          } as unknown as EC.PropertyCategory)
        : undefined,
    ),
    isArray: () => props.array ?? false,
    isStruct: () => false,
    isPrimitive: () => true,
    isEnumeration: () => false,
    isNavigation: () => false,
    primitiveType: props.primitiveType ?? "String",
    getCustomAttributes: async () => new Map() as unknown as EC.CustomAttributeSet,
  } as unknown as EC.Property;
}

/** Creates an entity `EC.Class` stub for tests. */
export function createEntityClass(props: {
  fullName: EC.FullClassName;
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
  const normalized = normalizeFullClassName(props.fullName);
  const dotIndex = normalized.indexOf(".");
  const schemaName = normalized.slice(0, dotIndex);
  const className = normalized.slice(dotIndex + 1);
  return {
    schema: { name: schemaName } as unknown as EC.Schema,
    fullName: props.fullName,
    name: className,
    label: props.label,
    baseClass: Promise.resolve(props.baseClass),
    is: async () => false,
    getProperty: async (name: string) => props.properties?.find((p) => p.name === name),
    getProperties: async () => props.properties ?? [],
    getOwnProperties: async () => props.ownProperties ?? props.properties ?? [],
    isEntityClass: () => true,
    isRelationshipClass: () => false,
    isStructClass: () => false,
    isMixin: () => false,
    getMixins: async () => props.mixins ?? [],
    getDerivedClasses: async () => props.derivedClasses ?? [],
    getCustomAttributes: async () => new Map() as unknown as EC.CustomAttributeSet,
  } as unknown as EC.EntityClass;
}

/** Creates a mixin class stub for tests. */
export function createMixinClass(props: {
  fullName: EC.FullClassName;
  ownProperties?: EC.Property[];
  baseClass?: EC.Class;
}): EC.Mixin {
  const normalized = normalizeFullClassName(props.fullName);
  const dotIndex = normalized.indexOf(".");
  return {
    schema: { name: normalized.slice(0, dotIndex) } as unknown as EC.Schema,
    fullName: props.fullName,
    name: normalized.slice(dotIndex + 1),
    baseClass: Promise.resolve(props.baseClass),
    is: async () => false,
    getProperty: async (name: string) => props.ownProperties?.find((property) => property.name === name),
    getProperties: async () => props.ownProperties ?? [],
    getOwnProperties: async () => props.ownProperties ?? [],
    isEntityClass: () => false,
    isRelationshipClass: () => false,
    isStructClass: () => false,
    isMixin: () => true,
    getDerivedClasses: async () => [],
    getCustomAttributes: async () => new Map() as unknown as EC.CustomAttributeSet,
  } as unknown as EC.Mixin;
}

/**
 * Creates an `ECSchemaProvider & ECClassHierarchyInspector` stub backed by the given classes,
 * looked up by their (normalized) full name. `classDerivesFrom` walks the stubs' `baseClass` chain.
 */
export function createSchemaAccess(classes: EC.Class[]): ECSchemaProvider & ECClassHierarchyInspector {
  const byFullName = new Map(classes.map((cls) => [normalizeFullClassName(cls.fullName), cls]));
  return {
    getSchema: async (schemaName: string) => ({
      name: schemaName,
      version: { read: 1, write: 0, minor: 0 },
      getClass: async (className: string) => byFullName.get(`${schemaName}.${className}`),
      getCustomAttributes: async () => new Map(),
    }),
    classDerivesFrom: async (derivedClassFullName, candidateBaseClassFullName) => {
      const target = normalizeFullClassName(candidateBaseClassFullName);
      let current = byFullName.get(normalizeFullClassName(derivedClassFullName));
      while (current) {
        if (normalizeFullClassName(current.fullName) === target) {
          return true;
        }
        current = await current.baseClass;
      }
      return false;
    },
  };
}
