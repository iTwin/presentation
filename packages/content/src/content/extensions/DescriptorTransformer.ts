/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyField } from "../model/Field.js";
import { computeFieldForkKey, toSortedUniqueClassNames } from "../model/Utils.js";

import type { EC, ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { CategoryDefinition } from "../model/Category.js";
import type { ContentDescriptor } from "../model/ContentDescriptor.js";
import type { Field } from "../model/Field.js";
import type { DeepReadonly } from "../model/Utils.js";

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
 * - Transformers must NOT change field ID (the stable key).
 * - Transformers must NOT add new fields (that's the provider's responsibility), except by
 *   carving an existing field via `forkField`.
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
   *
   * Runs asynchronously and receives `imodelAccess` for schema and class-hierarchy
   * lookups (e.g. polymorphic class matching via `classDerivesFrom`).
   */
  transform(props: {
    descriptor: TransformableDescriptor;
    imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;
  }): Promise<void>;
}

/**
 * Helper to define a descriptor transformer inline.
 *
 * @public
 */
/* v8 ignore next 3 */
export function defineDescriptorTransformer(transformer: DescriptorTransformer): DescriptorTransformer {
  return transformer;
}

/**
 * The set of {@link Field} properties a descriptor transformer is allowed to mutate. Everything
 * else (identity, value shape, and the column-defining coordinates that back a field's selector) is
 * made readonly in the transformer view.
 *
 * @public
 */
type MutableFieldMetadata = "label" | "categoryId" | "hidden" | "readOnly";

/**
 * A field exposed to descriptor transformers with everything except display metadata made readonly.
 *
 * Transformers may only modify metadata (`label`, `categoryId`, `hidden`, `readOnly`). Identity
 * (`id`, `selectorId`), value shape (`type`), and the column-defining properties a field reads
 * (`propertyClassName`/`propertyName`/`pathFromTarget` for property fields,
 * `expression`/`targetAlias`/`bindings` for calculated fields) are deeply readonly, so a transformer
 * can never silently change the column a field selects — not even by mutating a nested array or
 * object (e.g. `pathFromTarget`, `valueClassNames`, or `type`). Value-supplier scoping is done
 * through `forkField`, not by mutating `valueClassNames` directly.
 *
 * Distributes over the {@link Field} union so the `kind` discriminant is preserved: a
 * `field.kind === "property"` check narrows a `TransformableField` to the property member
 * without any cast.
 *
 * @public
 */
type TransformableField<TField extends Field = Field> = TField extends Field
  ? DeepReadonly<Omit<TField, MutableFieldMetadata>> & Pick<TField, MutableFieldMetadata>
  : never;

/**
 * A constrained view of {@link (ContentDescriptor:interface)} exposed to descriptor transformers.
 *
 * Enforces transformer rules at the type level:
 * - `sources` is readonly — the resolved source structure is immutable at this stage.
 * - Only field display metadata (`label`, `categoryId`, `hidden`, `readOnly`) is mutable; a field's
 *   identity, value shape, and column-defining properties are readonly.
 * - Fields can be removed via `descriptor.removeField(id)`.
 * - A field can be carved for a subset of its value-supplier classes via `descriptor.forkField(id, subset)`.
 *
 * @public
 */
interface TransformableDescriptor {
  readonly sources: readonly ContentSource[];
  readonly fields: Readonly<Record<Field["id"], TransformableField>>;
  readonly categories: Record<CategoryDefinition["id"], CategoryDefinition>;
  removeField(id: string): void;
  /**
   * Carve a property field so a change can be scoped to a subset of the value-supplier
   * classes it represents. Removes those classes from the original field's
   * `valueClassNames` and returns a clone scoped to exactly that subset (inserted into
   * `fields` under a forked ID). If the subset covers *all* of the field's classes, no
   * clone is made and the original field is returned for in-place mutation. Forking the
   * same subset twice returns the same field.
   *
   * @throws if `id` is missing or not a property field, if the field itself represents no
   * value-supplier classes, if `valueClassNames` is empty, or if it contains a class not
   * represented by the field.
   */
  forkField(id: Field["id"], valueClassNames: EC.FullClassNameDotNotation[]): TransformableField<PropertyField>;
}

/**
 * Creates a {@link TransformableDescriptor} view over a {@link (ContentDescriptor:interface)},
 * backing `removeField` and `forkField` against the descriptor's live `fields` record.
 *
 * Accepts only the parts of the descriptor a transformer operates on (`sources`, `fields`,
 * `categories`) — value selectors are derived after transforms run and are intentionally out of
 * reach here.
 *
 * @internal
 */
export function createTransformableDescriptor(
  descriptor: Pick<ContentDescriptor, "sources" | "fields" | "categories">,
): TransformableDescriptor {
  return {
    sources: descriptor.sources,
    categories: descriptor.categories,
    fields: descriptor.fields,
    removeField(id) {
      delete descriptor.fields[id];
    },
    forkField(id, valueClassNames) {
      if (!(id in descriptor.fields)) {
        throw new Error(`Cannot fork field "${id}": no such field.`);
      }
      const field = descriptor.fields[id];
      if (field.kind !== "property") {
        throw new Error(`Cannot fork field "${id}": only property fields can be forked.`);
      }
      if (field.valueClassNames.length === 0) {
        throw new Error(`Cannot fork field "${id}": the field represents no value-supplier classes.`);
      }
      const subset = toSortedUniqueClassNames(valueClassNames);
      if (subset.length === 0) {
        throw new Error(`Cannot fork field "${id}": the value class subset must not be empty.`);
      }
      const forkedId = PropertyField.computeId({ ...field, forkKey: computeFieldForkKey(subset) });
      if (forkedId in descriptor.fields) {
        return descriptor.fields[forkedId] as PropertyField;
      }
      const represented = new Set(field.valueClassNames);
      for (const className of subset) {
        if (!represented.has(className)) {
          throw new Error(`Cannot fork field "${id}": class "${className}" is not represented by the field.`);
        }
      }
      if (subset.length === field.valueClassNames.length) {
        // The subset covers every value-supplier class: mutate in place, no fork.
        return field;
      }
      field.valueClassNames = field.valueClassNames.filter((className) => !subset.includes(className));
      const fork: PropertyField = { ...field, id: forkedId, valueClassNames: subset };
      descriptor.fields[forkedId] = fork;
      return fork;
    },
  };
}
