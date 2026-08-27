/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { bufferTime, filter, firstValueFrom, map, mergeMap, share, Subject } from "rxjs";
import { SchemaViewPrimitiveType, StrengthDirection } from "@itwin/ecschema-metadata";
import { type EC, type ECSchemaProvider, normalizeFullClassName } from "@itwin/presentation-shared";

import type { SchemaView as CoreSchemaView } from "@itwin/ecschema-metadata";
import type { CoreECSqlReaderFactory } from "./QueryExecutor.js";

/**
 * Subset of [SchemaView](https://www.itwinjs.org/reference/ecschema-metadata/context/schemaview/) API surface that
 * is `@public` and can be used by `createECSchemaProvider` function.
 *
 * @public
 */
type PublicCoreSchemaView = Pick<
  CoreSchemaView,
  | "schemaToken"
  | "isOutdated"
  | "schemaCount"
  | "classCount"
  | "getSchema"
  | "getSchemaByAlias"
  | "getSchemas"
  | "findClass"
  | "findEnumeration"
  | "findKindOfQuantity"
  | "findPropertyCategory"
>;

/**
 * A function that optionally takes a list of schema names and returns a `SchemaView`, containing details about the
 * requested schemas.
 *
 * If no schema names are provided, the function should return a `SchemaView` containing all available schemas.
 *
 * @public
 */
type CoreSchemaViewGetter = (props?: { schemas?: string[] }) => Promise<PublicCoreSchemaView>;

/**
 * Accumulates schema names requested within the same frame and issues a single `getSchemaView` request for all of
 * them in the next one, returning each caller the batch's result. Used both by `createECSchemaProvider` and by
 * `createValueFormatter` (which resolves kind of quantity persistence units without needing the class hierarchy).
 *
 * @internal
 */
export function createBatchedSchemaViewGetter<TSchemaView>(imodel: {
  getSchemaView: (props?: { schemas?: string[] }) => Promise<TSchemaView>;
}): (schemaName: string) => Promise<TSchemaView> {
  const schemaNameSubject = new Subject<string>();
  const schemaViewBatches = schemaNameSubject.pipe(
    bufferTime(0),
    filter((schemaNames) => schemaNames.length > 0),
    mergeMap(async (schemaNames) => {
      const schemas = new Set(schemaNames);
      return { schemas, schemaView: await imodel.getSchemaView({ schemas: [...schemas] }) };
    }),
    share(),
  );
  return async function getSchemaView(schemaName: string): Promise<TSchemaView> {
    const schemaView = firstValueFrom(
      schemaViewBatches.pipe(
        filter((batch) => batch.schemas.has(schemaName)),
        map((batch) => batch.schemaView),
      ),
    );
    schemaNameSubject.next(schemaName);
    return schemaView;
  };
}

/**
 * Creates an `ECSchemaProvider` for a given iModel with [SchemaView](https://www.itwinjs.org/reference/ecschema-metadata/context/schemaview/)
 * getter and query reader factory.
 *
 * Usage example:
 *
 * ```ts
 * import { IModelConnection } from "@itwin/core-frontend";
 * import { createECSchemaProvider } from "@itwin/presentation-core-interop";
 *
 * const imodel: IModelConnection = getIModel();
 * const schemaProvider = createECSchemaProvider(imodel);
 * // the created schema provider may be used in `@itwin/presentation-hierarchies` and other Presentation packages
 * ```
 *
 * @public
 */
export function createECSchemaProvider(
  imodel: { getSchemaView: CoreSchemaViewGetter } & CoreECSqlReaderFactory,
): ECSchemaProvider {
  const getSchemaView = createBatchedSchemaViewGetter(imodel);

  // Ensures we only create a single `ECClassHierarchyResolver` for the iModel, which is used to resolve derived classes for all schemas.
  // Cache the promise (not the resolved value) so concurrent `getSchema` calls share one `createECClassHierarchyResolver` invocation.
  let cachedClassHierarchyResolverPromise: Promise<ECClassHierarchyResolver> | undefined;
  // Set once the resolver promise settles. Allows `classDerivesFrom` to answer synchronously after the hierarchy is loaded.
  let cachedClassHierarchyResolver: ECClassHierarchyResolver | undefined;
  function getClassHierarchyResolver(): ECClassHierarchyResolver | Promise<ECClassHierarchyResolver> {
    if (cachedClassHierarchyResolver) {
      return cachedClassHierarchyResolver;
    }
    cachedClassHierarchyResolverPromise ??= createECClassHierarchyResolver(imodel).then((resolver) => {
      cachedClassHierarchyResolver = resolver;
      return resolver;
    });
    return cachedClassHierarchyResolverPromise;
  }

  async function getSchemaProviderContext(schemaName: string) {
    const [classHierarchyResolver, schemaView] = await Promise.all([
      getClassHierarchyResolver(),
      getSchemaView(schemaName),
    ]);
    return { classHierarchyResolver, schemaView };
  }

  // Cache the resolved schema by name so repeated `getSchema`/`getClass` calls reuse it instead of issuing a new
  // `getSchemaView` request each time. The cached promise doubles as an in-flight guard: concurrent
  // first-time requests for the same schema share it (and its underlying `getSchemaView` request) instead of each
  // building the schema. The entry is retained until the schema view it was built from is marked outdated by the host
  // (a newer view has replaced it), at which point the next access refreshes it.
  const schemaCache = new Map<string, Promise<{ schemaView: PublicCoreSchemaView; schema: EC.Schema | undefined }>>();
  async function fetchSchema(name: string) {
    // Cache built `EC.Class` objects (by full name) for this schema, so repeated accesses (e.g. the
    // `EC.Property.class` getter, invoked once per grouped node) reuse a single class instead of rebuilding it from
    // the schema view every time. Scoped to the fetch so a later refetch (when the view is outdated) starts fresh.
    const classCache = new Map<string, EC.Class>();
    const entry = (async () => {
      const { classHierarchyResolver, schemaView } = await getSchemaProviderContext(name);
      const svSchema = schemaView.getSchema(name);
      const schema = svSchema
        ? createECSchemaFromSchemaView(svSchema, { schemaView, classHierarchyResolver, classCache })
        : undefined;
      return { schemaView, schema };
    })();
    schemaCache.set(name, entry);
    // Drop rejected entries so a transient failure doesn't get cached permanently.
    /* v8 ignore next 4 -- defensive cleanup for rejected cache entries while a newer entry may have already replaced this one */
    entry.catch(() => {
      if (schemaCache.get(name) === entry) {
        schemaCache.delete(name);
      }
    });
    return entry;
  }

  return {
    async getSchema(name) {
      const cached = schemaCache.get(name);
      const entry = await (cached ?? fetchSchema(name));
      return entry.schemaView.isOutdated ? (await fetchSchema(name)).schema : entry.schema;
    },
    classDerivesFrom(
      derivedClassFullName: EC.FullClassNameDotNotation,
      candidateBaseClassFullName: EC.FullClassNameDotNotation,
    ): Promise<boolean> | boolean {
      // A class always derives from itself. This matches the semantics of the deprecated `ECClassHierarchyInspector`.
      if (derivedClassFullName === candidateBaseClassFullName) {
        return true;
      }
      const resolver = getClassHierarchyResolver();
      return resolver instanceof Promise
        ? resolver.then((r) => r.classDerivesFrom(derivedClassFullName, candidateBaseClassFullName))
        : resolver.classDerivesFrom(derivedClassFullName, candidateBaseClassFullName);
    },
  };
}

interface SchemaViewProviderContext {
  schemaView: PublicCoreSchemaView;
  classHierarchyResolver: ECClassHierarchyResolver;
  schema: EC.Schema;
  /** Shared cache of built `EC.Class` objects keyed by full class name, to avoid rebuilding them on every access. */
  classCache: Map<string, EC.Class>;
}

export function createECSchemaFromSchemaView(
  svSchema: CoreSchemaView.Schema,
  context: Omit<SchemaViewProviderContext, "schema">,
): EC.Schema {
  const ecSchema: EC.Schema = {
    name: svSchema.name,
    description: svSchema.description,
    version: { read: svSchema.readVersion, write: svSchema.writeVersion, minor: svSchema.minorVersion },
    isHidden: svSchema.isHidden,
    getClass(name) {
      const svClass = svSchema.getClass(name);
      return svClass ? getECClassFromSchemaView(svClass, { ...context, schema: ecSchema }) : undefined;
    },
    getEnumeration(name) {
      const svEnum = svSchema.getEnumeration(name);
      return svEnum ? createECEnumerationFromSchemaView(svEnum, ecSchema) : undefined;
    },
    getKindOfQuantity(name) {
      const svKoq = svSchema.getKindOfQuantity(name);
      return svKoq ? createECKoqFromSchemaView(svKoq, ecSchema) : undefined;
    },
    getPropertyCategory(name) {
      const svCategory = svSchema.getPropertyCategory(name);
      return svCategory ? createECPropertyCategoryFromSchemaView(svCategory, ecSchema) : undefined;
    },
  };
  return ecSchema;
}

/**
 * Cache-aware entry point for building an `EC.Class` from a schema view class: returns a previously built class for
 * the same full name, otherwise builds one via `createECClassFromSchemaView` and stores it in the context's cache.
 */
function getECClassFromSchemaView(svClass: CoreSchemaView.Class, context: SchemaViewProviderContext): EC.Class {
  // Key by the schema view's raw full name: it is a stable identifier for the class, so we avoid normalizing it on
  // every (hot) cache hit. `createECClassFromSchemaView` normalizes once, on a miss, for the `EC.Class.fullName` field.
  const cached = context.classCache.get(svClass.fullName);
  if (cached) {
    return cached;
  }
  const ecClass = createECClassFromSchemaView(svClass, context);
  context.classCache.set(svClass.fullName, ecClass);
  return ecClass;
}

export function createECClassFromSchemaView(
  svClass: CoreSchemaView.Class,
  context: SchemaViewProviderContext,
): EC.Class {
  const { classHierarchyResolver, schema } = context;
  const fullName = normalizeFullClassName(svClass.fullName);
  const ecClass: EC.Class = {
    schema,
    fullName,
    name: svClass.name,
    label: svClass.label,
    description: svClass.description,
    isHidden: svClass.isHidden,
    isEntityClass(): this is EC.EntityClass {
      return svClass.isEntity();
    },
    isRelationshipClass(): this is EC.RelationshipClass {
      return svClass.isRelationship();
    },
    isStructClass(): this is EC.StructClass {
      return svClass.isStruct();
    },
    isMixin(): this is EC.Mixin {
      return svClass.isMixin();
    },
    get baseClass(): EC.Class | undefined {
      return svClass.baseClass
        ? getECClassFromSchemaView(svClass.baseClass, {
            ...context,
            schema: useOrCreateSchema(svClass.baseClass.schema, context),
          })
        : undefined;
    },
    is(classOrClassName: EC.Class | string, schemaName?: string): boolean {
      if (typeof classOrClassName === "string") {
        return svClass.is(`${schemaName!}.${classOrClassName}`);
      }
      return svClass.is(classOrClassName.fullName);
    },
    getProperty(name: string): EC.Property | undefined {
      const svProp = svClass.getProperty(name);
      return svProp ? createECPropertyFromSchemaView(svProp, ecClass, context) : undefined;
    },
    getProperties(): EC.Property[] {
      return svClass.getProperties().map((p) => createECPropertyFromSchemaView(p, ecClass, context));
    },
    getOwnProperties(): EC.Property[] {
      return svClass.getOwnProperties().map((p) => createECPropertyFromSchemaView(p, ecClass, context));
    },
    getDerivedClassNames(props?: { onlyDirect?: boolean }): EC.FullClassNameDotNotation[] {
      return classHierarchyResolver.getDerivedClassNames(fullName, props);
    },
  };

  if (svClass.isEntity()) {
    const ecEntity: EC.EntityClass = {
      ...ecClass,
      getMixins(): EC.Mixin[] {
        return svClass.mixins.map((m) =>
          getECClassFromSchemaView(m, { ...context, schema: useOrCreateSchema(m.schema, context) }),
        );
      },
    };
    return ecEntity;
  }

  if (svClass.isRelationship()) {
    const ecRel: EC.RelationshipClass = {
      ...ecClass,
      direction: svClass.strengthDirection === StrengthDirection.Forward ? "Forward" : "Backward",
      source: svClass.source
        ? createECRelConstraintFromSchemaView(svClass.source, context)
        : createEmptyRelConstraint(),
      target: svClass.target
        ? createECRelConstraintFromSchemaView(svClass.target, context)
        : createEmptyRelConstraint(),
    };
    return ecRel;
  }

  return ecClass;
}

function useOrCreateSchema(svSchema: CoreSchemaView.Schema, context: SchemaViewProviderContext): EC.Schema {
  const { schema: currentSchema, ...schemalessContext } = context;
  if (svSchema.name === currentSchema.name) {
    return currentSchema;
  }
  return createECSchemaFromSchemaView(svSchema, schemalessContext);
}

function createEmptyRelConstraint(): EC.RelationshipConstraint {
  return {
    multiplicity: { lowerLimit: 0, upperLimit: 0 },
    polymorphic: false,
    constraintClasses: [],
    abstractConstraint: undefined,
  };
}

function createECRelConstraintFromSchemaView(
  svConstraint: CoreSchemaView.RelConstraint,
  context: SchemaViewProviderContext,
): EC.RelationshipConstraint {
  return {
    multiplicity: { lowerLimit: svConstraint.multiplicityLower, upperLimit: svConstraint.multiplicityUpper },
    polymorphic: svConstraint.polymorphic,
    get constraintClasses() {
      return svConstraint.constraintClasses.map((c) =>
        getECClassFromSchemaView(c, { ...context, schema: useOrCreateSchema(c.schema, context) }),
      );
    },
    get abstractConstraint(): EC.EntityClass | EC.Mixin | EC.RelationshipClass | undefined {
      // `SchemaView` only exposes an explicitly-defined abstract constraint. To match EC semantics (and the
      // standard `RelationshipConstraint` implementation), fall back to the sole constraint class when there's exactly one.
      const svClass =
        svConstraint.abstractConstraint ??
        (svConstraint.constraintClasses.length === 1 ? svConstraint.constraintClasses[0] : undefined);
      if (!svClass) {
        return undefined;
      }
      return getECClassFromSchemaView(svClass, { ...context, schema: useOrCreateSchema(svClass.schema, context) });
    },
  };
}

export function createECPropertyFromSchemaView(
  svProp: CoreSchemaView.Property,
  ecClass: EC.Class,
  context: SchemaViewProviderContext,
): EC.Property {
  const base: EC.Property = {
    // `svProp.declaringClass` is the class that declared or contributed this property (a base class for an
    // inherited property, or a mixin for a mixin-contributed one). It's `undefined` only for view properties,
    // in which case we fall back to the class the property was enumerated from.
    get class(): EC.Class {
      return svProp.declaringClass
        ? getECClassFromSchemaView(svProp.declaringClass, {
            ...context,
            schema: useOrCreateSchema(svProp.declaringClass.schema, context),
          })
        : ecClass;
    },
    name: svProp.name,
    description: svProp.description,
    label: svProp.label,
    isHidden: svProp.isHidden,
    get category(): EC.PropertyCategory | undefined {
      return svProp.category
        ? createECPropertyCategoryFromSchemaView(svProp.category, useOrCreateSchema(svProp.category.schema, context))
        : undefined;
    },
    isArray(): this is EC.ArrayProperty {
      return svProp.isArray();
    },
    isStruct(): this is EC.StructProperty {
      return false;
    },
    isPrimitive(): this is EC.PrimitiveProperty {
      return false;
    },
    isEnumeration(): this is EC.EnumerationProperty {
      return false;
    },
    isNavigation(): this is EC.NavigationProperty {
      return false;
    },
  };

  if (svProp.isNavigation()) {
    return {
      ...base,
      isNavigation(): this is EC.NavigationProperty {
        return true;
      },
      get direction() {
        return svProp.direction === StrengthDirection.Forward ? "Forward" : "Backward";
      },
      get relationshipClass(): EC.RelationshipClass {
        return getECClassFromSchemaView(svProp.relationshipClass, {
          ...context,
          schema: useOrCreateSchema(svProp.relationshipClass.schema, context),
        }) as EC.RelationshipClass;
      },
    } satisfies EC.NavigationProperty;
  }

  // Check enumeration before primitive (enum is a facet of primitive in CoreSchemaView, but separate in EC)
  if (svProp.isEnumeration()) {
    const arrayFields = svProp.isArray()
      ? { minOccurs: svProp.arrayMinOccurs ?? 0, maxOccurs: svProp.arrayMaxOccurs }
      : undefined;
    return {
      ...base,
      ...arrayFields,
      isEnumeration(): this is EC.EnumerationProperty {
        return true;
      },
      isArray(): this is EC.ArrayProperty {
        return svProp.isArray();
      },
      get extendedTypeName() {
        return svProp.extendedTypeName;
      },
      get enumeration(): EC.Enumeration | undefined {
        return svProp.enumeration
          ? createECEnumerationFromSchemaView(svProp.enumeration, useOrCreateSchema(svProp.enumeration.schema, context))
          : undefined;
      },
    } satisfies EC.EnumerationProperty | EC.EnumerationArrayProperty;
  }

  if (svProp.isPrimitive()) {
    const arrayFields = svProp.isArray()
      ? { minOccurs: svProp.arrayMinOccurs ?? 0, maxOccurs: svProp.arrayMaxOccurs }
      : undefined;
    return {
      ...base,
      ...arrayFields,
      isPrimitive(): this is EC.PrimitiveProperty {
        return true;
      },
      isArray(): this is EC.ArrayProperty {
        return svProp.isArray();
      },
      get primitiveType() {
        return mapSchemaViewPrimitiveType(svProp.primitiveType);
      },
      get extendedTypeName() {
        return svProp.extendedTypeName;
      },
      get kindOfQuantity(): EC.KindOfQuantity | undefined {
        return svProp.kindOfQuantity
          ? createECKoqFromSchemaView(svProp.kindOfQuantity, useOrCreateSchema(svProp.kindOfQuantity.schema, context))
          : undefined;
      },
    } satisfies EC.PrimitiveProperty | EC.PrimitiveArrayProperty;
  }

  if (svProp.isStruct()) {
    const arrayFields = svProp.isArray()
      ? { minOccurs: svProp.arrayMinOccurs ?? 0, maxOccurs: svProp.arrayMaxOccurs }
      : undefined;
    return {
      ...base,
      ...arrayFields,
      isStruct(): this is EC.StructProperty {
        return true;
      },
      isArray(): this is EC.ArrayProperty {
        return svProp.isArray();
      },
      get structClass(): EC.StructClass {
        return getECClassFromSchemaView(svProp.structClass, {
          ...context,
          schema: useOrCreateSchema(svProp.structClass.schema, context),
        });
      },
    } satisfies EC.StructProperty | EC.StructArrayProperty;
  }

  throw new Error(
    `Unexpected property type for ${svProp.declaringClass ? svProp.declaringClass.fullName : "<ECCView>"}.${svProp.name}`,
  );
}

function mapSchemaViewPrimitiveType(svType: SchemaViewPrimitiveType): EC.PrimitiveType {
  switch (svType) {
    case SchemaViewPrimitiveType.Binary:
      return "Binary";
    case SchemaViewPrimitiveType.Boolean:
      return "Boolean";
    case SchemaViewPrimitiveType.DateTime:
      return "DateTime";
    case SchemaViewPrimitiveType.Double:
      return "Double";
    case SchemaViewPrimitiveType.IGeometry:
      return "IGeometry";
    case SchemaViewPrimitiveType.Integer:
      return "Integer";
    case SchemaViewPrimitiveType.Long:
      return "Long";
    case SchemaViewPrimitiveType.Point2d:
      return "Point2d";
    case SchemaViewPrimitiveType.Point3d:
      return "Point3d";
    case SchemaViewPrimitiveType.String:
      return "String";
  }
  throw new Error(`Uninitialized CoreSchemaView primitive type: ${svType}`);
}

function createECEnumerationFromSchemaView(svEnum: CoreSchemaView.Enumeration, schema: EC.Schema): EC.Enumeration {
  return {
    schema,
    fullName: normalizeFullClassName(svEnum.fullName),
    name: svEnum.name,
    label: svEnum.label,
    description: svEnum.description,
    type: svEnum.primitiveType === SchemaViewPrimitiveType.Integer ? "Number" : "String",
    isStrict: svEnum.isStrict,
    enumerators: [...svEnum.getEnumerators()].map((e) => ({ name: e.name, label: e.label, value: e.value })),
  };
}

function createECKoqFromSchemaView(svKoq: CoreSchemaView.KindOfQuantity, schema: EC.Schema): EC.KindOfQuantity {
  return {
    schema,
    fullName: normalizeFullClassName(svKoq.fullName),
    name: svKoq.name,
    label: svKoq.label,
    description: svKoq.description,
    relativeError: svKoq.relativeError,
    persistenceUnit: svKoq.persistenceUnit,
  };
}

function createECPropertyCategoryFromSchemaView(
  svCategory: CoreSchemaView.PropertyCategory,
  schema: EC.Schema,
): EC.PropertyCategory {
  return {
    schema,
    fullName: normalizeFullClassName(svCategory.fullName),
    name: svCategory.name,
    label: svCategory.label,
    description: svCategory.description,
    priority: svCategory.priority,
  };
}

/** @internal */
export interface ECClassHierarchyResolver {
  /** Check if the derived class derives from the candidate base class. */
  classDerivesFrom(
    derivedClassFullName: EC.FullClassNameDotNotation,
    candidateBaseClassFullName: EC.FullClassNameDotNotation,
  ): boolean;
  /** Get names of all derived classes of the specified class. */
  getDerivedClassNames(
    classFullName: EC.FullClassNameDotNotation,
    options?: { onlyDirect?: boolean },
  ): EC.FullClassNameDotNotation[];
}

/** @internal */
export async function createECClassHierarchyResolver(
  imodel: CoreECSqlReaderFactory,
): Promise<ECClassHierarchyResolver> {
  const baseToDerivedMap = new Map<EC.FullClassNameDotNotation, Set<EC.FullClassNameDotNotation>>();
  const derivedToBaseMap = new Map<EC.FullClassNameDotNotation, Set<EC.FullClassNameDotNotation>>();
  const ecsql = `
    SELECT
      ec_classname(rel.SourceECInstanceId, 's.c'),
      ec_classname(rel.TargetECInstanceId, 's.c')
    FROM meta.ClassHasBaseClasses rel
  `;
  const reader = imodel.createQueryReader(ecsql);
  for await (const row of reader) {
    const derivedClass = row[0] as EC.FullClassNameDotNotation;
    const baseClass = row[1] as EC.FullClassNameDotNotation;

    let baseToDerivedEntry = baseToDerivedMap.get(baseClass);
    if (!baseToDerivedEntry) {
      baseToDerivedEntry = new Set<EC.FullClassNameDotNotation>();
      baseToDerivedMap.set(baseClass, baseToDerivedEntry);
    }
    baseToDerivedEntry.add(derivedClass);

    let derivedToBaseEntry = derivedToBaseMap.get(derivedClass);
    if (!derivedToBaseEntry) {
      derivedToBaseEntry = new Set<EC.FullClassNameDotNotation>();
      derivedToBaseMap.set(derivedClass, derivedToBaseEntry);
    }
    derivedToBaseEntry.add(baseClass);
  }

  /**
   * TODO: We don't really need this in schema provider, but maybe this function should become part of it? Would allow us to drop
   * ECClassHierarchyInspector, whose implementation currently has to load schemas (this one doesn't).
   */
  function classDerivesFrom(
    derivedClassFullName: EC.FullClassNameDotNotation,
    candidateBaseClassFullName: EC.FullClassNameDotNotation,
  ): boolean {
    const baseClasses = derivedToBaseMap.get(derivedClassFullName);
    return baseClasses
      ? baseClasses.has(candidateBaseClassFullName) ||
          baseClasses.values().some((baseClass) => classDerivesFrom(baseClass, candidateBaseClassFullName))
      : false;
  }

  function getDerivedClassNames(
    classFullName: EC.FullClassNameDotNotation,
    options?: { onlyDirect?: boolean },
  ): EC.FullClassNameDotNotation[] {
    const derivedClasses = baseToDerivedMap.get(classFullName);
    if (!derivedClasses) {
      return [];
    }
    if (options?.onlyDirect) {
      return [...derivedClasses];
    }
    const allDerivedClasses = new Set<EC.FullClassNameDotNotation>();
    for (const derivedClass of derivedClasses) {
      allDerivedClasses.add(derivedClass);
      getDerivedClassNames(derivedClass, options).forEach((subDerivedClass) => allDerivedClasses.add(subDerivedClass));
    }
    return Array.from(allDerivedClasses);
  }

  return { classDerivesFrom, getDerivedClassNames };
}
