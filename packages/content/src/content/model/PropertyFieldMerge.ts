/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName, type ValueDescriptor } from "@itwin/presentation-shared";
import { PropertyField } from "./Field.js";
import { toSortedUniqueClassNames } from "./Utils.js";

import type { Field } from "./Field.js";

/**
 * Merges per-source candidate property fields into the descriptor's `fields` record,
 * keyed by field ID, applying the **merge-by-default** contract:
 *
 * - Candidates are grouped by their base ID (`PropertyField.computeId` without a `forkKey`),
 *   i.e. by declared `(sourceClassName, propertyName, pathFromTarget)`. Concrete-endpoint
 *   variants of the same declared property therefore collapse into one field.
 * - Each group produces a single field whose `valueClassNames` is the sorted, de-duplicated
 *   union of the group's value-supplier classes.
 * - Field metadata (`label`, `categoryId`, `hidden`, `readOnly`, `type`) comes from the
 *   first candidate in a group. Grouped candidates are expected to be identical apart from their
 *   `valueClassNames`; a mismatch indicates a provider bug and throws.
 *
 * This is the inverse of `forkField`: it merges many candidates into one field on the way in,
 * while `forkField` splits one field into a carved subset on demand. It is a contract-only
 * foundation and is not wired into the content pipeline yet — Stage 2 `createContentProvider`
 * (still a stub) will call it to assemble `descriptor.fields` from raw provider candidates.
 *
 * @internal
 */
export function mergePropertyFieldsByIdentity(candidates: PropertyField[]): Record<Field["id"], PropertyField> {
  const result: Record<Field["id"], PropertyField> = {};
  for (const candidate of candidates) {
    const baseId = PropertyField.computeId({
      propertyClassName: candidate.sourceClassName,
      propertyName: candidate.propertyName,
      pathFromTarget: candidate.pathFromTarget,
    });
    if (!(baseId in result)) {
      result[baseId] = {
        ...candidate,
        id: baseId,
        selectorId: baseId,
        valueClassNames: toSortedUniqueClassNames(candidate.valueClassNames),
      };
      continue;
    }
    const existing = result[baseId];
    assertMetadataAgrees(existing, candidate);
    existing.valueClassNames = toSortedUniqueClassNames([...existing.valueClassNames, ...candidate.valueClassNames]);
  }
  return result;
}

function assertMetadataAgrees(existing: PropertyField, candidate: PropertyField): void {
  if (
    existing.label !== candidate.label ||
    existing.categoryId !== candidate.categoryId ||
    existing.hidden !== candidate.hidden ||
    existing.readOnly !== candidate.readOnly ||
    !valueDescriptorsAgree(existing.type, candidate.type)
  ) {
    throw new Error(
      `Cannot merge property field "${existing.id}": candidates for the same declared property have divergent metadata.`,
    );
  }
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
      return ["primitive", descriptor.type, descriptor.kindOfQuantity ?? null];
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
