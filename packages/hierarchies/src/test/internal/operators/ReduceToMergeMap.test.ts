/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { from, of } from "rxjs";
import { reduceToMergeMapItem, reduceToMergeMapList } from "../../../hierarchies/internal/operators/ReduceToMergeMap";

describe("reduceToMergeMapItem", () => {
  it("creates different entries for items with different keys", async () => {
    const res = await collect(
      from([1, 2]).pipe(
        reduceToMergeMapItem(
          (x) => x.toString(),
          (x) => x,
        ),
      ),
    );
    expect(res).to.have.lengthOf(1);
    expect(res[0].size).to.eq(2);
    expect(res[0].get("1")).to.eq(1);
    expect(res[0].get("2")).to.eq(2);
  });

  it("merges items with the same key", async () => {
    const res = await collect(
      from([1, 2]).pipe(
        reduceToMergeMapItem(
          () => "x",
          (a, b?: number) => a + (b ?? 0),
        ),
      ),
    );
    expect(res).to.have.lengthOf(1);
    expect(res[0].size).to.eq(1);
    expect(res[0].get("x")).to.eq(3);
  });
});

describe("reduceToMergeMapList", () => {
  it("creates different lists for items with different keys", async () => {
    const res = await collect(
      from([1, 2]).pipe(
        reduceToMergeMapList(
          (x) => x.toString(),
          (x) => x,
        ),
      ),
    );
    expect(res).to.have.lengthOf(1);
    expect(res[0].size).to.eq(2);
    expect(res[0].get("1")).to.deep.eq([1]);
    expect(res[0].get("2")).to.deep.eq([2]);
  });

  it("puts items with the same key into the same list", async () => {
    const res = await collect(
      from([1, 2]).pipe(
        reduceToMergeMapList(
          () => "x",
          (x) => x,
        ),
      ),
    );
    expect(res).to.have.lengthOf(1);
    expect(res[0].size).to.eq(1);
    expect(res[0].get("x")).to.deep.eq([1, 2]);
  });

  it("uses value function to map entry value", async () => {
    const res = await collect(
      of(1).pipe(
        reduceToMergeMapList(
          () => "x",
          (x) => x * 2,
        ),
      ),
    );
    expect(res).to.have.lengthOf(1);
    expect(res[0].size).to.eq(1);
    expect(res[0].get("x")).to.deep.eq([2]);
  });
});
