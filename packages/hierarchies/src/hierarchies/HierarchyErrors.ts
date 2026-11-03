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
  /**
   * Rows that were read before the limit was exceeded. Contains at most `limit` rows.
   */
  public readonly rows: ECSqlQueryRow[];

  public constructor(
    public readonly limit: number,
    rows?: ECSqlQueryRow[],
  ) {
    super(`Query rows limit of ${limit} exceeded`);
    this.rows = rows ?? [];
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

  public constructor(limit: number, nodes: HierarchyNode[], rows?: ECSqlQueryRow[]) {
    super(limit, rows);
    this.nodes = nodes;
  }
}
