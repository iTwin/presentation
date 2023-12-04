/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { PrimitiveValueType } from "../Metadata";

/**
 * A string representing a 64 bit number in hex.
 * @see [Id64String]($core-bentley)
 * @beta
 */
export type Id64String = string;

/**
 * A data structure uniquely identifying an ECInstance in an iModel.
 * @beta
 */
export interface InstanceKey {
  /** Full class name in format `SchemaName.ClassName` */
  className: string;
  /** ECInstance ID */
  id: Id64String;
}

/** @beta */
export namespace InstanceKey {
  /**
   * Checks whether the two given instance keys are equal.
   * @beta
   */
  export function equals(lhs: InstanceKey, rhs: InstanceKey): boolean {
    return lhs.className === rhs.className && lhs.id === rhs.id;
  }
}

/**
 * A data structure for a 2d point.
 * @beta
 */
export interface Point2d {
  x: number;
  y: number;
}

/**
 * A data structure for a 3d point.
 * @beta
 */
export interface Point3d {
  x: number;
  y: number;
  z: number;
}

/**
 * A union for all supported primitive value types.
 * @beta
 */
export type PrimitiveValue = Id64String | string | number | boolean | Date | Point2d | Point3d;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace PrimitiveValue {
  /** @beta */
  export function isPoint2d(value: PrimitiveValue): value is Point2d {
    if (typeof value !== "object") {
      return false;
    }
    const pt = value as Point2d;
    return pt.x !== undefined && pt.y !== undefined;
  }
  /** @beta */
  export function isPoint3d(value: PrimitiveValue): value is Point3d {
    if (typeof value !== "object") {
      return false;
    }
    const pt = value as Point3d;
    return pt.x !== undefined && pt.y !== undefined && pt.z !== undefined;
  }
}

/**
 * A type for a primitive value, its type and, optionally, its extended type.
 * @beta
 */
export type TypedPrimitiveValue = (
  | {
      value: number;
      type: "Integer" | "Long";
    }
  | {
      value: number;
      type: "Double";
      koqName?: string;
    }
  | {
      value: boolean;
      type: "Boolean";
    }
  | {
      value: Id64String;
      type: "Id";
    }
  | {
      value: string;
      type: "String";
    }
  | {
      value: number | string | Date; // julian day format, ISO format or `Date`
      type: "DateTime";
    }
  | {
      value: Point2d;
      type: "Point2d";
    }
  | {
      value: Point3d;
      type: "Point3d";
    }
) & {
  extendedType?: string;
};

/**
 * A namespace for a primitive value.
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace TypedPrimitiveValue {
  /**
   * A function for a creating a [[TypedPrimitiveValue]] object. Throws if primitive type and value is incompatible.
   * @beta
   */
  export function create(value: PrimitiveValue, type: PrimitiveValueType, koqName?: string, extendedType?: string): TypedPrimitiveValue {
    switch (type) {
      case "Integer":
      case "Long":
        if (typeof value === "number") {
          return {
            type,
            extendedType,
            value,
          };
        }
        break;
      case "Double":
        if (typeof value === "number") {
          return {
            type,
            koqName,
            extendedType,
            value,
          };
        }
        break;
      case "Boolean":
        if (typeof value === "boolean") {
          return {
            type,
            extendedType,
            value,
          };
        }
        break;
      case "Id":
        if (typeof value === "string" && Id64.isId64(value)) {
          return {
            type,
            extendedType,
            value,
          };
        }
        break;
      case "String":
        if (typeof value === "string") {
          return {
            type,
            extendedType,
            value,
          };
        }
        break;
      case "DateTime":
        if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
          return {
            type,
            extendedType,
            value,
          };
        }
        break;
      case "Point2d":
        if (PrimitiveValue.isPoint2d(value)) {
          return {
            type,
            extendedType,
            value,
          };
        }
        break;
      case "Point3d":
        if (PrimitiveValue.isPoint3d(value)) {
          return {
            type,
            extendedType,
            value,
          };
        }
        break;
    }

    throw new Error(`primitiveType: '${type}' isn't compatible with value: '${JSON.stringify(value)}'`);
  }
}

/**
 * A type for a primitive property value and its metadata - property name and its class full name.
 * @beta
 */
export interface PropertyValue {
  className: string;
  propertyName: string;
  value: PrimitiveValue;
}
