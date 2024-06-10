/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PrimitivePropertyValue, TypedPrimitiveValue } from "./Values";

/**
 * A part of a `ConcatenatedValue`, describing one piece of the value. Possible types:
 * - `ConcatenatedValue` describes a nested concatenated value.
 * - `PrimitivePropertyValue` describes an ECProperty value. Generally the value is formatted according to
 *   property metadata before concatenating with other parts.
 * - `TypedPrimitiveValue` describes a value with its type. Generally the value is formatted
 *   according to its type information before concatenating with other parts.
 * - `string` is just concatenated to other parts as-is.
 *
 * @see `ConcatenatedValue`
 * @beta
 */
export type ConcatenatedValuePart = ConcatenatedValue | PrimitivePropertyValue | TypedPrimitiveValue | string;

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
  export function isProperty(part: ConcatenatedValuePart): part is PrimitivePropertyValue {
    const candidate = part as PrimitivePropertyValue;
    return !!candidate.className && !!candidate.propertyName;
  }

  /** @beta */
  export function isConcatenatedValue(part: ConcatenatedValuePart): part is ConcatenatedValue {
    return Array.isArray(part);
  }
}

/**
 * A data structure that contains `ConcatenatedValuePart` objects describing
 * pieces that may be formatted and concatenated together.
 *
 * @beta
 */
export type ConcatenatedValue = ConcatenatedValuePart[];

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ConcatenatedValue {
  /**
   * Serialize given `ConcatenatedValue` to string using a formatter function. The parts are
   * each formatted individually and then joined together.
   *
   * @beta
   */
  export async function serialize(props: {
    /** The parts to join. */
    parts: ConcatenatedValue;
    /** Parts formatter to convert each part to string */
    partFormatter: (part: Exclude<ConcatenatedValuePart, ConcatenatedValue>) => Promise<string>;
    /** Optional separator for joining the parts. Defaults to an empty string. */
    separator?: string;
  }): Promise<string> {
    const { parts, partFormatter, separator } = props;
    return (
      await Promise.all(
        parts.map(async (part) => {
          if (ConcatenatedValuePart.isConcatenatedValue(part)) {
            return serialize({ parts: part, partFormatter, separator });
          }
          return partFormatter(part);
        }),
      )
    ).join(separator ?? "");
  }
}
