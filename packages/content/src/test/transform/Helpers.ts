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
import type { FieldValues, RelatedInstancesValues } from "../../content/transform/PropertyGrid.js";

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
    category: { type: "target" },
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
    category: { type: "target" },
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
    category: { type: "target" },
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

/** Properties of the same related class, `BisCore.ElementMultiAspect`, reached over `aspectsPath`. */
export const aspectProp1 = createPropertyField("aspectProp1", {
  propertyClassName: "BisCore.ElementMultiAspect",
  pathFromTarget: aspectsPath,
  pathCardinality: "many",
  category: { type: "category", id: "aspects" },
});
export const aspectProp2 = createPropertyField("aspectProp2", {
  propertyClassName: "BisCore.ElementMultiAspect",
  pathFromTarget: aspectsPath,
  pathCardinality: "many",
  category: { type: "category", id: "aspects" },
});

/** Creates a related instance, as returned by `ContentItem.getRelatedInstances`, with values keyed by field ID. */
export function createRelatedInstance(
  key: InstanceKey,
  values: Record<string, Value>,
): RelatedInstancesValues["values"][number][number] {
  return { key, getValue: (field) => values[field.id] };
}

/** Converts related instances of the entry into plain objects with values keyed by field ID, for comparison. */
export function getRelatedInstanceValues(entry: FieldValues | RelatedInstancesValues) {
  if (entry.kind !== "related-instances") {
    throw new Error("Expected a related instances entry");
  }
  return entry.values.map((itemInstances) =>
    itemInstances.map((instance) => ({
      key: instance.key,
      values: Object.fromEntries(entry.fields.map((field) => [field.id, instance.getValue(field)])),
    })),
  );
}

export function createRelatedEntry(overrides?: Partial<RelatedInstancesValues>): RelatedInstancesValues {
  return {
    kind: "related-instances",
    fields: [aspectProp1, aspectProp2],
    values: [
      [
        createRelatedInstance(
          { className: "BisCore.ElementMultiAspect", id: "0x10" },
          { aspectProp1: "a1", aspectProp2: "" },
        ),
        createRelatedInstance({ className: "BisCore.ElementMultiAspect", id: "0x11" }, { aspectProp1: "a2" }),
      ],
    ],
    ...overrides,
  };
}
