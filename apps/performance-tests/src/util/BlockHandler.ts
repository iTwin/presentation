/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import blocked from "blocked";
import { SortedArray } from "@itwin/core-bentley";

export interface Summary {
  count: number;
  max?: number;
  p95?: number;
  median?: number;

  [key: string]: number | undefined;
}

/**
 * This class measures the durations of time when main thread is blocked.
 * This is measured by running a timer which detects cases when it is fired later than expected.
 */
export class BlockHandler {
  private readonly _samples = new SortedArray<number>((a, b) => a - b);
  private _timer?: NodeJS.Timer;

  public getSummary(): Summary {
    const arr = this._samples.extractArray();
    const count = arr.length;
    const max = count ? arr[count - 1] : undefined;
    const p95 = getP95(arr);
    const median = getMedian(arr);
    return {
      count,
      max,
      p95,
      median,
    };
  }

  /**
   * Starts the timer and records instances of abnormally long blocking.
   * @param threshold The minimum amount of blocking that will be considered abnormal.
   * @param interval Delay in time between each blocking check.
   */
  public start(threshold: number = 20, interval: number = 10) {
    this._samples.clear();
    this._timer = blocked((time) => this._samples.insert(time), { threshold, interval });
  }

  /** Stops the blocking timer. */
  public stop() {
    clearTimeout(this._timer);
  }
}

function getP95(arr: number[]): number | undefined {
  if (arr.length === 0) {
    return undefined;
  }

  return arr[Math.floor(0.95 * arr.length)];
}

function getMedian(arr: number[]): number | undefined {
  if (arr.length === 0) {
    return undefined;
  }

  const middle = arr.length / 2;
  if (arr.length % 2 === 0) {
    return (arr[middle - 1] + arr[middle]) / 2;
  }
  return arr[Math.floor(middle)];
}
