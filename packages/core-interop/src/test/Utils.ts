/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";

export function createECSqlReaderStub(rows: object[]) {
  let curr = -1;
  return {
    step: sinon.fake(async () => {
      ++curr;
      return curr < rows.length;
    }),
    get current() {
      return createQueryRowProxy(rows[curr]);
    },
    async *[Symbol.asyncIterator]() {
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < rows.length; ++i) {
        yield createQueryRowProxy(rows[i]);
      }
    },
  };
}

function createQueryRowProxy(data: object) {
  return {
    ...data,
    toArray: () => data,
    toRow: () => data,
  };
}
