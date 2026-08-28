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

  // Number of times the measured section is run; the fastest run is reported. A single setup/cleanup is
  // shared across all iterations. Best-of-N guards against the occasional slow run; defaults to 1 so CI
  // time is unchanged unless explicitly increased via the `BENCHMARK_ITERATIONS` environment variable.
  const iterations = Math.max(1, Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? "1", 10) || 1);

  const testFunc = async ({ task }: { task: { meta: TaskMeta } }) => {
    const value = await props.setup();
    try {
      let bestDuration = Number.POSITIVE_INFINITY;
      let bestSummary: Summary = { count: 0 };
      const durations: number[] = [];
      for (let iteration = 0; iteration < iterations; ++iteration) {
        const blockHandler = new MainThreadBlocksDetector();
        // Force a full GC before each measured section so it starts from a clean heap. Otherwise
        // leftover setup/module-eval garbage lingering in the young generation occasionally gets
        // promoted to old space once the load starts churning through short-lived per-node objects.
        // That bloats old space, enlarges the old-to-young remembered set, and makes every subsequent
        // Scavenge an order of magnitude costlier - a slow-GC regime that, once entered, persists for
        // the rest of the worker's life and produces a bimodal ~1.5-2x run-to-run variance. Starting
        // each measurement from a clean heap prevents the worker from ever tipping into that regime.
        // Requires running node with `--expose-gc` (wired up via the package.json test scripts);
        // `global.gc` is left undefined otherwise, so this is a no-op.
        global.gc?.();

        const start = Date.now();
        blockHandler.start();
        try {
          await props.test(value);
        } finally {
          await blockHandler.stop();
        }
        const duration = Date.now() - start;
        durations.push(duration);
        if (duration < bestDuration) {
          bestDuration = duration;
          bestSummary = blockHandler.getSummary();
        }
      }
      task.meta.duration = bestDuration;
      task.meta.blockingSummary = bestSummary;
      if (iterations > 1) {
        console.log(`${props.testName}: best ${bestDuration} ms of ${iterations} runs [${durations.join(", ")} ms]`);
      }
    } finally {
      await props.cleanup?.(value);
    }
  };

  if (props.only) {
    it.only(props.testName, testFunc);
  } else {
    it(props.testName, testFunc);
  }
}
