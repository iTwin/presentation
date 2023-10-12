/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { julianToDateTime } from "../internal/Common";
import { TypedPrimitiveValue } from "./Values";

/**
 * A type definition for a function that knows how to create a display string for a typed primitive value.
 * @see [[createDefaultValueFormatter]]
 * @beta
 */
export type IPrimitiveValueFormatter = (value: TypedPrimitiveValue) => Promise<string>;

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
 * @beta
 */
export function createDefaultValueFormatter(): IPrimitiveValueFormatter {
  const formatters = [convertECInstanceIdSuffixToBase36, applyBooleanFormatting, applyNumericFormatting, applyDatesFormatting, applyPointsFormatting];
  return async function (value: TypedPrimitiveValue): Promise<string> {
    for (const formatter of formatters) {
      const result = formatter(value);
      if (!!result) {
        return result;
      }
    }
    return value.value.toString();
  };
}

/**
 * This is required because we don't have a way to convert a number to base36 through ECSQL. The function
 * has been added and will be available with 4.2 release.
 */
function convertECInstanceIdSuffixToBase36(value: TypedPrimitiveValue) {
  if (value.type !== "Id") {
    return undefined;
  }
  return `${Id64.getBriefcaseId(value.value).toString(36).toLocaleUpperCase()}-${Id64.getLocalId(value.value).toString(36).toLocaleUpperCase()}`;
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
