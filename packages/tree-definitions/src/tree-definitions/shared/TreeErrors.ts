/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, EMPTY } from "rxjs";

import type { Observable } from "rxjs";

/**
 * Error thrown by tree search functions when the number of matching instances exceeds the configured limit.
 * The default limit is 100; a different one can be specified through the `limit` search option.
 * @beta
 */
export class SearchLimitExceededError extends Error {
  /**
   * @param limit The maximum number of matching instances that was in effect when the search failed, whether the
   * default or the value supplied through the `limit` search option.
   */
  public constructor(
    /** The maximum number of matching instances that was exceeded. */
    public readonly limit: number,
  ) {
    super("Too many search matches");
  }
}

/** @internal */
export function isBeSqliteInterruptError(error: unknown): boolean {
  return typeof error === "object" && !!error && "name" in error && error.name === "BE_SQLITE_INTERRUPT";
}

/** @internal */
export function catchBeSQLiteInterrupts<T>(obs: Observable<T>): Observable<T> {
  return obs.pipe(
    catchError((error) => {
      if (isBeSqliteInterruptError(error)) {
        return EMPTY;
      }
      throw error;
    }),
  );
}
