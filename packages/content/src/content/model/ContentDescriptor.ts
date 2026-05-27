/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentSource } from "../ContentTarget.js";
import type { CategoryDefinition } from "./Category.js";
import type { Field } from "./Field.js";

/**
 * The schema of the content result. Computed before loading any values.
 * Describes what fields exist — purely structural. Does not carry request-level
 * concerns like sorting, filtering, or paging.
 *
 * The descriptor is the contract between the "what exists" phase and the "load values" phase.
 * Consumers can inspect and modify it (hide fields, remove fields, override categories)
 * before passing it to value loading.
 *
 * @public
 */
export interface ContentDescriptor {
  /** The content sources used to compute this descriptor (one per target class). */
  sources: ContentSource[];

  /**
   * All fields in this descriptor — property fields, calculated fields, and external fields,
   * keyed by field identity.
   * Related fields carry a non-empty `pathFromTarget` indicating the relationship path
   * from the target class to the field's source class.
   */
  fields: Record<Field["identity"], Field>;

  /**
   * All category definitions referenced by fields in this descriptor, keyed by category ID.
   */
  categories: Record<CategoryDefinition["id"], CategoryDefinition>;
}
