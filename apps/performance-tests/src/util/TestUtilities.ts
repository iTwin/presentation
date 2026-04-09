/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { it, type TaskMeta } from "vitest";
import { MainThreadBlocksDetector, type Summary } from "./MainThreadBlocksDetector";

declare module "vitest" {
  interface TaskMeta {
    blockingSummary?: Summary;
    duration?: number;
  }
}

export interface RunOptions<TContext> {
  /** Name of the test. */
  testName: string;

  /** Callback to run before the test that should produce the context required for the test. */
  setup(): TContext | Promise<TContext>;

  /** Test function to run and measure. */
  test(x: TContext): void | Promise<void>;

  /** Callback that cleans up the context produced by the "before" callback. */
  cleanup?: (x: TContext) => void | Promise<void>;

  /** Whether or not to run exclusively this test. */
  only?: boolean;

  /** Whether or not to skip this test. */
  skip?: boolean;
}

/** Runs a test and passes information about it to the TestReporter. */
export function run<T>(props: RunOptions<T>): void {
  if (props.skip) {
    return;
  }

  const testFunc = async ({ task }: { task: { meta: TaskMeta } }) => {
    const blockHandler = new MainThreadBlocksDetector();
    const value = await props.setup();
    const start = Date.now();
    try {
      blockHandler.start();
      await props.test(value);
    } finally {
      await blockHandler.stop();
      task.meta.blockingSummary = blockHandler.getSummary();
      task.meta.duration = Date.now() - start;
      await props.cleanup?.(value);
    }
  };

  if (props.only) {
    it.only(props.testName, testFunc);
  } else {
    it(props.testName, testFunc);
  }
}
