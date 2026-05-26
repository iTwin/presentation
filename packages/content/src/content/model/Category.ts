/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { RelationshipPath } from "@itwin/presentation-shared";

/**
 * A lightweight category definition used by providers to logically group fields for display.
 * Categories form a tree via parent references.
 *
 * Categories are deduplicated by `id` across all providers. If multiple providers declare
 * a category with the same `id`, the higher-priority provider's metadata wins.
 *
 * @public
 */
export interface CategoryDefinition {
  /** Stable identity for deduplication and cross-provider sharing. */
  id: string;
  /** Display label shown to the user. */
  label: string;
  /** Optional parent category ID, forming a tree. */
  parentId?: string;
  /** Optional description for the category. */
  description?: string;
}

/** @public */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace CategoryDefinition {
  /**
   * Computes a deterministic category ID from a relationship path.
   * Two providers using the same path will produce the same ID, allowing their fields
   * to merge under one category.
   */
  export function computeIdFromRelationshipPath(path: RelationshipPath): string {
    let identifier = "";
    for (const step of path) {
      const separator = step.relationshipReverse ? "<-" : "->";
      if (identifier.length === 0) {
        identifier = step.sourceClassName;
      }
      identifier += `${separator}${step.relationshipName}${separator}${step.targetClassName}`;
    }
    return identifier;
  }

  /**
   * Creates a `CategoryDefinition` for a related field path.
   * The `id` is deterministically derived from `path`, so multiple providers
   * producing fields via the same path will share the same category.
   */
  export function createFromRelationshipPath(props: {
    parentCategoryId?: string;
    path: RelationshipPath;
    label: string;
    description?: string;
  }): CategoryDefinition {
    return {
      id: computeIdFromRelationshipPath(props.path),
      label: props.label,
      ...(props.parentCategoryId ? { parentId: props.parentCategoryId } : undefined),
      ...(props.description ? { description: props.description } : undefined),
    };
  }
}
