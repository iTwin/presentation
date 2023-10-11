/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECPrimitiveType } from "../Metadata";

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

/**
 * An identifiers' union of all supported primitive value types.
 * @beta
 */
export type PrimitiveValueType = "Id" | Exclude<ECPrimitiveType, "Binary" | "IGeometry">;

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
 * A type for a primitive property value and its metadata - property name and its class full name.
 * @beta
 */
export interface PropertyValue {
  className: string;
  propertyName: string;
  value: PrimitiveValue;
}
