/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import blocked from "blocked";

/**
 * This class measures the durations of time when main thread is blocked.
 * This is measured by running a timer which detects cases when it is fired later than expected.
 */
export class BlockHandler {
  private _maxBlockingTime = 0;
  private _totalBlockingTime = 0;
  private _timer?: NodeJS.Timer;

  /** Maximum length of blocking in milliseconds. */
  public get maxBlockingTime() {
    return this._maxBlockingTime;
  }

  /** Total amount of blocking in milliseconds. */
  public get totalBlockingTime() {
    return this._totalBlockingTime;
  }

  /**
   * Starts the timer and records instances of abnormally long blocking.
   * @param threshold The minimum amount of blocking that will be considered abnormal. Default: 10 ms.
   * @param interval Delay in time between each blocking check. Default: 100 ms.
   */
  public start(threshold: number = 10, interval: number = 100) {
    this._maxBlockingTime = 0;
    this._totalBlockingTime = 0;
    this._timer = blocked(
      (time) => {
        this._maxBlockingTime = Math.max(this._maxBlockingTime, time);
        this._totalBlockingTime += time;
        console.warn(`Blocked for ${time} ms`);
      },
      { threshold, interval },
    );
  }

  /** Stops the blocking timer. */
  public stop() {
    clearTimeout(this._timer);
  }
}
