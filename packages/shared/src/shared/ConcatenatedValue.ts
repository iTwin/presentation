/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { TypedPrimitiveValue } from "./Values.js";

/**
 * A part of a `ConcatenatedValue`, describing one piece of the value. Possible types:
 * - `ConcatenatedValue` describes a nested concatenated value.
 * - `TypedPrimitiveValue` describes a value with its type. Generally the value is formatted
 *   according to its type information before concatenating with other parts.
 * - `string` is just concatenated to other parts as-is.
 *
 * @see `ConcatenatedValue`
 * @public
 */
export type ConcatenatedValuePart = ConcatenatedValue | TypedPrimitiveValue | string;

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ConcatenatedValuePart {
  /** @public */
  export function isString(part: ConcatenatedValuePart): part is string {
    return typeof part === "string";
  }

  /** @public */
  export function isPrimitive(part: ConcatenatedValuePart): part is TypedPrimitiveValue {
    return !!(part as TypedPrimitiveValue).type;
  }

  /** @public */
  export function isConcatenatedValue(part: ConcatenatedValuePart): part is ConcatenatedValue {
    return Array.isArray(part);
  }
}

/**
 * A data structure that contains `ConcatenatedValuePart` objects describing
 * pieces that may be formatted and concatenated together.
 *
 * @public
 */
export type ConcatenatedValue = ConcatenatedValuePart[];

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ConcatenatedValue {
  /**
   * Serialize given `ConcatenatedValue` to string using a formatter function. The parts are
   * each formatted individually and then joined together.
   *
   * @public
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
