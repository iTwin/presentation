/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { RowsLimitExceededError } from "./internal/TreeNodesReader";

/**
 * Namespace which can be used to determine error type.
 * @beta
 */
export namespace ErrorTypeChecker {
  /** Checks if the error is a RowsLimitExceededError. */
  export function isRowsLimitExceededError(err: any): err is RowsLimitExceededError {
    return err instanceof RowsLimitExceededError;
  }
}
