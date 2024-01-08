/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";
import { ECSqlQueryRow } from "@itwin/presentation-hierarchy-builder";

export function createECSqlReaderStub(rows: object[]) {
  let curr = -1;
  return {
    step: sinon.fake(async () => {
      ++curr;
      return curr < rows.length;
    }),
    get current() {
      return rows[curr] as ECSqlQueryRow;
    },
    async *[Symbol.asyncIterator]() {
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < rows.length; ++i) {
        yield rows[i] as ECSqlQueryRow;
      }
    },
  };
}
