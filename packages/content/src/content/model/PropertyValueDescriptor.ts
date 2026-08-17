/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { EC, PrimitiveValueDescriptor, StructValueDescriptor, ValueDescriptor } from "@itwin/presentation-shared";

/** The set of primitive value types supported by a `PrimitiveValueDescriptor`. */
type PrimitiveValueType = PrimitiveValueDescriptor["type"];

/**
 * Builds a {@link ValueDescriptor} describing the value shape of an EC property.
 *
 * Returns `undefined` when the property's type is not supported by the content pipeline
 * (currently `Binary` and `IGeometry` primitives) — callers should drop such properties.
 *
 * Array properties are wrapped as `{ kind: "array", elementType }` around their scalar element
 * shape. Navigation properties become `{ kind: "navigation", targetClassName }` carrying the
 * relationship's target-constraint class (the runtime value stays a bare id). Enumeration properties
 * become a `primitive` descriptor of their backing type with the enumeration's metadata preserved on
 * `enumeration` (the runtime value stays the raw backing value).
 *
 * @internal
 */
export function createValueDescriptorFromProperty(property: EC.Property): ValueDescriptor | undefined {
  const scalar = createScalarValueDescriptor(property);
  if (scalar === undefined) {
    return undefined;
  }
  if (property.isArray()) {
    return { kind: "array", elementType: scalar };
  }
  return scalar;
}

/** Builds the descriptor for a property's scalar shape, ignoring array-ness. */
function createScalarValueDescriptor(property: EC.Property): ValueDescriptor | undefined {
  if (property.isNavigation()) {
    return createNavigationValueDescriptor(property);
  }
  if (property.isEnumeration()) {
    return createEnumerationValueDescriptor(property);
  }
  if (property.isStruct()) {
    return createStructValueDescriptor(property);
  }
  if (property.isPrimitive()) {
    const type = toPrimitiveValueType(property.primitiveType);
    if (type === undefined) {
      return undefined;
    }
    return createPrimitiveValueDescriptor(type, property.kindOfQuantity?.fullName);
  }
  return undefined;
}

function createNavigationValueDescriptor(property: EC.NavigationProperty): ValueDescriptor | undefined {
  const relationship = property.relationshipClass;
  const constraint = property.direction === "Forward" ? relationship.target : relationship.source;
  const constraintClass = constraint.abstractConstraint;
  if (!constraintClass) {
    return undefined;
  }
  return { kind: "navigation", targetClassName: constraintClass.fullName };
}

function createEnumerationValueDescriptor(property: EC.EnumerationProperty): PrimitiveValueDescriptor {
  const enumeration = property.enumeration;
  // EC enumerations are backed by either `int` or `string`. The abstract metadata only exposes the
  // coarse `"String" | "Number"` distinction, so numeric enumerations map to `Integer`.
  if (enumeration) {
    return enumeration.type === "String"
      ? {
          kind: "primitive",
          type: "String",
          enumeration: {
            name: enumeration.fullName,
            isStrict: enumeration.isStrict,
            enumerators: enumeration.enumerators.map((enumerator) => toEnumerator<string>(enumerator)),
          },
        }
      : {
          kind: "primitive",
          type: "Integer",
          enumeration: {
            name: enumeration.fullName,
            isStrict: enumeration.isStrict,
            enumerators: enumeration.enumerators.map((enumerator) => toEnumerator<number>(enumerator)),
          },
        };
  }
  return { kind: "primitive", type: "String" };
}

function toEnumerator<TValue extends string | number>(
  enumerator: EC.Enumerator<string | number>,
): { value: TValue; label: string; description?: string } {
  return {
    label: enumerator.label ?? enumerator.name,
    value: enumerator.value as TValue,
    ...(enumerator.description !== undefined ? { description: enumerator.description } : undefined),
  };
}

function createStructValueDescriptor(property: EC.StructProperty): StructValueDescriptor {
  const members: StructValueDescriptor["members"] = [];
  for (const member of property.structClass.getProperties()) {
    const type = createValueDescriptorFromProperty(member);
    if (type === undefined) {
      continue;
    }
    members.push({ name: member.name, label: member.label ?? member.name, type });
  }
  return { kind: "struct", members };
}

function createPrimitiveValueDescriptor(
  type: PrimitiveValueType,
  kindOfQuantity: string | undefined,
): PrimitiveValueDescriptor {
  switch (type) {
    case "Integer":
    case "Double":
    case "Long":
      return kindOfQuantity !== undefined ? { kind: "primitive", type, kindOfQuantity } : { kind: "primitive", type };
    default:
      return { kind: "primitive", type };
  }
}

/** Maps an `EC.PrimitiveType` to a `PrimitiveValueType`, or `undefined` for unsupported types. */
function toPrimitiveValueType(type: EC.PrimitiveType): PrimitiveValueType | undefined {
  if (type === "Binary" || type === "IGeometry") {
    return undefined;
  }
  return type;
}
