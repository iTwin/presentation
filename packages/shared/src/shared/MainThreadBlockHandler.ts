/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @internal */
export const DEFAULT_MAIN_THREAD_RELEASE_THRESHOLD = 20;

interface MainThreadBlockHandlerProps {
  releaseThreshold?: number;
  onRelease?: () => void;
}

/**
 * Handles releasing of the main thread.
 * @beta
 */
export class MainThreadBlockHandler {
  private _releaseThreshold: number;
  private _onRelease?: () => void;
  private _lastReleaseTime = performance.now();

  constructor(props: MainThreadBlockHandlerProps) {
    this._releaseThreshold = props.releaseThreshold ?? DEFAULT_MAIN_THREAD_RELEASE_THRESHOLD;
    this._onRelease = props.onRelease;
  }

  /**
   * Releases the main thread for other timers to use.
   */
  public static async releaseMainThread(onRelease?: () => void) {
    onRelease?.();
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Releases the main thread if sufficient time has elapsed.
   */
  public releaseMainThreadIfTimeElapsed(): Promise<void> | undefined {
    const currentTime = performance.now();
    if (currentTime - this._lastReleaseTime < this._releaseThreshold) {
      return undefined;
    }

    this._lastReleaseTime = currentTime;
    return MainThreadBlockHandler.releaseMainThread(this._onRelease);
  }
}
