/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import Mocha from "mocha";
import { BlockHandler } from "./util/BlockHandler";

interface TestInfo {
  title: string;
  duration: number;
  maxBlockingTime: number;
  totalBlockingTime: number;
}

const { EVENT_TEST_END, EVENT_TEST_BEGIN } = Mocha.Runner.constants;

/**
 * Measures test time and the amounts of time when the main thread was blocked.
 */
class TestReporter extends Mocha.reporters.Spec {
  private readonly _testInfo = new Array<TestInfo>();
  private readonly _blockHandler = new BlockHandler();
  private readonly _outputPath?: string;

  constructor(runner: Mocha.Runner, options: Mocha.MochaOptions) {
    super(runner, options);

    this._outputPath = options.reporterOptions?.BENCHMARK_OUTPUT_PATH;
    runner.addListener(EVENT_TEST_BEGIN, (test) => this.onTestStart(test));
    runner.addListener(EVENT_TEST_END, (test) => this.onTestEnd(test));
  }

  public override epilogue(): void {
    super.epilogue();
    if (this._outputPath && this.failures.length === 0) {
      this.saveResults();
    }
  }

  /** Run before each test starts. */
  private onTestStart(test: Mocha.Test) {
    console.log(`Starting '${test.title}'...`);
    this._blockHandler.start();
  }

  /** Run after each test passes or fails. */
  private onTestEnd(test: Mocha.Test) {
    this._blockHandler.stop();

    if (test.isFailed()) {
      // Output the error call stack to the console.
      // For some reason, this is not done by default by the base class.
      console.error(test.err);
      return;
    }

    const duration = test.duration!;
    const maxBlockingTime = this._blockHandler.maxBlockingTime;
    const totalBlockingTime = this._blockHandler.totalBlockingTime;

    this._testInfo.push({
      title: test.title,
      duration,
      maxBlockingTime,
      totalBlockingTime,
    });

    console.log(`Max blocking time: ${maxBlockingTime}`);
    console.log(`Total blocking time: ${maxBlockingTime}`);
  }

  /** Saves performance results in a format that is compatible with Github benchmark action. */
  private saveResults() {
    const data = this._testInfo.map(({ title, duration, ...rest }) => ({
      name: title,
      unit: "ms",
      value: duration,
      extra: Object.entries(rest)
        .map(([key, val]) => `${key}: ${val}`)
        .join("\n"),
    }));

    fs.writeFileSync(this._outputPath!, JSON.stringify(data, undefined, 2));
    console.log(`Test results saved at ${this._outputPath}`);
  }
}

module.exports = TestReporter;
