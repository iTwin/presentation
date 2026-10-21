/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, EMPTY } from "rxjs";

import type { Observable } from "rxjs";

/**
 * Error that is thrown when too many matches are found while searching the tree.
 * @beta
 */
export class SearchLimitExceededError extends Error {
  public constructor(public readonly limit: number) {
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
