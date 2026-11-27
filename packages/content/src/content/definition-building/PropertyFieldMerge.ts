/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { DEFAULT_FIELDS_PROVIDER_PRIORITY } from "../extensions/BaseFieldsProvider.js";
import { getCategoryContextKey, getOrCreate } from "../InternalUtils.js";
import { PropertyField } from "../model/Field.js";
import { toSortedUniqueClassNames } from "../model/Utils.js";
import { resolveCardinality } from "../PathCardinality.js";

import type { ValueDescriptor } from "@itwin/presentation-shared";
import type { CategoryContext } from "../ContentTarget.js";
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
  /**
   * For a candidate of a declaration applied on a nested anchor, the category context inherited from the
   * declarations it was applied below. Different ancestor declarations can place the same nested property
   * differently, which isn't a bug of the candidate's provider, so candidates with inherited contexts that place
   * categories differently (see `getCategoryContextKey`) are resolved like candidates of different providers.
   */
  inheritedCategoryContext?: Readonly<CategoryContext>;
}

/**
 * Merges per-source candidate property fields into the descriptor's `fields` record,
 * keyed by field ID, applying the **merge-by-default** contract:
 *
 * - Candidates are grouped by their ID (`PropertyField.computeId` without a `forkKey`), i.e. by
 *   `(propertyClassName, propertyName, related.pathFromTarget)`. Since paths start at their first relationship's
 *   constraint class (see `ResolvedPath.path`), a related property reached over the same relationships from
 *   different content targets is one field.
 * - Each group produces a single field whose `valueClassNames` and `primaryClassNames` are each the
 *   sorted, de-duplicated union of the group's respective value-supplier and primary classes.
 * - Field metadata (`label`, `hidden`, `readOnly`, `type`) and category facts are resolved as follows:
 *   - **Intra-provider** (candidates sharing the same `providerId` and inherited category context) must
 *     agree — a divergence is a provider bug and throws.
 *   - **Inter-provider** (candidates from different providers, or from the same provider applied below
 *     different ancestors) may disagree; the candidate with the highest `priority` wins (ties resolve to
 *     input order). `valueClassNames` and `primaryClassNames` are still unioned.
 * - `related.pathCardinality` is `"many"` when any candidate says so, regardless of provider or priority (see
 *   {@link resolveCardinality}). This merges candidates of the same property field, not the shapes
 *   of other fields or external inputs that happen to use the same path.
 *
 * The winning candidate's {@link FieldCategorization} is carried on each merged field so the
 * categorization pass can turn it into the field's `category`. This is the inverse of `forkField`: it merges
 * many candidates into one field on the way in, while `forkField` splits one field into a carved
 * subset on demand.
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
    // Candidates share the field id, so either all of them or none are related.
    const related = winner.field.related
      ? {
          ...winner.field.related,
          pathCardinality: resolveCardinality(
            group.map((candidate) => {
              assert(candidate.field.related !== undefined);
              return candidate.field.related.pathCardinality;
            }),
          ),
        }
      : undefined;
    result.push({
      field: { ...winner.field, id: baseId, ...(related ? { related } : {}), valueClassNames, primaryClassNames },
      categorization: winner.categorization,
    });
  }
  return result;
}

function priorityOf(candidate: PropertyFieldCandidate): number {
  return candidate.provider?.priority ?? DEFAULT_FIELDS_PROVIDER_PRIORITY;
}

/**
 * Throws if two candidates from the same provider and inherited category context produced divergent metadata for one
 * field id.
 */
function assertNoIntraProviderDivergence(baseId: Field["id"], group: PropertyFieldCandidate[]): void {
  const representativeBySource = new Map<string, PropertyFieldCandidate>();
  for (const candidate of group) {
    const sourceKey = JSON.stringify([
      candidate.provider?.id ?? null,
      getCategoryContextKey(candidate.inheritedCategoryContext ?? []),
    ]);
    const representative = representativeBySource.get(sourceKey);
    if (!representative) {
      representativeBySource.set(sourceKey, candidate);
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
    categorizationAgrees(a, b)
  );
}

/**
 * Compares category facts and their resolved ancestry. Relationship meanings only need to agree where they affect
 * placement: the outermost ancestry entry's meaning, and the field's own meaning when it has a property category or
 * no ancestry.
 */
function categorizationAgrees(
  { field: aField, categorization: a }: CategorizedField,
  { field: bField, categorization: b }: CategorizedField,
): boolean {
  if (a.category?.source === "override") {
    return b.category?.source === "override" && a.category.id === b.category.id;
  }
  const ownMeaningAffectsPlacement = a.category?.source === "propertyCategory" || a.categoryContext.length === 0;
  return (
    aField.related?.propertyClassKind === bField.related?.propertyClassKind &&
    a.category?.source === b.category?.source &&
    a.category?.id === b.category?.id &&
    (!ownMeaningAffectsPlacement || a.relationshipMeaning === b.relationshipMeaning) &&
    a.categoryContext.length === b.categoryContext.length &&
    a.categoryContext.every((context, index) => {
      const other = b.categoryContext[index];
      return (
        context.stepIndex === other.stepIndex &&
        context.kind === other.kind &&
        (index > 0 || context.relationshipMeaning === other.relationshipMeaning)
      );
    }) &&
    propertyCategoryLabelOf(a) === propertyCategoryLabelOf(b)
  );
}

/** The property category's label, or `undefined` for an override / no category. */
function propertyCategoryLabelOf(categorization: FieldCategorization): string | undefined {
  return categorization.category?.source === "propertyCategory" ? categorization.category.label : undefined;
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
      return [
        "array",
        toComparableValueDescriptor(descriptor.elementType),
        descriptor.minOccurs ?? null,
        descriptor.maxOccurs ?? null,
      ];
    case "struct":
      return [
        "struct",
        descriptor.members.map((member) => [member.name, member.label, toComparableValueDescriptor(member.type)]),
      ];
    case "navigation":
      return ["navigation", descriptor.targetClassName];
  }
}
