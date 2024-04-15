/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export async function* createAsyncIterator<T>(values: T[]): AsyncIterableIterator<T> {
  for (const value of values) {
    yield value;
  }
}

export async function* throwingAsyncIterator(error: Error): AsyncIterableIterator<never> {
  throw error;
}
