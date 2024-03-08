import asTable from "as-table";
/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import Mocha from "mocha";
import { BlockHandler, Summary } from "./BlockHandler";

interface TestInfo {
  test: Mocha.Test;
  blockingSummary: Summary;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Base = Mocha.reporters.Base;
const { EVENT_TEST_BEGIN, EVENT_TEST_END, EVENT_SUITE_BEGIN, EVENT_RUN_END } = Mocha.Runner.constants;

const tableFormatter = asTable.configure({
  delimiter: " | ",
});

/**
 * Measures test time and the amounts of time when the main thread was blocked.
 */
class TestReporter extends Base {
  private readonly _testInfo = new Array<TestInfo>();
  private readonly _blockHandler = new BlockHandler();
  private readonly _outputPath?: string;

  constructor(runner: Mocha.Runner, options: Mocha.MochaOptions) {
    super(runner, options);
    this._outputPath = options.reporterOptions?.BENCHMARK_OUTPUT_PATH;

    runner.on(EVENT_SUITE_BEGIN, (suite) => console.log(`\n${suite.title}`));
    runner.on(EVENT_TEST_BEGIN, (test) => this.onTestStart(test));
    runner.on(EVENT_TEST_END, (test) => this.onTestEnd(test));
    runner.on(EVENT_RUN_END, () => {
      this.printResults();
      if (this._outputPath && this.failures.length === 0) {
        this.saveResults();
      }
    });
  }

  /** Run before each test starts. */
  private onTestStart(test: Mocha.Test) {
    this._blockHandler.start();
    process.stdout.write(`${test.title}...`);
  }

  /** Run after each test passes or fails. */
  private onTestEnd(test: Mocha.Test) {
    this._blockHandler.stop();

    const duration = test.duration!;
    Base.cursor.CR();
    console.log(`${test.isPassed() ? Base.symbols.ok : Base.symbols.err} ${test.title} (${duration} ms)`);

    const blockingSummary = this._blockHandler.getSummary();
    this._testInfo.push({
      test,
      blockingSummary,
    });
  }

  private printResults() {
    const errors = new Map<string, any>();
    const results = this._testInfo.map(({ test, blockingSummary }) => {
      const testName = test.fullTitle();
      if (test.err) {
        errors.set(testName, test.err);
      }

      const blockingInfo = Object.entries(blockingSummary)
        .filter(([_, val]) => val !== undefined)
        .map(([key, val]) => `${key}: ${(key === "count" ? val : val?.toFixed(2)) ?? "N/A"}`)
        .join(", ");

      /* eslint-disable @typescript-eslint/naming-convention */
      return {
        Status: test.isPassed() ? "PASS" : "FAIL",
        Test: testName,
        Duration: `${test.duration!} ms`,
        Blocks: blockingInfo,
      };
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    console.log();
    console.log(tableFormatter(results));

    for (const [name, error] of errors) {
      console.error();
      console.error(`${name}:`);
      console.error(error);
    }
  }

  /** Saves performance results in a format that is compatible with Github benchmark action. */
  private saveResults() {
    const data = this._testInfo.map(({ test, blockingSummary }) => ({
      name: test.title,
      unit: "ms",
      value: test.duration!,
      extra: Object.entries(blockingSummary)
        .map(([key, val]) => `${key}: ${val ?? "N/A"}`)
        .join("\n"),
    }));

    const outputPath = this._outputPath!;
    fs.writeFileSync(outputPath, JSON.stringify(data, undefined, 2));
    console.log(`Test results saved at ${outputPath}`);
  }
}

module.exports = TestReporter;
