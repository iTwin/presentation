/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentDescriptor, ContentSource, Field, PropertyField } from "@itwin/presentation-content";
import type { EC, RelationshipPath, Value } from "@itwin/presentation-shared";

export const classA = "TestSchema.A" as const;
export const classB = "TestSchema.B" as const;
export const classC = "TestSchema.C" as const;

export function createDescriptor(source: ContentSource | ContentSource[], fields: Field[]): ContentDescriptor {
  return {
    sources: Array.isArray(source) ? source : [source],
    fields: Object.fromEntries(fields.map((field) => [field.id, field])),
    categories: {},
  };
}

export function createSource(props: {
  resolvedPrimaryClasses: EC.FullClassNameDotNotation[];
  resolvedPaths: Array<{ path: RelationshipPath; targetClassNames: EC.FullClassNameDotNotation[] }>;
  targetPrimaryClass?: EC.FullClassNameDotNotation;
}): ContentSource {
  return {
    target: { primaryClass: props.targetPrimaryClass ?? classA },
    resolvedPrimaryClasses: props.resolvedPrimaryClasses,
    resolvedDeclarations: props.resolvedPaths.length
      ? [{ providerId: "test_v1", declarationIndex: 0, paths: props.resolvedPaths }]
      : [],
    resolvedExternalInputs: [],
  };
}

export function createPropertyField(props: {
  id: string;
  valueClassNames: EC.FullClassNameDotNotation[];
  primaryClassNames?: EC.FullClassNameDotNotation[];
  propertyClassName?: EC.FullClassNameDotNotation;
  pathFromTarget?: RelationshipPath;
  hidden?: boolean;
  type?: PropertyField["type"];
}): PropertyField {
  return {
    kind: "property",
    id: props.id,
    label: props.id,
    type: props.type ?? { kind: "primitive", type: "String" },
    propertyClassName: props.propertyClassName ?? classA,
    propertyName: props.id,
    pathFromTarget: props.pathFromTarget ?? [],
    pathCardinality: "one",
    valueClassNames: props.valueClassNames,
    primaryClassNames: props.primaryClassNames ?? props.valueClassNames,
    ...(props.hidden ? { hidden: true } : undefined),
  };
}

/**
 * Creates an async iterable over `values` that records whether the consumer stopped iterating early,
 * which lets tests assert that early exits (e.g. abort or unmount) cancel the underlying stream.
 */
export function createValuesStream(values: Value[]): { iterable: AsyncIterable<Value>; isReturned: () => boolean } {
  let returned = false;
  return {
    isReturned: () => returned,
    iterable: {
      [Symbol.asyncIterator]: (): AsyncIterableIterator<Value> => {
        let index = 0;
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          next: async () =>
            index < values.length ? { value: values[index++], done: false } : { value: undefined, done: true },
          return: async () => {
            returned = true;
            return { value: undefined, done: true };
          },
        };
      },
    },
  };
}
