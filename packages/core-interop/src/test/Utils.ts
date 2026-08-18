/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { vi } from "vitest";

import type { QueryRowProxy } from "@itwin/core-common";

export function createCoreECSqlReaderStub(rows?: object[], opts?: { withReturn?: boolean }) {
  let curr = -1;
  const returnFn = opts?.withReturn ? vi.fn(async () => ({ done: true as const, value: undefined })) : undefined;
  const reader = {
    next: vi.fn(async () => {
      ++curr;
      if (rows && curr < rows.length) {
        return { done: false as const, value: createQueryRowProxy(rows[curr]) };
      }
      return { done: true as const, value: undefined };
    }),
    return: returnFn,
    [Symbol.asyncIterator]() {
      return reader;
    },
  };
  return reader;
}

function createQueryRowProxy(data: object) {
  return { ...data, toArray: () => data, toRow: () => data } as QueryRowProxy;
}
