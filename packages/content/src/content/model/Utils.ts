/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";

import type { RelationshipPath } from "@itwin/presentation-shared";

/**
 * Recursively marks all properties as readonly with no depth limit.
 * @internal
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
