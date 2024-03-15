/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

interface AdvancedRunProps<TContext> {
  /** Callback to run before the test that should produce the context required for the test. */
  setup(): TContext | Promise<TContext>;

  /** Test function to run and measure. */
  test(x: TContext): void | Promise<void>;

  /** Callback that cleans up the context produced by the "before" callback. */
  cleanup?: (x: TContext) => void | Promise<void>;

  /** Whether or not to run exclusively this test. */
  only?: boolean;
}

/** Runs a test and passes information about it to the TestReporter. */
export function run(desc: string, callback: () => void | Promise<void>): void;
export function run<T>(desc: string, props: AdvancedRunProps<T>): void;
export function run<T>(desc: string, callbackOrProps: (() => void | Promise<void>) | AdvancedRunProps<T>): void {
  if (typeof callbackOrProps === "function") {
    it(desc, async function () {
      this.test!.ctx!.reporter.onTestStart();
      await callbackOrProps();
    });
    return;
  }

  const testFunc = async function (this: Mocha.Context) {
    let value: T;
    try {
      value = await callbackOrProps.setup();
    } finally {
      this.test!.ctx!.reporter.onTestStart();
    }

    try {
      await callbackOrProps.test(value);
    } finally {
      this.test!.ctx!.reporter.onTestEnd();
      await callbackOrProps.cleanup?.(value);
    }
  };

  if (callbackOrProps.only) {
    it.only(desc, testFunc);
  } else {
    it(desc, testFunc);
  }
}
