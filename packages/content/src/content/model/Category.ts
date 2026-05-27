/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { serializeRelationshipPath } from "./Utils.js";

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
export namespace CategoryDefinition {
  /**
   * Computes a deterministic category ID from a relationship path.
   * Two providers using the same path will produce the same ID, allowing their fields
   * to merge under one category.
   *
   * @throws Error if the path is empty.
   */
  export function computeId(props: { path: RelationshipPath }): CategoryDefinition["id"] {
    if (props.path.length === 0) {
      throw new Error("Cannot compute category ID from an empty relationship path.");
    }
    return serializeRelationshipPath(props.path);
  }

  /**
   * Creates a `CategoryDefinition` for a related field path.
   * The `id` is deterministically derived from `path`, so multiple providers
   * producing fields via the same path will share the same category.
   */
  export function create(
    props: { path: RelationshipPath } & Pick<CategoryDefinition, "label" | "description" | "parentId">,
  ): CategoryDefinition {
    const { path, ...rest } = props;
    return { ...rest, id: computeId({ path }) };
  }
}
