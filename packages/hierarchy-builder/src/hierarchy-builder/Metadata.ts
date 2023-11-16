/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECPrimitiveType } from "./ECMetadata";

/**
 * An identifiers' union of all supported primitive value types.
 * @beta
 */
export type PrimitiveValueType = "Id" | Exclude<ECPrimitiveType, "Binary" | "IGeometry">;

/**
 * Describes a single step through an ECRelationship from source ECClass to target ECClass.
 * @beta
 */
export interface RelationshipPathStep {
  sourceClassName: string;
  targetClassName: string;
  relationshipName: string;
  direction: "Forward" | "Backward";
}

/**
 * Describes a path from source ECClass to target ECClass through multiple ECRelationships.
 * @beta
 */
export type RelationshipPath<TStep extends RelationshipPathStep = RelationshipPathStep> = TStep[];

/**
 * An utility to parse schema and class names from full class name, where
 * schema and class names are separated by either `:` or `.`
 * @beta
 */
export function parseFullClassName(fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  return { schemaName, className };
}
