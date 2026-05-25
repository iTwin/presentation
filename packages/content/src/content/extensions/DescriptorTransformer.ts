/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentSource } from "../ContentTarget.js";
import type { CategoryDefinition } from "../model/Category.js";
import type { Field, RelatedFieldGroup } from "../model/Field.js";

// cspell:words spliceable

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
  transform(descriptor: TransformableDescriptor): void;
}

/**
 * Helper to define a descriptor transformer inline.
 *
 * @public
 */
export function defineDescriptorTransformer(transformer: DescriptorTransformer): DescriptorTransformer {
  return transformer;
}

/**
 * A field with its identity made readonly — transformers may modify metadata
 * (label, categoryId, hidden, readOnly) but must not change identity.
 *
 * @public
 */
type TransformableField = Omit<Field, "identity"> & { readonly identity: string };

/**
 * A readonly array that permits element removal via `splice` but disallows insertion and direct mutation.
 *
 * @public
 */
type SpliceableReadonlyArray<T> = ReadonlyArray<T> & { splice(start: number, deleteCount: number): T[] };

/**
 * A related field group exposed to transformers — nested fields have frozen identities.
 *
 * @public
 */
interface TransformableRelatedFieldGroup extends Omit<RelatedFieldGroup, "fields" | "nestedGroups"> {
  fields: SpliceableReadonlyArray<TransformableField>;
  nestedGroups?: SpliceableReadonlyArray<TransformableRelatedFieldGroup>;
}

/**
 * A constrained view of {@link ContentDescriptor} exposed to descriptor transformers.
 *
 * Enforces transformer rules at the type level:
 * - `sources` is readonly — the resolved source structure is immutable at this stage.
 * - Field `identity` is readonly — must not be changed.
 * - Field metadata (`label`, `categoryId`, `hidden`, `readOnly`) remains mutable.
 * - Field arrays are readonly but allow element removal via `splice`.
 *
 * @public
 */
interface TransformableDescriptor {
  readonly sources: readonly ContentSource[];
  readonly directFields: SpliceableReadonlyArray<TransformableField>;
  readonly relatedFieldGroups: SpliceableReadonlyArray<TransformableRelatedFieldGroup>;
  readonly categories: Record<CategoryDefinition["id"], CategoryDefinition>;
}
