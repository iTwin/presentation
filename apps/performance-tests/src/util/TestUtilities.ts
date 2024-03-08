/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** Runs a test and measures the time it takes and the amount of time main thread is blocked.  */
export function itMeasures(desc: string, callback: (() => void) | (() => Promise<void>)) {
  it(desc, async function () {
    this.test!.ctx!.testReporterOnTestStart();
    await callback();
  });
}
