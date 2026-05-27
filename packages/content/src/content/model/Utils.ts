/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";

import type { RelationshipPath } from "@itwin/presentation-shared";

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
