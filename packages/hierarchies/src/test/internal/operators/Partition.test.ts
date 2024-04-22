/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { from, Observable } from "rxjs";
import * as sinon from "sinon";
import { partition } from "../../../hierarchies/internal/operators/Partition";

describe("partition", () => {
  it("partitions items based on predicate", async () => {
    const [matches, nonMatches] = partition(from([1, 2, 3]), (x) => x % 2 === 0);
    expect(await collect(matches)).to.deep.eq([2]);
    expect(await collect(nonMatches)).to.deep.eq([1, 3]);
  });

  it("emits error if source errors", async () => {
    const [matches, nonMatches] = partition<number>(
      new Observable((subscriber) => {
        subscriber.error(new Error("test"));
      }),
      (x) => x % 2 === 0,
    );
    await expect(collect(matches)).to.eventually.be.rejectedWith(Error);
    await expect(collect(nonMatches)).to.eventually.be.rejectedWith(Error);
  });

  it("subscribes to source observable once", async () => {
    const source = from([1, 2, 3]);
    const subscribe = sinon.spy(source, "subscribe");
    const [matches, nonMatches] = partition(source, (x) => x % 2 === 0);
    await Promise.all([collect(matches), collect(nonMatches)]);
    expect(subscribe).to.be.calledOnce;
  });
});
