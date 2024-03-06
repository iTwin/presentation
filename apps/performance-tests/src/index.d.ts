/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
declare module "@itwin/build-tools/mocha-reporter" {
  export default class BentleyMochaReporter extends Mocha.reporters.Spec {
    constructor(runner: Mocha.Runner, options: Mocha.MochaOptions);
    epilogue(): void;
  }
}
