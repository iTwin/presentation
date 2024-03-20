/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Error that is thrown when rows amount exceed hierarchy level limit.
 * @beta
 */
export class RowsLimitExceededError extends Error {
  public constructor(public readonly limit: number) {
    super(`Query rows limit of ${limit} exceeded`);
  }
}
