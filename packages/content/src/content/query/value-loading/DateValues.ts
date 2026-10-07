/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { julianToDateTime } from "@itwin/presentation-shared";

import type { Value, ValueDescriptor } from "@itwin/presentation-shared";

const TIMEZONE_DESIGNATOR = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * Converts a raw `DateTime` value to a `Date`. Accepts `Date`, ISO 8601 strings and Julian day numbers.
 * iModels store `DateTime` values in UTC, so a time-of-day string without a timezone designator is read as
 * UTC, and a date-only string is read as midnight UTC.
 *
 * @throws if the value is not a valid date.
 */
export function toDateValue(value: unknown): Date {
  let result: Date | undefined;
  if (value instanceof Date) {
    result = value;
  } else if (typeof value === "number") {
    result = julianToDateTime(value);
  } else if (typeof value === "string") {
    result = new Date(value.includes("T") && !TIMEZONE_DESIGNATOR.test(value) ? `${value}Z` : value);
  }
  if (result === undefined || Number.isNaN(result.getTime())) {
    throw new Error(`Expected a valid DateTime value, got ${JSON.stringify(value)}.`);
  }
  return result;
}

/**
 * Converts every `DateTime` inside `value` to a `Date`, following `type` through arrays and structs. All other
 * values are returned as-is. Used for values that do not pass through the property value decoder.
 */
export function convertDateTimeValues(value: Value, type: ValueDescriptor): Value {
  if (value === undefined) {
    return undefined;
  }
  switch (type.kind) {
    case "primitive":
      return type.type === "DateTime" ? toDateValue(value) : value;
    case "array":
      assert(Array.isArray(value));
      return value.map((element) => convertDateTimeValues(element, type.elementType));
    case "struct":
      assert(typeof value === "object");
      return Object.fromEntries(
        Object.entries(value).map(([name, member]) => {
          const memberType = type.members.find((candidate) => candidate.name === name)?.type;
          return [name, memberType ? convertDateTimeValues(member, memberType) : member];
        }),
      );
    case "navigation":
      return value;
  }
}
