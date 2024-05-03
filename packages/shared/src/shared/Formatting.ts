/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { ConcatenatedValue, ConcatenatedValuePart } from "./ConcatenatedValue";
import { julianToDateTime } from "./InternalUtils";
import { ECSchemaProvider, getClass } from "./Metadata";
import { TypedPrimitiveValue } from "./Values";

/**
 * A type definition for a function that knows how to create a display string for a typed primitive value.
 * @see `createDefaultValueFormatter`
 * @beta
 */
export type IPrimitiveValueFormatter = (value: TypedPrimitiveValue) => Promise<string>;

/**
 * Formats a concatenated value into a string, taking into account different types of `ConcatenatedValuePart` that
 * the value consists of.
 *
 * @throws Error if a `ConcatenatedValuePart` in given `ConcatenatedValue` references a non-primitive, `IGeometry` or `Binary` property.
 * @beta
 */
export async function formatConcatenatedValue(props: {
  value: ConcatenatedValue | string;
  schemaProvider: ECSchemaProvider;
  valueFormatter: IPrimitiveValueFormatter;
}): Promise<string> {
  const { value, schemaProvider, valueFormatter } = props;
  if (typeof value === "string") {
    return valueFormatter({ value, type: "String" });
  }
  return ConcatenatedValue.serialize({
    parts: value,
    partFormatter: async (part) => {
      // strings are converted to typed strings
      if (ConcatenatedValuePart.isString(part)) {
        part = {
          value: part,
          type: "String",
        };
      }
      // for property parts - find property metadata and create `TypedPrimitiveValue` for them.
      if (ConcatenatedValuePart.isProperty(part)) {
        const property = await getProperty(part, schemaProvider);
        if (!property?.isPrimitive()) {
          throw new Error(`Concatenated values formatter expects a primitive property, but it's not.`);
        }
        if (property.primitiveType === "IGeometry") {
          throw new Error(
            `Concatenated values formatter does not support "IGeometry" values, but the provided ${part.className}.${part.propertyName} property is.`,
          );
        }
        if (property.primitiveType === "Binary") {
          throw new Error(
            `Concatenated values formatter does not support "Binary" values, but the provided ${part.className}.${part.propertyName} property is.`,
          );
        }
        part = {
          type: property.primitiveType,
          extendedType: property.extendedTypeName,
          koqName: (await property.kindOfQuantity)?.fullName,
          value: part.value,
        } as TypedPrimitiveValue;
      }
      // finally, use provided value formatter to create a string from `TypedPrimitiveValue`
      return valueFormatter(part);
    },
  });
}

async function getProperty({ className, propertyName }: { className: string; propertyName: string }, schemaProvider: ECSchemaProvider) {
  const propertyClass = await getClass(schemaProvider, className);
  return propertyClass.getProperty(propertyName);
}

/**
 * A values' formatter that knows how to format the following types:
 * - `Boolean` values are formatted to either "true" or "false".
 * - `Integer` and `Long` values are rounded to the closest integer.
 * - `Double` values are rounded to 2 decimal places.
 * - `DateTime` values accept 2 formats in addition to `Date`:
 *   - if the value is numeric, assume it's a julian day format,
 *   - if the value is string, assume it's an ISO 8601 format.
 *   If extended type is set to `ShortDate`, the date is formatted as locale date string. Otherwise, it's
 *   formatted as locale date + time string.
 * - `Point2d` values are formatted in `(x, y)` format.
 * - `Point3d` values are formatted in `(x, y, z)` format.
 * - `String` and `Id` values are turned as-is.
 *
 * @beta
 */
export function createDefaultValueFormatter(): IPrimitiveValueFormatter {
  const formatters = [applyBooleanFormatting, applyNumericFormatting, applyDatesFormatting, applyPointsFormatting];
  return async function (value: TypedPrimitiveValue): Promise<string> {
    for (const formatter of formatters) {
      const result = formatter(value);
      if (!!result) {
        return result;
      }
    }

    assert(typeof value.value === "undefined" || typeof value.value === "boolean" || typeof value.value === "number" || typeof value.value === "string");
    return value.value.toString();
  };
}

function applyBooleanFormatting(value: TypedPrimitiveValue) {
  if (value.type === "Boolean") {
    return Boolean(value.value).toString();
  }
  return undefined;
}

function applyNumericFormatting(value: TypedPrimitiveValue) {
  if (value.type === "Integer" || value.type === "Long") {
    return Math.round(value.value).toLocaleString();
  }
  if (value.type === "Double") {
    return value.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return undefined;
}

function applyDatesFormatting(value: TypedPrimitiveValue) {
  function getDate(julianOrDate: number | string | Date): Date {
    return typeof julianOrDate === "number" ? julianToDateTime(julianOrDate) : typeof julianOrDate === "string" ? new Date(julianOrDate) : julianOrDate;
  }
  if (value.type !== "DateTime") {
    return undefined;
  }
  if (value.extendedType === "ShortDate") {
    return getDate(value.value).toLocaleDateString();
  }
  return getDate(value.value).toLocaleString();
}

function applyPointsFormatting(value: TypedPrimitiveValue) {
  function formatComponent(n: number) {
    return applyNumericFormatting({ type: "Double", value: n })!;
  }
  if (value.type === "Point3d") {
    return `(${formatComponent(value.value.x)}, ${formatComponent(value.value.y)}, ${formatComponent(value.value.z)})`;
  }
  if (value.type === "Point2d") {
    return `(${formatComponent(value.value.x)}, ${formatComponent(value.value.y)})`;
  }
  return undefined;
}
