/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { SchemaViewPrimitiveType, StrengthDirection } from "@itwin/ecschema-metadata";
import { normalizeFullClassName } from "@itwin/presentation-shared";

import type { SchemaView } from "@itwin/ecschema-metadata";
import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";

/**
 * Subset of [SchemaView](https://www.itwinjs.org/reference/ecschema-metadata/context/schemaview/) API surface that
 * is `@public` and can be used by `createECSchemaProvider` function.
 *
 * @public
 */
export type PublicSchemaView = Pick<
  SchemaView,
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

export function createECSchemaProviderFromSchemaView(sv: PublicSchemaView): ECSchemaProvider {
  return {
    async getSchema(name) {
      const svSchema = sv.getSchema(name);
      return svSchema ? createECSchemaFromSchemaView(svSchema, sv) : undefined;
    },
  };
}

export function createECSchemaFromSchemaView(svSchema: SchemaView.Schema, sv: PublicSchemaView): EC.Schema {
  const ecSchema: EC.Schema = {
    name: svSchema.name,
    version: { read: svSchema.readVersion, write: svSchema.writeVersion, minor: svSchema.minorVersion },
    isHidden: svSchema.isHidden,
    getClass(name) {
      const svClass = svSchema.getClass(name);
      return svClass ? createECClassFromSchemaView(svClass, sv, ecSchema) : undefined;
    },
  };
  return ecSchema;
}

export function createECClassFromSchemaView(
  svClass: SchemaView.Class,
  sv: PublicSchemaView,
  schema: EC.Schema,
): EC.Class {
  const ecClass: EC.Class = {
    schema,
    fullName: normalizeFullClassName(svClass.fullName),
    name: svClass.name,
    label: svClass.label,
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
        ? createECClassFromSchemaView(svClass.baseClass, sv, useOrCreateSchema(svClass.baseClass.schema, sv, schema))
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
      return svProp ? createECPropertyFromSchemaView(svProp, ecClass, sv) : undefined;
    },
    getProperties(): EC.Property[] {
      return svClass.getProperties().map((p) => createECPropertyFromSchemaView(p, ecClass, sv));
    },
    getDerivedClasses(): EC.Class[] {
      return svClass.derivedClasses.map((c) =>
        createECClassFromSchemaView(c, sv, useOrCreateSchema(c.schema, sv, schema)),
      );
    },
  };

  if (svClass.isRelationship()) {
    const ecRel: EC.RelationshipClass = {
      ...ecClass,
      direction: svClass.strengthDirection === StrengthDirection.Forward ? "Forward" : "Backward",
      source: svClass.source
        ? createECRelConstraintFromSchemaView(svClass.source, schema, sv)
        : createEmptyRelConstraint(),
      target: svClass.target
        ? createECRelConstraintFromSchemaView(svClass.target, schema, sv)
        : createEmptyRelConstraint(),
    };
    return ecRel;
  }

  return ecClass;
}

function useOrCreateSchema(svSchema: SchemaView.Schema, sv: PublicSchemaView, useLikelySchema: EC.Schema): EC.Schema {
  if (svSchema.name === useLikelySchema.name) {
    return useLikelySchema;
  }
  return createECSchemaFromSchemaView(svSchema, sv);
}

function createEmptyRelConstraint(): EC.RelationshipConstraint {
  return { multiplicity: { lowerLimit: 0, upperLimit: 0 }, polymorphic: false, abstractConstraint: undefined };
}

function createECRelConstraintFromSchemaView(
  svConstraint: SchemaView.RelConstraint,
  schema: EC.Schema,
  sv: PublicSchemaView,
): EC.RelationshipConstraint {
  return {
    multiplicity: { lowerLimit: svConstraint.multiplicityLower, upperLimit: svConstraint.multiplicityUpper },
    polymorphic: svConstraint.polymorphic,
    get abstractConstraint(): EC.EntityClass | EC.Mixin | EC.RelationshipClass | undefined {
      const svClass = svConstraint.abstractConstraint;
      if (!svClass) {
        return undefined;
      }
      return createECClassFromSchemaView(svClass, sv, useOrCreateSchema(svClass.schema, sv, schema));
    },
  };
}

export function createECPropertyFromSchemaView(
  svProp: SchemaView.Property,
  ecClass: EC.Class,
  sv: PublicSchemaView,
): EC.Property {
  const base: EC.Property = {
    class: ecClass,
    name: svProp.name,
    label: svProp.label,
    isHidden: svProp.isHidden,
    kindOfQuantity: undefined,
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
        return svProp.direction === StrengthDirection.Forward ? ("Forward" as const) : ("Backward" as const);
      },
      get relationshipClass(): EC.RelationshipClass {
        return createECClassFromSchemaView(
          svProp.relationshipClass,
          sv,
          useOrCreateSchema(svProp.relationshipClass.schema, sv, ecClass.schema),
        ) as EC.RelationshipClass;
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
          ? createECEnumerationFromSchemaView(
              svProp.enumeration,
              useOrCreateSchema(svProp.enumeration.schema, sv, ecClass.schema),
            )
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
          ? createECKoqFromSchemaView(
              svProp.kindOfQuantity,
              useOrCreateSchema(svProp.kindOfQuantity.schema, sv, ecClass.schema),
            )
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
        return createECClassFromSchemaView(
          svProp.structClass,
          sv,
          useOrCreateSchema(svProp.structClass.schema, sv, ecClass.schema),
        );
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

function createECEnumerationFromSchemaView(svEnum: SchemaView.Enumeration, schema: EC.Schema): EC.Enumeration {
  return {
    schema,
    fullName: normalizeFullClassName(svEnum.fullName),
    name: svEnum.name,
    label: svEnum.label,
    type: svEnum.primitiveType === SchemaViewPrimitiveType.Integer ? "Number" : "String",
    isStrict: svEnum.isStrict,
    enumerators: [...svEnum.getEnumerators()].map((e) => ({ name: e.name, label: e.label, value: e.value })),
  };
}

function createECKoqFromSchemaView(svKoq: SchemaView.KindOfQuantity, schema: EC.Schema): EC.KindOfQuantity {
  return { schema, fullName: normalizeFullClassName(svKoq.fullName), name: svKoq.name, label: svKoq.label };
}
