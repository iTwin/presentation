/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { type ValueDescriptor } from "@itwin/presentation-shared";
import { DEFAULT_FIELDS_PROVIDER_PRIORITY } from "../extensions/BaseFieldsProvider.js";
import { getOrCreate } from "../InternalUtils.js";
import { PropertyField } from "../model/Field.js";
import { toSortedUniqueClassNames } from "../model/Utils.js";

import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { Field } from "../model/Field.js";
import type { CategorizedField, FieldCategorization } from "./ClassPropertyFields.js";

/**
 * A property field produced by field enumeration, tagged with its category facts and the contributor
 * that produced it. Carrying the provenance alongside the field lets the merge step resolve metadata
 * conflicts when several contributors declare the same property.
 */
interface PropertyFieldCandidate extends CategorizedField {
  /**
   * The contributing provider (narrowed to what conflict resolution needs). Candidates that share
   * this provider's `id` **and** a field id must agree on metadata (a divergence is a provider bug
   * and throws); candidates from different providers that disagree are resolved by the highest
   * `priority` (default {@link DEFAULT_FIELDS_PROVIDER_PRIORITY}, ties resolve to input order).
   * Omitted for schema-derived direct fields, which have no contributing provider.
   */
  provider?: Pick<IModelFieldsProvider, "id" | "priority">;
}

/**
 * Merges per-source candidate property fields into the descriptor's `fields` record,
 * keyed by field ID, applying the **merge-by-default** contract:
 *
 * - Candidates are grouped by their base ID (`PropertyField.computeId` without a `forkKey`),
 *   i.e. by declared `(propertyClassName, propertyName, pathFromTarget)`. Concrete-endpoint
 *   variants of the same declared property therefore collapse into one field.
 * - Each group produces a single field whose `valueClassNames` and `primaryClassNames` are each the
 *   sorted, de-duplicated union of the group's respective value-supplier and primary classes.
 * - Field metadata (`label`, `hidden`, `readOnly`, `type`) and category facts are resolved as follows:
 *   - **Intra-provider** (candidates sharing the same `providerId`) must agree — a divergence is a
 *     provider bug and throws.
 *   - **Inter-provider** (candidates from different providers) may disagree; the candidate with the
 *     highest `priority` wins (ties resolve to input order). `valueClassNames` and `primaryClassNames`
 *     are still unioned.
 *
 * The winning candidate's {@link FieldCategorization} is carried on each merged field so the
 * categorization pass can turn it into a `categoryId`. This is the inverse of `forkField`: it merges
 * many candidates into one field on the way in, while `forkField` splits one field into a carved
 * subset on demand.
 *
 * @internal
 */
export function mergePropertyFieldsByIdentity(candidates: PropertyFieldCandidate[]): CategorizedField[] {
  const groups = new Map<Field["id"], PropertyFieldCandidate[]>();
  for (const candidate of candidates) {
    assert(
      () => PropertyField.computeId(candidate.field) === candidate.field.id,
      "Fields merged with `mergePropertyFieldsByIdentity` must not have forked IDs.",
    );
    getOrCreate({ map: groups, key: candidate.field.id, createFunc: () => [] }).push(candidate);
  }

  const result: CategorizedField[] = [];
  for (const [baseId, group] of groups) {
    assertNoIntraProviderDivergence(baseId, group);
    const winner = group.reduce((best, candidate) => (priorityOf(candidate) > priorityOf(best) ? candidate : best));
    const valueClassNames = toSortedUniqueClassNames(group.flatMap((candidate) => candidate.field.valueClassNames));
    const primaryClassNames = toSortedUniqueClassNames(group.flatMap((candidate) => candidate.field.primaryClassNames));
    result.push({
      field: { ...winner.field, id: baseId, selectorId: baseId, valueClassNames, primaryClassNames },
      categorization: winner.categorization,
    });
  }
  return result;
}

function priorityOf(candidate: PropertyFieldCandidate): number {
  return candidate.provider?.priority ?? DEFAULT_FIELDS_PROVIDER_PRIORITY;
}

/** Throws if two candidates from the same provider produced divergent metadata for one field id. */
function assertNoIntraProviderDivergence(baseId: Field["id"], group: PropertyFieldCandidate[]): void {
  const representativeByProvider = new Map<IModelFieldsProvider["id"] | undefined, PropertyFieldCandidate>();
  for (const candidate of group) {
    const representative = representativeByProvider.get(candidate.provider?.id);
    if (!representative) {
      representativeByProvider.set(candidate.provider?.id, candidate);
    } else if (!metadataAgrees(representative, candidate)) {
      throw new Error(
        `Cannot merge property field "${baseId}": ${
          candidate.provider ? `provider "${candidate.provider.id}"` : "the same source"
        } produced divergent metadata for one declared property.`,
      );
    }
  }
}

function metadataAgrees(a: PropertyFieldCandidate, b: PropertyFieldCandidate): boolean {
  return (
    a.field.label === b.field.label &&
    a.field.hidden === b.field.hidden &&
    a.field.readOnly === b.field.readOnly &&
    valueDescriptorsAgree(a.field.type, b.field.type) &&
    categorizationAgrees(a.categorization, b.categorization)
  );
}

/** Structural equality for the raw category facts (anchor + category source). */
function categorizationAgrees(a: FieldCategorization, b: FieldCategorization): boolean {
  return (
    a.anchor === b.anchor &&
    a.category?.source === b.category?.source &&
    a.category?.id === b.category?.id &&
    schemaCategoryLabelOf(a) === schemaCategoryLabelOf(b)
  );
}

/** The label of a schema-sourced category, or `undefined` for an override / no category. */
function schemaCategoryLabelOf(categorization: FieldCategorization): string | undefined {
  return categorization.category?.source === "schema" ? categorization.category.label : undefined;
}

/**
 * Structural equality for value shapes. `ValueDescriptor` is a recursive union, so it cannot be
 * compared by reference (distinct candidates carry distinct instances) — a mismatch signals a
 * provider bug where the same declared property was given different value shapes. Both descriptors
 * are reduced to a canonical nested-tuple form and compared as JSON to avoid separator ambiguity.
 */
function valueDescriptorsAgree(a: ValueDescriptor, b: ValueDescriptor): boolean {
  return JSON.stringify(toComparableValueDescriptor(a)) === JSON.stringify(toComparableValueDescriptor(b));
}

function toComparableValueDescriptor(descriptor: ValueDescriptor): unknown {
  switch (descriptor.kind) {
    case "primitive":
      return ["primitive", descriptor.type, descriptor.kindOfQuantity ?? null, descriptor.enumeration ?? null];
    case "array":
      return ["array", toComparableValueDescriptor(descriptor.elementType)];
    case "struct":
      return [
        "struct",
        descriptor.members.map((member) => [member.name, member.label, toComparableValueDescriptor(member.type)]),
      ];
    case "navigation":
      return ["navigation", descriptor.targetClassName];
  }
}
