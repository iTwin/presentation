/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { deepEqual } from "../../content-react/content/internal/Utils.js";
import { classA } from "../Helpers.js";

import type {
  CategoryDefinition,
  ContentDescriptor,
  ContentItem,
  createContentProvider,
  Field,
  PropertyField,
} from "@itwin/presentation-content";
import type { InstanceKey, RelationshipPath, Value } from "@itwin/presentation-shared";
import type { CustomSelectable, SelectableInstanceKey } from "@itwin/unified-selection";

export function createDescriptor(props: { fields: Field[]; categories?: CategoryDefinition[] }): ContentDescriptor {
  return {
    sources: [],
    fields: Object.fromEntries(props.fields.map((field) => [field.id, field])),
    categories: Object.fromEntries((props.categories ?? []).map((category) => [category.id, category])),
  };
}

export function createField(props: Partial<Omit<PropertyField, "kind">> & Pick<PropertyField, "id">): PropertyField {
  return {
    kind: "property",
    label: props.id,
    type: { kind: "primitive", type: "String" },
    propertyClassName: classA,
    propertyName: props.id,
    pathFromTarget: [],
    pathCardinality: "one",
    valueClassNames: [classA],
    primaryClassNames: [classA],
    ...props,
  };
}

export function createItem(props: {
  descriptor: ContentDescriptor;
  primaryKey?: InstanceKey;
  values?: Record<string, Value>;
  related?: Array<{ path: RelationshipPath; instances: Array<{ key: InstanceKey; values: Record<string, Value> }> }>;
}): ContentItem {
  const values = props.values ?? {};
  return {
    descriptor: props.descriptor,
    primaryKey: props.primaryKey ?? { className: classA, id: "0x1" },
    values,
    getValue: (field) => values[field.id],
    getRelatedInstances: ({ pathFromTarget }) =>
      (props.related?.find((entry) => deepEqual(entry.path, pathFromTarget))?.instances ?? []).map((instance) => ({
        key: instance.key,
        getValue: (field) => instance.values[field.id],
      })),
  };
}

export function createProvider(props: {
  descriptor: ContentDescriptor;
  items: ContentItem[];
  onItemsIterationFinished?: () => void;
  itemDelay?: number;
}): ReturnType<typeof createContentProvider> {
  return {
    getSize: async () => props.items.length,
    getInstanceKeys: () => (async function* () {})(),
    getContentDescriptor: async () => props.descriptor,
    getItems: () =>
      (async function* () {
        try {
          for (const item of props.items) {
            if (props.itemDelay) {
              await new Promise((resolve) => setTimeout(resolve, props.itemDelay));
            }
            yield item;
          }
        } finally {
          props.onItemsIterationFinished?.();
        }
      })(),
  };
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Creates a custom selectable whose instance keys load after `ready` resolves. */
export function createCustomSelectable(
  identifier: string,
  keys: SelectableInstanceKey[],
  ready?: Promise<void>,
): CustomSelectable {
  return {
    identifier,
    data: undefined,
    async *loadInstanceKeys() {
      await ready;
      yield* keys;
    },
  };
}
