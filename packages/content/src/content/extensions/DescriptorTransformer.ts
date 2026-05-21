/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentDescriptor } from "../model/ContentDescriptor.js";

/**
 * Default priority for descriptor transformers.
 *
 * @public
 */
export const DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY = 1000;

/**
 * Modifies the descriptor after all providers have contributed their fields.
 *
 * **Pipeline stage: 2 (descriptor building)**
 *
 * Runs after all iModel and external fields providers have declared their fields,
 * allowing cross-provider adjustments to the final descriptor shape.
 *
 * Use cases:
 * - Hiding specific fields based on user preferences or component needs.
 * - Overriding field labels, categories, priorities.
 * - Cross-provider decisions (e.g., "move all BisCore fields to a System category").
 *
 * Rules:
 * - Transformers may hide, remove, or modify field metadata.
 * - Transformers must NOT change field identity (the stable key).
 * - Transformers must NOT add new fields (that's the provider's responsibility).
 * - Transformers must NOT reorder fields (display order is a UI concern).
 *
 * Multiple transformers run sequentially in ascending priority order. Each receives
 * the descriptor as modified by previous transformers.
 *
 * @public
 */
export interface DescriptorTransformer {
  /**
   * Numeric priority — transformers run in ascending priority order.
   * @default {@link DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY} (1000)
   */
  priority?: number;

  /**
   * Transform the descriptor in place. May mutate fields, categories,
   * and related field groups.
   */
  transform(descriptor: ContentDescriptor): void;
}

/**
 * Helper to define a descriptor transformer inline.
 *
 * @public
 */
export function defineDescriptorTransformer(transformer: DescriptorTransformer): DescriptorTransformer {
  return transformer;
}
