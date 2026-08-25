/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { compareStrings, Id64 } from "@itwin/core-bentley";

import type { Id64String } from "@itwin/core-bentley";
import type { EC, PrimitiveValueType } from "./Metadata.js";

/**
 * A data structure uniquely identifying an ECInstance in an iModel.
 * @public
 */
export interface InstanceKey {
  /** Full class name in format `SchemaName.ClassName` */
  className: EC.FullClassNameDotNotation;
  /** ECInstance ID */
  id: Id64String;
}

/** @public */
export namespace InstanceKey {
  /**
   * Checks whether the two given instance keys are equal.
   * @public
   */
  export function equals(lhs: InstanceKey, rhs: InstanceKey): boolean {
    return compare(lhs, rhs) === 0;
  }
  /**
   * Compares two given instance keys.
   * @returns
   *- `0` if they are equal
   *- `negative value` if lhs key is less than rhs key
   *- `positive value` if lhs key is more than rhs key
   */
  export function compare(lhs: InstanceKey, rhs: InstanceKey): number {
    const classNameCompareResult = compareStrings(lhs.className, rhs.className);
    if (classNameCompareResult !== 0) {
      return classNameCompareResult;
    }
    return compareStrings(lhs.id, rhs.id);
  }
}

/**
 * A data structure for a 2d point.
 * @public
 */
export interface Point2dValue {
  x: number;
  y: number;
}

/**
 * A data structure for a 3d point.
 * @public
 */
export interface Point3dValue {
  x: number;
  y: number;
  z: number;
}

/**
 * A union for all supported primitive value types.
 * @public
 */
export type PrimitiveValue = Id64String | string | number | boolean | Date | Point2dValue | Point3dValue;

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace PrimitiveValue {
  /**
   * Checks whether the given value is a `Point2dValue`.
   * @note Since `Point3dValue` is a superset of `Point2dValue`, this function will return `true` for `Point3dValue` as well.
   * @public
   */
  export function isPoint2d(value: PrimitiveValue): value is Point2dValue {
    if (typeof value !== "object") {
      return false;
    }
    return "x" in value && "y" in value;
  }

  /**
   * Checks whether the given value is a `Point3dValue`.
   * @public
   */
  export function isPoint3d(value: PrimitiveValue): value is Point3dValue {
    if (typeof value !== "object") {
      return false;
    }
    return "x" in value && "y" in value && "z" in value;
  }
}

/**
 * A type for a primitive value, its type and, optionally, its extended type.
 * @note Use `TypedPrimitiveValue.create` to create an instance of this type.
 * @public
 */
export type TypedPrimitiveValue = (
  | { value: number; type: Extract<PrimitiveValueType, "Double">; koqName?: string }
  | { value: number; type: Extract<PrimitiveValueType, "Integer">; koqName?: string }
  | { value: number; type: Extract<PrimitiveValueType, "Long">; koqName?: string }
  | { value: boolean; type: Extract<PrimitiveValueType, "Boolean"> }
  | { value: Id64String; type: Extract<PrimitiveValueType, "Id"> }
  | { value: string; type: Extract<PrimitiveValueType, "String"> }
  | {
      value: number | string | Date; // julian day format, ISO format or `Date`
      type: Extract<PrimitiveValueType, "DateTime">;
    }
  | { value: Point2dValue; type: Extract<PrimitiveValueType, "Point2d"> }
  | { value: Point3dValue; type: Extract<PrimitiveValueType, "Point3d"> }
) & { extendedType?: string };

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace TypedPrimitiveValue {
  /**
   * A function for a creating a `TypedPrimitiveValue` object.
   * @throws Error if primitive type and value are incompatible.
   * @public
   */
  export function create<TValue extends PrimitiveValue, TType extends PrimitiveValueType>(
    value: TValue,
    type: TType,
    koqName?: string,
    extendedType?: string,
  ): Extract<TypedPrimitiveValue, { type: TType }> {
    // The function's return type narrows `TypedPrimitiveValue` based on the generic `TType`. TypeScript can't verify that the
    // objects created below satisfy that narrowed type, because narrowing the `type`/`value` variables via control flow doesn't
    // narrow the `TType` type parameter itself (it stays generic within the function body). So we build the value with a concrete
    // `TypedPrimitiveValue` return type - which TypeScript does check branch-by-branch - and apply the narrowing with a single
    // cast at the boundary, rather than casting every `return` statement individually.
    return (function (): TypedPrimitiveValue {
      switch (type) {
        case "Double":
        case "Integer":
        case "Long":
          if (typeof value === "number") {
            return { type, koqName, extendedType, value };
          }
          break;
        case "Boolean":
          if (typeof value === "boolean") {
            return { type, extendedType, value };
          }
          break;
        case "Id":
          if (typeof value === "string" && Id64.isId64(value)) {
            return { type, extendedType, value };
          }
          break;
        case "String":
          if (typeof value === "string") {
            return { type, extendedType, value };
          }
          break;
        case "DateTime":
          if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
            return { type, extendedType, value };
          }
          break;
        case "Point3d":
          if (PrimitiveValue.isPoint3d(value)) {
            return { type, extendedType, value };
          }
          break;
        case "Point2d":
          if (PrimitiveValue.isPoint2d(value)) {
            return { type, extendedType, value };
          }
          break;
      }
      throw new Error(`PrimitiveValueType ${type} isn't compatible with value ${JSON.stringify(value)}`);
    })() as Extract<TypedPrimitiveValue, { type: TType }>;
  }
}

/**
 * A composite value representing a struct (named record with member values).
 * @public
 */
export interface StructValue {
  [memberName: string]: Value;
}

/**
 * A composite value representing an array of values.
 * @public
 */
export type ArrayValue = Value[];

/**
 * Any value that can be assigned to an ECInstance — a primitive, struct, array, or undefined (null/empty).
 * @public
 */
export type Value = PrimitiveValue | StructValue | ArrayValue | undefined;
