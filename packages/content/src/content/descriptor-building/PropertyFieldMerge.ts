/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName, type ValueDescriptor } from "@itwin/presentation-shared";
import { DEFAULT_FIELDS_PROVIDER_PRIORITY } from "../extensions/BaseFieldsProvider.js";
import { PropertyField } from "../model/Field.js";
import { toSortedUniqueClassNames } from "../model/Utils.js";

import type { IModelFieldsProvider } from "../extensions/IModelFieldsProvider.js";
import type { Field } from "../model/Field.js";

/**
 * A property field produced by field enumeration, tagged with the contributor that produced it.
 * Carrying the provenance alongside the field lets the merge step resolve metadata conflicts when
 * several contributors declare the same property.
 */
interface PropertyFieldCandidate {
  /** The enumerated field. */
  field: PropertyField;
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
 * - Each group produces a single field whose `valueClassNames` is the sorted, de-duplicated
 *   union of the group's value-supplier classes.
 * - Field metadata (`label`, `categoryId`, `hidden`, `readOnly`, `type`) is resolved as follows:
 *   - **Intra-provider** (candidates sharing the same `providerId`) must agree — a divergence is a
 *     provider bug and throws.
 *   - **Inter-provider** (candidates from different providers) may disagree; the candidate with the
 *     highest `priority` wins (ties resolve to input order). `valueClassNames` are still unioned.
 *
 * This is the inverse of `forkField`: it merges many candidates into one field on the way in,
 * while `forkField` splits one field into a carved subset on demand.
 *
 * @internal
 */
export function mergePropertyFieldsByIdentity(
  candidates: PropertyFieldCandidate[],
): Record<Field["id"], PropertyField> {
  const groups = new Map<Field["id"], PropertyFieldCandidate[]>();
  for (const candidate of candidates) {
    const baseId = PropertyField.computeId(candidate.field);
    let group = groups.get(baseId);
    if (!group) {
      group = [];
      groups.set(baseId, group);
    }
    group.push(candidate);
  }

  const result: Record<Field["id"], PropertyField> = {};
  for (const [baseId, group] of groups) {
    assertNoIntraProviderDivergence(baseId, group);
    const winner = group.reduce((best, candidate) => (priorityOf(candidate) > priorityOf(best) ? candidate : best));
    const valueClassNames = toSortedUniqueClassNames(group.flatMap((candidate) => candidate.field.valueClassNames));
    result[baseId] = { ...winner.field, id: baseId, selectorId: baseId, valueClassNames };
  }
  return result;
}

function priorityOf(candidate: PropertyFieldCandidate): number {
  return candidate.provider?.priority ?? DEFAULT_FIELDS_PROVIDER_PRIORITY;
}

/** Throws if two candidates from the same provider produced divergent metadata for one field id. */
function assertNoIntraProviderDivergence(baseId: Field["id"], group: PropertyFieldCandidate[]): void {
  const representativeByProvider = new Map<IModelFieldsProvider["id"] | undefined, PropertyField>();
  for (const { field, provider } of group) {
    const representative = representativeByProvider.get(provider?.id);
    if (!representative) {
      representativeByProvider.set(provider?.id, field);
    } else if (!metadataAgrees(representative, field)) {
      throw new Error(
        `Cannot merge property field "${baseId}": ${
          provider ? `provider "${provider.id}"` : "the same source"
        } produced divergent metadata for one declared property.`,
      );
    }
  }
}

function metadataAgrees(a: PropertyField, b: PropertyField): boolean {
  return (
    a.label === b.label &&
    a.categoryId === b.categoryId &&
    a.hidden === b.hidden &&
    a.readOnly === b.readOnly &&
    valueDescriptorsAgree(a.type, b.type)
  );
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
      return ["navigation", normalizeFullClassName(descriptor.targetClassName)];
  }
}
