/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Structural equality for plain data: primitives, `Date`s, arrays, `Set`s, `Map`s and plain objects.
 * Object keys holding `undefined` are treated the same as missing keys. `Set` elements and `Map` keys are
 * matched by identity, `Map` values are compared structurally.
 */
export function deepEqual(lhs: unknown, rhs: unknown): boolean {
  if (lhs === rhs) {
    return true;
  }
  if (lhs instanceof Date || rhs instanceof Date) {
    return lhs instanceof Date && rhs instanceof Date && lhs.getTime() === rhs.getTime();
  }
  if (lhs instanceof Set || rhs instanceof Set) {
    return (
      lhs instanceof Set && rhs instanceof Set && lhs.size === rhs.size && [...lhs].every((value) => rhs.has(value))
    );
  }
  if (lhs instanceof Map || rhs instanceof Map) {
    return (
      lhs instanceof Map &&
      rhs instanceof Map &&
      lhs.size === rhs.size &&
      [...lhs].every(([key, value]) => rhs.has(key) && deepEqual(value, rhs.get(key)))
    );
  }
  if (typeof lhs !== "object" || typeof rhs !== "object" || lhs === null || rhs === null) {
    return false;
  }
  if (Array.isArray(lhs) || Array.isArray(rhs)) {
    return (
      Array.isArray(lhs) &&
      Array.isArray(rhs) &&
      lhs.length === rhs.length &&
      lhs.every((element, index) => deepEqual(element, rhs[index]))
    );
  }
  const lhsRecord = lhs as Record<string, unknown>;
  const rhsRecord = rhs as Record<string, unknown>;
  const keys = new Set([...Object.keys(lhsRecord), ...Object.keys(rhsRecord)]);
  for (const key of keys) {
    if (!deepEqual(lhsRecord[key], rhsRecord[key])) {
      return false;
    }
  }
  return true;
}
