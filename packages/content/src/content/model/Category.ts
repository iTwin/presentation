/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { serializeRelationshipPath } from "./Utils.js";

import type { RelationshipPath } from "@itwin/presentation-shared";

/**
 * Places a field or category in a category defined in the descriptor's `categories`.
 *
 * @public
 */
export interface DefinedCategoryReference {
  type: "category";
  /** ID of the category definition. */
  id: CategoryDefinition["id"];
}

/**
 * Places a field or category in the category of the content target's own properties: direct properties and
 * properties of related classes shown as if they belonged to the target. It has no definition in the descriptor's
 * `categories`, so its label is up to the UI (e.g. "Selected Item(s)").
 *
 * @public
 */
export interface TargetCategoryReference {
  type: "target";
}

/**
 * Places a category at the top level, next to the content target's own category. Fields can't be placed there.
 *
 * @public
 */
export interface TopLevelCategoryReference {
  type: "topLevel";
}

/**
 * Where a field is placed.
 *
 * @public
 */
export type FieldCategoryReference = DefinedCategoryReference | TargetCategoryReference;

/**
 * Where a category is placed.
 *
 * @public
 */
export type CategoryParentReference = FieldCategoryReference | TopLevelCategoryReference;

/**
 * A lightweight category definition used by providers to logically group fields for display.
 * Categories form a tree via parent references.
 *
 * Categories are deduplicated by `id` across all providers. If multiple providers declare
 * a category with the same `id`, the higher-priority provider's metadata wins.
 *
 * @public
 */
// oxlint-disable-next-line no-redeclare
export interface CategoryDefinition {
  /** Stable identity for deduplication and cross-provider sharing. */
  id: string;
  /** Display label shown to the user. */
  label: string;
  /** Where the category is placed. */
  parent: CategoryParentReference;
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
   * By default the ID identifies the **target** category (grouping the fields of the path's final
   * target class). Pass `omitTargetClass: true` to get the **relationship** category ID instead: the
   * same ID with the final target class removed, so it is independent of which concrete target class
   * the relationship reaches.
   *
   * @throws Error if the path is empty.
   */
  export function computeId(props: { path: RelationshipPath; omitTargetClass?: boolean }): CategoryDefinition["id"] {
    if (props.path.length === 0) {
      throw new Error("Cannot compute category ID from an empty relationship path.");
    }
    return serializeRelationshipPath({
      path: props.path,
      omitLastTargetClass: props.omitTargetClass,
      includeInstanceFilters: false,
    });
  }

  /**
   * Creates a `CategoryDefinition` for a related field path.
   * The `id` is deterministically derived from `path`, so multiple providers
   * producing fields via the same path will share the same category.
   */
  export function create(
    props: { path: RelationshipPath } & Pick<CategoryDefinition, "label" | "description" | "parent">,
  ): CategoryDefinition {
    const { path, ...rest } = props;
    return { ...rest, id: computeId({ path }) };
  }
}
