/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { from, Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { partition } from "../../../hierarchies/internal/operators/Partition.js";

describe("partition", () => {
  it("partitions items based on predicate", async () => {
    const [matches, nonMatches] = partition(from([1, 2, 3]), (x) => x % 2 === 0);
    expect(await collect(matches)).toEqual([2]);
    expect(await collect(nonMatches)).toEqual([1, 3]);
  });

  it("emits error if source errors", async () => {
    const [matches, nonMatches] = partition<number>(
      new Observable((subscriber) => {
        subscriber.error(new Error("test"));
      }),
      (x) => x % 2 === 0,
    );
    await expect(collect(matches)).rejects.toThrow(Error);
    await expect(collect(nonMatches)).rejects.toThrow(Error);
  });

  it("subscribes to source observable once", async () => {
    const source = new Observable<number>();
    const subscribe = vi.spyOn(source, "subscribe");
    const [matches, nonMatches] = partition(source, (x) => x % 2 === 0);
    matches.subscribe();
    nonMatches.subscribe();
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("unsubscribes from source observable when matches and non-matches are unsubscribed", async () => {
    const unsubscribeSpy = vi.fn();
    const source = new Observable<number>(() => unsubscribeSpy);
    const result = partition(source, (x) => x % 2 === 0);
    const subscriptions = result.map((obs) => obs.subscribe());
    expect(unsubscribeSpy).not.toHaveBeenCalled();
    subscriptions[0].unsubscribe();
    expect(unsubscribeSpy).not.toHaveBeenCalled();
    subscriptions[1].unsubscribe();
    expect(unsubscribeSpy).toHaveBeenCalledOnce();
  });
});
