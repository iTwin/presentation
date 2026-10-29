/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContentItem } from "../../content/model/ContentItem.js";
import { serializeRelationshipPath } from "../../content/model/Utils.js";

import type { InstanceKey, RelationshipPath, Value } from "@itwin/presentation-shared";
import type { CategoryDefinition } from "../../content/model/Category.js";
import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { ContentItem, RelatedInstanceEntry } from "../../content/model/ContentItem.js";
import type { CalculatedField, ExternalField, Field, PropertyField } from "../../content/model/Field.js";
import type {
  ContentEntry,
  ContentRecords,
  RelatedInstancesEntry,
} from "../../content/transform/ContentTransformer.js";

export function createPropertyField(id: string, overrides?: Partial<PropertyField>): PropertyField {
  return {
    kind: "property",
    id,
    label: id,
    type: { kind: "primitive", type: "String" },
    propertyClassName: "BisCore.Element",
    propertyName: id,
    pathFromTarget: [],
    pathCardinality: "one",
    valueClassNames: ["BisCore.Element"],
    primaryClassNames: ["BisCore.Element"],
    ...overrides,
  };
}

export function createCalculatedField(id: string, overrides?: Partial<CalculatedField>): CalculatedField {
  return {
    kind: "calculated",
    id,
    label: id,
    type: { kind: "primitive", type: "String" },
    sourceClassName: "BisCore.Element",
    expression: "this.CodeValue",
    primaryClassNames: ["BisCore.Element"],
    ...overrides,
  };
}

export function createExternalField(id: string, overrides?: Partial<ExternalField>): ExternalField {
  return {
    kind: "external",
    id,
    label: id,
    type: { kind: "primitive", type: "String" },
    providerId: "test_v1",
    ...overrides,
  };
}

export function createDescriptor(fields: Field[], categories: CategoryDefinition[] = []): ContentDescriptor {
  return {
    sources: [],
    fields: Object.fromEntries(fields.map((field) => [field.id, field])),
    categories: Object.fromEntries(categories.map((category) => [category.id, category])),
  };
}

export function createItem(props: {
  descriptor: ContentDescriptor;
  primaryKey?: InstanceKey;
  values?: Record<string, Value>;
  relatedInstances?: Array<{ path: RelationshipPath; instances: RelatedInstanceEntry[] }>;
}): ContentItem {
  return createContentItem({
    descriptor: props.descriptor,
    contentValues: {
      primaryKey: props.primaryKey ?? { className: "BisCore.Element", id: "0x1" },
      values: props.values ?? {},
      relatedInstances: Object.fromEntries(
        (props.relatedInstances ?? []).map(({ path, instances }) => [serializeRelationshipPath({ path }), instances]),
      ),
    },
  });
}

export function createRecords(props: {
  descriptor?: ContentDescriptor;
  items?: ContentItem[];
  entries: ContentEntry[];
}): ContentRecords {
  const descriptor = props.descriptor ?? createDescriptor([]);
  return { descriptor, items: props.items ?? [], categories: descriptor.categories, entries: props.entries };
}

export const aspectsPath: RelationshipPath = [
  {
    sourceClassName: "BisCore.Element",
    targetClassName: "BisCore.ElementMultiAspect",
    relationshipName: "BisCore.ElementOwnsMultiAspects",
  },
];

export const childrenPath: RelationshipPath = [
  {
    sourceClassName: "BisCore.Element",
    targetClassName: "BisCore.Element",
    relationshipName: "BisCore.ElementOwnsChildElements",
  },
];

export const aspectA = createPropertyField("aspectA", {
  pathFromTarget: aspectsPath,
  pathCardinality: "many",
  categoryId: "aspects",
});
export const aspectB = createPropertyField("aspectB", {
  pathFromTarget: aspectsPath,
  pathCardinality: "many",
  categoryId: "aspects",
});

export function createRelatedEntry(overrides?: Partial<RelatedInstancesEntry>): RelatedInstancesEntry {
  return {
    kind: "related-instances",
    pathFromTarget: aspectsPath,
    fields: [aspectA, aspectB],
    categoryId: "aspects",
    values: [
      [
        { key: { className: "BisCore.ElementMultiAspect", id: "0x10" }, values: { aspectA: "a1", aspectB: "" } },
        { key: { className: "BisCore.ElementMultiAspect", id: "0x11" }, values: { aspectA: "a2", aspectB: undefined } },
      ],
    ],
    ...overrides,
  };
}
