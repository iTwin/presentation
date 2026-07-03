/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";

/**
 * Recursively marks all properties as readonly with no depth limit.
 * @alpha
 */
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export function serializeRelationshipPath(path: RelationshipPath): string {
  let result = "";
  for (const step of path) {
    if (result.length === 0) {
      result = normalizeFullClassName(step.sourceClassName);
    }
    const rel = step.relationshipReverse
      ? `[!${normalizeFullClassName(step.relationshipName)}]`
      : `[${normalizeFullClassName(step.relationshipName)}]`;
    result += `-${rel}->${normalizeFullClassName(step.targetClassName)}`;
  }
  return result;
}

/**
 * Normalizes, de-duplicates, and sorts the given class names. Produces the canonical
 * representation used for a property field's `valueClassNames` invariant.
 */
export function toSortedUniqueClassNames<TClassName extends string>(
  classNames: TClassName[],
): EC.FullClassNameDotNotation[] {
  return Array.from(new Set(classNames.map((name) => normalizeFullClassName(name)))).sort();
}

/**
 * Deterministic, bounded discriminator for a subset of value-supplier classes, used as the
 * `forkKey` when carving a property field. The same subset always yields the same key
 * (normalized + sorted), so forking the same subset twice produces the same field ID.
 */
export function computeFieldForkKey(valueClassNames: EC.FullClassName[]): string {
  const joined = toSortedUniqueClassNames(valueClassNames).join(";");
  // Keep the key human-readable when short; fall back to a stable hash when long.
  return joined.length <= MAX_READABLE_FORK_KEY_LENGTH ? joined : hashString(joined);
}

const MAX_READABLE_FORK_KEY_LENGTH = 100;

/**
 * Deterministic 32-bit FNV-1a hash rendered in base-36. Stable across runs so it can be
 * embedded in cache-stable field IDs.
 */
function hashString(value: string): string {
  // FNV-1a 32-bit: start from the FNV offset basis, then for each char XOR it in and
  // multiply by the FNV prime (`Math.imul` keeps the multiply in 32-bit space).
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const FNV_OffsetBasis = 0x811c9dc5;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const FNV_Prime = 0x01000193;

  let hash = FNV_OffsetBasis;
  for (let i = 0; i < value.length; ++i) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_Prime);
  }
  // Coerce back to an unsigned 32-bit integer before rendering compactly in base-36.
  return (hash >>> 0).toString(36);
}
