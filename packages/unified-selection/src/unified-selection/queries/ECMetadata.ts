/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

/**
 * An interface for an object that knows how to get an ECSchema from an iModel.
 * @internal
 */
export interface ECSchemaProvider {
  getSchema(schemaName: string): Promise<ECSchema | undefined>;
}

/**
 * Represents an ECSchema that contains classes, relationships, etc.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schema/
 * @internal
 */
export interface ECSchema {
  name: string;
  getClass(name: string): Promise<ECClass | undefined>;
}

/**
 * Represents an ECSchema item - a class, relationship, etc.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schemaitem/
 * @internal
 */
export interface ECSchemaItem {
  schema: ECSchema;
  fullName: string;
  name: string;
  label?: string;
}

/**
 * Represents an ECClass.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/ecclass/
 * @internal
 */
export interface ECClass extends ECSchemaItem {
  is(className: string, schemaName: string): Promise<boolean>;
}

/**
 * An utility to parse schema and class names from full class name, where
 * schema and class names are separated by either `:` or `.`
 */
export function parseFullClassName(fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  return { schemaName, className };
}
