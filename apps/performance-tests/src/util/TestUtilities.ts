/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** Runs a test and passes information about it to the TestReporter. */
export function itMeasures(desc: string, callback: (() => void) | (() => Promise<void>)) {
  it(desc, async function () {
    this.test!.ctx!.testReporterOnTestStart();
    await callback();
  });
}
