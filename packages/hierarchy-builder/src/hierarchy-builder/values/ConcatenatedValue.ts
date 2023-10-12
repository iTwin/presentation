/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyValue, TypedPrimitiveValue } from "./Values";

/**
 * A part of a [[ConcatenatedValue]], describing one piece of the value. Possible types:
 * - [[PropertyValue]] describes a property value. Generally the value is formatted according to
 *   property metadata before concatenating with other parts.
 * - [[TypedPrimitiveValue]] describes a value with its type. Generally the value is formatted
 *   according to type information before concatenating with other parts.
 * - `string` is just concatenated to other parts as-is.
 *
 * @beta
 */
export type ConcatenatedValuePart = PropertyValue | TypedPrimitiveValue | string;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ConcatenatedValuePart {
  /** @beta */
  export function isString(part: ConcatenatedValuePart): part is string {
    return typeof part === "string";
  }
  /** @beta */
  export function isPrimitive(part: ConcatenatedValuePart): part is TypedPrimitiveValue {
    return !!(part as TypedPrimitiveValue).type;
  }
  /** @beta */
  export function isProperty(part: ConcatenatedValuePart): part is PropertyValue {
    const candidate = part as PropertyValue;
    return !!candidate.className && !!candidate.propertyName;
  }
}

/**
 * A data structure that contains 1 or more [[ConcatenatedValuePart]] objects describing
 * pieces that may be formatted and concatenated together.
 *
 * @beta
 */
export type ConcatenatedValue = ConcatenatedValuePart | ConcatenatedValuePart[];

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ConcatenatedValue {
  /**
   * Serialize given [[ConcatenatedValue]] to string using a formatter function. The parts are
   * each formatted individually and then joined together without any separator.
   *
   * @beta
   */
  export async function serialize(parts: ConcatenatedValue, partFormatter: (part: ConcatenatedValuePart) => Promise<string>): Promise<string> {
    if (!Array.isArray(parts)) {
      return partFormatter(parts);
    }
    return (await Promise.all(parts.map(partFormatter))).join("");
  }
}
