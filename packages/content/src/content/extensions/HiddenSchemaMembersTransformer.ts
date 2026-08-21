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
export const DEFAULT_HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY = 500;

/**
 * Creates a `DescriptorTransformer` that marks property fields `hidden` based on ECSchema
 * visibility metadata (`EC.Property.isHidden` and `EC.Class.isHidden`).
 *
 * For every `field.kind === "property"` field, the transformer resolves the underlying property
 * from `field.propertyClassName` and `field.propertyName` (the same schema access used to build
 * the descriptor) and sets `field.hidden = true` when either:
 * - the property itself is hidden (`property.isHidden === true`); or
 * - the class that *declares* the property (`property.class` — for an inherited property, the
 *   defining base class; for a mixin-declared property, the mixin) or one of its `baseClass`
 *   ancestors is hidden. The walk up the `baseClass` chain stops as soon as a class reports
 *   `isHidden === true` (the field is hidden) or `isHidden === false` (the field stays visible);
 *   an `undefined` value continues to the next base class; running out of ancestors without a
 *   defined value leaves the field visible.
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
export function createHiddenSchemaMembersDescriptorTransformer(props?: { priority?: number }): DescriptorTransformer {
  return {
    priority: props?.priority ?? DEFAULT_HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY,
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
        if (property.isHidden || isEffectivelyHiddenClass(property.class)) {
          field.hidden = true;
        }
      }
    },
  };
}

/**
 * Walks an `EC.Class` and its `baseClass` chain, returning `true` for the first class that reports
 * `isHidden === true`, `false` for the first that reports `isHidden === false`, and `false` when no
 * class in the chain has a defined visibility (i.e. every one reports `isHidden === undefined`).
 */
function isEffectivelyHiddenClass(propertyClass: EC.Class): boolean {
  let current: EC.Class | undefined = propertyClass;
  while (current) {
    if (current.isHidden === true) {
      return true;
    }
    if (current.isHidden === false) {
      return false;
    }
    current = current.baseClass;
  }
  return false;
}
