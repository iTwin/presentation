/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types of values that can be bound to an ECSql query.
 * @beta
 */
export type ECSqlBindingType = "boolean" | "double" | "id" | "idset" | "int" | "long" | "string" | "point2d" | "point3d";

/**
 * Defines an ECSql binding consisting of a value and its type. Necessary to differentiate between numeric
 * types and `Id64String` vs `string`.
 *
 * @beta
 */
export type ECSqlBinding =
  | {
      type: "boolean";
      value?: boolean;
    }
  | {
      type: "double" | "int" | "long";
      value?: number;
    }
  | {
      type: "id";
      value?: string;
    }
  | {
      type: "idset";
      value?: string[];
    }
  | {
      type: "string";
      value?: string;
    }
  | {
      type: "point2d";
      value?: { x: number; y: number };
    }
  | {
      type: "point3d";
      value?: { x: number; y: number; z: number };
    };

/**
 * Defines requested ECSQL result row format.
 * @see [QueryRowFormat]($core-common)
 * @beta
 */
export type ECSqlQueryRowFormat = "ECSqlPropertyNames" | "Indexes";

/**
 * Defines options for ECSQL query reader.
 * @see [QueryOptions]($core-common)
 * @beta
 */
export interface ECSqlQueryReaderOptions {
  rowFormat?: ECSqlQueryRowFormat;
}

/**
 * Represents a single row of an ECSQL query result.
 * @see [QueryRowProxy]($core-common)
 * @beta
 */
export interface ECSqlQueryRow {
  [propertyName: string]: any;
  [propertyIndex: number]: any;
}

/**
 * Represents ECSQL query results reader.
 * @see [ECSqlReader]($core-common)
 * @beta
 */
export type ECSqlQueryReader = AsyncIterableIterator<ECSqlQueryRow>;

/**
 * An interface for something that knows how to create an ECSQL query reader.
 * @beta
 */
export interface IECSqlQueryExecutor {
  createQueryReader(ecsql: string, bindings?: ECSqlBinding[], config?: ECSqlQueryReaderOptions): ECSqlQueryReader;
}
