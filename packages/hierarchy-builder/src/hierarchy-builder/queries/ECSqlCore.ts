/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "../values/Values";

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
      value?: Id64String;
    }
  | {
      type: "idset";
      value?: Id64String[];
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
 * Defines a query with its bindings.
 * @beta
 */
export interface ECSqlQueryDef {
  /** A list of CTEs used in the query. */
  ctes?: string[];

  /**
   * The ECSQL query to execute.
   *
   * **Note:** In case the query uses CTEs, they should be specified in the [[ctes]] rather than included in the query.
   */
  ecsql: string;

  /** Values to bind to the query. */
  bindings?: ECSqlBinding[];
}

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

/**
 * An interface for something that knows how to create a limiting ECSQL query reader.
 * @beta
 */
export interface ILimitingECSqlQueryExecutor {
  /**
   * Creates an `ECSqlQueryReader` for given query, but makes sure it doesn't return more than the configured
   * limit of rows. In case that happens, a `RowsLimitExceededError` is thrown during async iteration.
   */
  createQueryReader(query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions & { limit?: number | "unbounded" }): ECSqlQueryReader;
}
