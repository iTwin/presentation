/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * An async iterator that tracks its position and allows continuing iteration from it later.
 * @beta
 */
export interface ContinuableAsyncIterableIterator<T> extends AsyncIterableIterator<T> {
  /**
   * Returns an opaque token that identifies position of the last value returned. The token can be used to
   * request a new iterator that continues from the value that follows it.
   *
   * Before the first value is returned, returns the token the iterator was requested with, or `undefined` if
   * the iterator was requested without one.
   */
  getContinuationToken(): string | undefined;
}
