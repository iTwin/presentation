/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Represents an ECSchema that contains classes, relationships, etc.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schema/
 * @beta
 */
export interface ECSchema {
  name: string;
  getClass(name: string): Promise<ECClass | undefined>;
}

/**
 * Represents an ECSchema item - a class, relationship, etc.
 * @see https://www.itwinjs.org/reference/ecschema-metadata/metadata/schemaitem/
 * @beta
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
 * @beta
 */
export interface ECClass extends ECSchemaItem {
  is(className: string, schemaName: string): Promise<boolean>;
  is(other: ECClass): Promise<boolean>;
}

/**
 * An interface of an iModel metadata provider used to retrieve information about ECSchemas,
 * ECClasses, ECProperties, etc.
 *
 * @beta
 */
export interface IMetadataProvider {
  getSchema(schemaName: string): Promise<ECSchema | undefined>;
}

/**
 * An utility to parse schema and class names from full class name, where
 * schema and class names are separated by either `:` or `.`
 * @beta
 */
export function parseFullClassName(fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  return { schemaName, className };
}
