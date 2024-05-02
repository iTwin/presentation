/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";

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
 * Defines an ECSQL query and its bindings.
 * @beta
 */
export interface ECSqlQueryDef {
  /** A list of CTEs used in the query. */
  ctes?: string[];

  /**
   * The ECSQL query to execute.
   * @note In case the query uses CTEs, they should be specified in the `ctes` rather than included in the `ecsql`.
   */
  ecsql: string;

  /**
   * Values to bind to the query.
   * @see https://www.itwinjs.org/learning/ecsql/#ecsql-parameters
   */
  bindings?: ECSqlBinding[];
}

/**
 * Defines requested ECSQL result row format.
 * @see [QueryRowFormat](https://www.itwinjs.org/reference/core-common/imodels/queryrowformat/)
 */
type ECSqlQueryRowFormat = "ECSqlPropertyNames" | "Indexes";

/**
 * Defines options for ECSQL query reader.
 * @see [QueryOptions](https://www.itwinjs.org/reference/core-common/imodels/queryoptions/)
 * @beta
 */
export interface ECSqlQueryReaderOptions {
  rowFormat?: ECSqlQueryRowFormat;
}

/**
 * Represents a single row of an ECSQL query result.
 * @see [QueryRowProxy](https://www.itwinjs.org/reference/core-common/imodels/queryrowproxy/)
 * @beta
 */
export interface ECSqlQueryRow {
  [propertyName: string]: any;
  [propertyIndex: number]: any;
}

/**
 * Represents ECSQL query results reader.
 * @see [ECSqlReader](https://www.itwinjs.org/reference/core-common/imodels/ecsqlreader/)
 */
type ECSqlQueryReader = AsyncIterableIterator<ECSqlQueryRow>;

/**
 * An interface for something that knows how to create an ECSQL query reader.
 * @see `createECSqlQueryExecutor` in `@itwin/presentation-core-interop`.
 * @beta
 */
export interface ECSqlQueryExecutor {
  createQueryReader(query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions): ECSqlQueryReader;
}
