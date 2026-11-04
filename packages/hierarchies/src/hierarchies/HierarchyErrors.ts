/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ECSqlQueryRow } from "@itwin/presentation-shared";
import type { HierarchyNode } from "./HierarchyNode.js";

/**
 * Error that is thrown when rows amount exceed hierarchy level limit.
 * @public
 */
export class RowsLimitExceededError extends Error {
  /** The rows limit that was exceeded. */
  public readonly limit: number;

  /**
   * Rows that were read before the limit was exceeded. Contains at most `limit` rows.
   */
  public readonly rows: ECSqlQueryRow[];

  /**
   * Creates an error without the rows that were read before the limit was exceeded - the `rows` property is set to an empty array.
   * @deprecated in 2.1. Use the overload that takes a props object, which also accepts the rows that were read before the limit was exceeded.
   */
  public constructor(limit: number);
  /**
   * Creates an error with the rows that were read before the limit was exceeded.
   */
  public constructor(props: {
    /** The rows limit that was exceeded. */
    limit: number;
    /** Rows that were read before the limit was exceeded. */
    rows: ECSqlQueryRow[];
  });
  public constructor(limitOrProps: number | { limit: number; rows: ECSqlQueryRow[] }) {
    const { limit, rows } = typeof limitOrProps === "number" ? { limit: limitOrProps, rows: [] } : limitOrProps;
    super(`Query rows limit of ${limit} exceeded`);
    this.limit = limit;
    this.rows = rows;
  }
}

/**
 * Error that is thrown by hierarchy provider when hierarchy level size limit is exceeded. In addition to
 * what `RowsLimitExceededError` provides, it contains hierarchy nodes created from the rows that were read
 * before the limit was exceeded.
 *
 * @public
 */
export class NodesLimitExceededError extends RowsLimitExceededError {
  /**
   * Hierarchy nodes created from the rows that were read before the limit was exceeded. The nodes
   * are processed the same way as nodes returned by `HierarchyProvider.getNodes`.
   */
  public readonly nodes: HierarchyNode[];

  public constructor(props: {
    /** The rows limit that was exceeded. */
    limit: number;
    /** Rows that were read before the limit was exceeded. */
    rows: ECSqlQueryRow[];
    /** Hierarchy nodes created from the rows that were read before the limit was exceeded. */
    nodes: HierarchyNode[];
  }) {
    const { nodes, ...rowsLimitProps } = props;
    super(rowsLimitProps);
    this.nodes = nodes;
  }
}
