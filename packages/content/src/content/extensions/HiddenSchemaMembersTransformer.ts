/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";

import type { EC } from "@itwin/presentation-shared";
import type { DescriptorTransformer } from "./DescriptorTransformer.js";

/**
 * Default priority for `createHiddenSchemaMembersDescriptorTransformer`.
 *
 * Lower than `DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY` (`1000`), so ordinary descriptor
 * transformers run *after* this one and are able to un-hide a field it hid.
 *
 * @internal
 */
export const HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY = 500;

/**
 * Creates a `DescriptorTransformer` that marks property fields `hidden` when their ECSchema
 * property has `EC.Property.isHidden` set. A property's declaring class being hidden does not
 * hide the property.
 *
 * For every `field.kind === "property"` field, the transformer resolves the underlying property
 * from `field.propertyClassName` and `field.propertyName` (the same schema access used to build
 * the descriptor) and sets `field.hidden = true` if the property is hidden.
 *
 * A transformer with higher priority can show a hidden property by setting `field.hidden = false`.
 *
 * Calculated and external fields have no source `EC.Property` and are left untouched.
 *
 * @example
 * ```ts
 * const contentConfiguration: ContentConfiguration = {
 *   descriptorTransformers: [createHiddenSchemaMembersDescriptorTransformer()],
 * };
 * ```
 *
 * @public
 */
export function createHiddenSchemaMembersDescriptorTransformer(): DescriptorTransformer {
  return {
    priority: HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY,
    async transform({ descriptor, imodelAccess }) {
      // Class-resolution cache is scoped to this single `transform` call so a transformer instance
      // reused across iModels never retains stale metadata.
      const classCache = new Map<EC.FullClassNameDotNotation, Promise<EC.Class>>();
      const resolveClass = async (fullClassName: EC.FullClassNameDotNotation): Promise<EC.Class> => {
        let cached = classCache.get(fullClassName);
        if (!cached) {
          cached = getClass(imodelAccess, fullClassName);
          classCache.set(fullClassName, cached);
        }
        return cached;
      };

      for (const field of Object.values(descriptor.fields)) {
        if (field.kind !== "property" || field.hidden === true) {
          continue;
        }
        const propertyClass = await resolveClass(field.propertyClassName);
        const property = propertyClass.getProperty(field.propertyName)!;
        if (property.isHidden) {
          field.hidden = true;
        }
      }
    },
  };
}
