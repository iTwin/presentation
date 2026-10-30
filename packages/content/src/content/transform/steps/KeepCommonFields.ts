/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getOrCreate } from "../../InternalUtils.js";
import { serializeRelationshipPath, toSortedUniqueClassNames } from "../../model/Utils.js";
import { filterFields, isFieldApplicable } from "./Utils.js";

import type { DeepReadonly, Value } from "@itwin/presentation-shared";
import type { ReadonlyField, ReadonlyPropertyField } from "../../model/Field.js";
import type { ContentEntry, ContentRecords, ContentTransformStep, FieldEntry } from "../ContentTransformer.js";

type RelatedFieldEntry = FieldEntry & { field: ReadonlyPropertyField };

/**
 * Creates a content transform step that keeps only fields applicable to every content item (see `isFieldApplicable`).
 * Use it to show only properties common to all selected instances.
 *
 * Content is usually requested with one content target per selected class, and related property paths start at the
 * target's class. So the same related property of instances of different classes ends up in different fields, e.g.
 * `C.Prop` over `A -> C` and over `B -> C`. Before filtering, such fields - related property fields that differ only
 * by the source class of their path's first step and apply to disjoint sets of primary classes - are combined into a
 * single field, so that the property counts as common. Fields applying to the same primary classes, e.g. forks of the
 * same field, are never combined with each other:
 *
 * - The combined field takes the place and metadata of the first of the original fields.
 * - Its `primaryClassNames` and `valueClassNames` are the unions of the original ones, and its `pathCardinality` is
 *   `"many"` if any original field's is.
 * - Each item's value is taken from the original field that applies to the item. When the combined field is
 *   many-valued, single values of `"one"` fields are wrapped into arrays.
 *
 * Original fields of every combined field are stored in `combinedFields`, so that other steps can find related
 * instances reached over the original paths.
 */
export function keepCommonFields(props?: {
  combinedFields?: WeakMap<ReadonlyField, ReadonlyPropertyField[]>;
}): ContentTransformStep {
  const combinedFields = props?.combinedFields ?? new WeakMap();
  return (records) => {
    const entries = combineRelatedFields({ records, combinedFields });
    return {
      ...records,
      entries: filterFields(entries, (field) => records.items.every((item) => isFieldApplicable(field, item))),
    };
  };
}

function combineRelatedFields({
  records,
  combinedFields,
}: {
  records: ContentRecords;
  combinedFields: WeakMap<ReadonlyField, ReadonlyPropertyField[]>;
}): ContentEntry[] {
  const groups = new Map<string, RelatedFieldEntry[]>();
  for (const entry of records.entries) {
    if (entry.kind === "field" && entry.field.kind === "property" && entry.field.pathFromTarget.length > 0) {
      getOrCreate({ map: groups, key: getCombinationKey(entry.field), createFunc: () => [] }).push({
        ...entry,
        field: entry.field,
      });
    }
  }
  const replacements = new Map<ReadonlyField, ContentEntry | undefined>();
  for (const group of [...groups.values()].flatMap(splitByPrimaryClasses)) {
    if (group.length < 2) {
      continue;
    }
    const combined = combineEntries(group, records.items);
    combinedFields.set(
      combined.field,
      group.map(({ field }) => field),
    );
    group.forEach(({ field }, index) => replacements.set(field, index === 0 ? combined : undefined));
  }
  return records.entries.flatMap((entry) => {
    if (entry.kind !== "field" || !replacements.has(entry.field)) {
      return [entry];
    }
    const replacement = replacements.get(entry.field);
    return replacement ? [replacement] : [];
  });
}

function getCombinationKey(field: ReadonlyPropertyField): string {
  // A serialized path starts with the first step's source class - drop it.
  const pathKey = serializeRelationshipPath({ path: field.pathFromTarget });
  return JSON.stringify([
    field.propertyClassName,
    field.propertyName,
    field.propertyClassKind,
    pathKey.slice(field.pathFromTarget[0].sourceClassName.length),
  ]);
}

/**
 * Splits a group of combinable fields into subgroups whose fields apply to disjoint sets of primary classes. Fields
 * applying to the same primary classes (e.g. forks of the same field, created by `descriptor.forkField`) hold
 * complementary values and possibly different metadata, so they must not be combined with each other.
 *
 * Fields with equal `valueClassNames` are paired first, regardless of their order, so that matching forks of fields
 * from different targets get combined. The resulting subgroups are then combined with each other where their primary
 * classes don't overlap, starting with the ones covering the most primary classes, so that unmatched fields fill in
 * around the matched ones instead of blocking them. Entries of each subgroup keep their order in the group.
 */
function splitByPrimaryClasses(group: RelatedFieldEntry[]): RelatedFieldEntry[][] {
  const byValueClasses = new Map<string, PrimaryClassesSubgroup[]>();
  for (const entry of group) {
    const key = JSON.stringify(entry.field.valueClassNames);
    addToDisjointSubgroup(getOrCreate({ map: byValueClasses, key, createFunc: () => [] }), [entry]);
  }
  const subgroups: PrimaryClassesSubgroup[] = [];
  const valueClassSubgroups = [...byValueClasses.values()]
    .flat()
    .sort((lhs, rhs) => rhs.primaryClassNames.size - lhs.primaryClassNames.size);
  for (const { entries } of valueClassSubgroups) {
    addToDisjointSubgroup(subgroups, entries);
  }
  return subgroups.map(({ entries }) => entries.sort((lhs, rhs) => group.indexOf(lhs) - group.indexOf(rhs)));
}

interface PrimaryClassesSubgroup {
  entries: RelatedFieldEntry[];
  primaryClassNames: Set<string>;
}

function addToDisjointSubgroup(subgroups: PrimaryClassesSubgroup[], entries: RelatedFieldEntry[]): void {
  const primaryClassNames = entries.flatMap(({ field }) => field.primaryClassNames);
  const subgroup = subgroups.find((candidate) =>
    primaryClassNames.every((className) => !candidate.primaryClassNames.has(className)),
  );
  if (!subgroup) {
    subgroups.push({ entries: [...entries], primaryClassNames: new Set(primaryClassNames) });
    return;
  }
  subgroup.entries.push(...entries);
  primaryClassNames.forEach((className) => subgroup.primaryClassNames.add(className));
}

function combineEntries(group: RelatedFieldEntry[], items: ContentRecords["items"]): RelatedFieldEntry {
  const [first] = group;
  const pathCardinality = group.some(({ field }) => field.pathCardinality === "many") ? "many" : "one";
  const combinedField: ReadonlyPropertyField = {
    ...first.field,
    primaryClassNames: toSortedUniqueClassNames(group.flatMap((entry) => entry.field.primaryClassNames)),
    valueClassNames: toSortedUniqueClassNames(group.flatMap((entry) => entry.field.valueClassNames)),
    pathCardinality,
  };
  return {
    ...first,
    field: combinedField,
    values: items.map((item, index): DeepReadonly<Value> => {
      const source = group.find((entry) => isFieldApplicable(entry.field, item));
      if (!source) {
        return undefined;
      }
      const value = source.values[index];
      if (pathCardinality === "many" && source.field.pathCardinality === "one") {
        return value === undefined ? [] : [value];
      }
      return value;
    }),
  };
}
