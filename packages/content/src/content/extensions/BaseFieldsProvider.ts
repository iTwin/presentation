/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Default priority for fields providers when `priority` is not specified.
 *
 * @public
 */
export const DEFAULT_FIELDS_PROVIDER_PRIORITY = 1000;

/**
 * Base attributes shared by all fields provider types.
 *
 * @public
 */
export interface BaseFieldsProvider {
  /**
   * Stable provider identity. Format: `${string}_v${number}`.
   *
   * The version suffix must be incremented when the provider's output shape
   * changes (e.g., fields added/removed, types changed) so that cached
   * descriptors built with the old version are invalidated.
   */
  id: `${string}_v${number}`;

  /**
   * Numeric priority for ordering and conflict resolution.
   *
   * @default {@link DEFAULT_FIELDS_PROVIDER_PRIORITY} (1000)
   */
  priority?: number;
}
