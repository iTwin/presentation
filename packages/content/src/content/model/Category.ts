/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
