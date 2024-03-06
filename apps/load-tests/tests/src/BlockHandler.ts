/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import blocked from "blocked";

export class BlockHandler {
  private _maxBlockingTime = 0;
  private _totalBlockingTime = 0;
  private _timer?: NodeJS.Timer;

  public get maxBlockingTime() {
    return this._maxBlockingTime;
  }

  public get totalBlockingTime() {
    return this._totalBlockingTime;
  }

  public start() {
    this._timer = blocked(
      (time) => {
        this._maxBlockingTime = Math.max(this._maxBlockingTime, time);
        this._totalBlockingTime += time;
        console.warn(`Blocked for ${time} ms`);
      },
      { threshold: 10, interval: 100 },
    );
  }

  public stop() {
    clearTimeout(this._timer);
  }
}
