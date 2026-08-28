/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { it, type TaskMeta } from "vitest";
import { MainThreadBlocksDetector, type Summary } from "./MainThreadBlocksDetector.js";

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
    // Force a full GC after setup so every measured section starts from a clean heap.
    // Otherwise leftover setup/module-eval garbage lingering in the young generation occasionally gets
    // promoted to old space once the load starts churning through short-lived per-node objects. That
    // bloats old space, enlarges the old-to-young remembered set, and makes every subsequent Scavenge
    // an order of magnitude costlier, producing a bimodal ~1.5-2x run-to-run variance. Starting from a
    // clean heap keeps measurements stable. Requires running node with `--expose-gc` (wired up via the
    // package.json test scripts); `global.gc` is left undefined otherwise, so this is a no-op.
    global.gc?.();
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
