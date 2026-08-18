/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentDescriptor, ContentSource, Field, PropertyField } from "@itwin/presentation-content";
import type { EC, RelationshipPath } from "@itwin/presentation-shared";

export const classA = "TestSchema.A" as const;
export const classB = "TestSchema.B" as const;
export const classC = "TestSchema.C" as const;

export function createDescriptor(source: ContentSource | ContentSource[], fields: Field[]): ContentDescriptor {
  return {
    sources: Array.isArray(source) ? source : [source],
    fields: Object.fromEntries(fields.map((field) => [field.id, field])),
    categories: {},
    selectors: {},
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
  };
}

export function createPropertyField(props: {
  id: string;
  valueClassNames: EC.FullClassNameDotNotation[];
  propertyClassName?: EC.FullClassNameDotNotation;
  pathFromTarget?: RelationshipPath;
  hidden?: boolean;
}): PropertyField {
  return {
    kind: "property",
    id: props.id,
    label: props.id,
    type: { kind: "primitive", type: "String" },
    propertyClassName: props.propertyClassName ?? classA,
    propertyName: props.id,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: props.valueClassNames,
    selectorId: props.id,
    ...(props.hidden ? { hidden: true } : undefined),
  };
}
