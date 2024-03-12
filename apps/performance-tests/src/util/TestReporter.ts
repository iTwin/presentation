/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import asTable from "as-table";
import fs from "fs";
import Mocha from "mocha";
import { BlockHandler, Summary } from "./BlockHandler";

interface TestInfo {
  fullTitle: string;
  duration: number;
  pass: boolean;
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
export class TestReporter extends Base {
  private readonly _testStartTimes = new Map<string, number>();
  private readonly _testInfo = new Array<TestInfo>();
  private readonly _blockHandler = new BlockHandler();
  private readonly _outputPath?: string;

  constructor(runner: Mocha.Runner, options: Mocha.MochaOptions) {
    super(runner, options);
    this._outputPath = options.reporterOptions?.BENCHMARK_OUTPUT_PATH;

    runner.on(EVENT_SUITE_BEGIN, (suite) => console.log(`\n${suite.title}`));
    runner.on(EVENT_TEST_BEGIN, (test) => {
      // This event can be fired before beforeEach() and we do not want to measure beforeEach() blocking time.
      // Add callback to the test context, so that it could be called at the actual beginning of the test.
      return (test.ctx!.testReporterOnTestStart = () => this.onTestStart(test));
    });
    runner.on(EVENT_TEST_END, (test) => this.onTestEnd(test));
    runner.on(EVENT_RUN_END, () => {
      this.printResults();
      if (this._outputPath && this.failures.length === 0) {
        this.saveResults();
      }
    });
  }

  /** Run before each test starts. */
  private onTestStart(test: Mocha.Runnable) {
    this._blockHandler.start();
    process.stdout.write(`${test.title}...`);
    this._testStartTimes.set(test.title, performance.now());
  }

  /** Run after each test passes or fails. */
  private onTestEnd(test: Mocha.Test) {
    const endTime = performance.now();
    const startTime = this._testStartTimes.get(test.title);
    if (startTime === undefined) {
      return;
    }

    const duration = Math.round((endTime - startTime) * 100) / 100;
    this._blockHandler.stop();

    const pass = test.isPassed();
    Base.cursor.CR();
    console.log(`${pass ? Base.symbols.ok : Base.symbols.err} ${test.title} (${duration} ms)`);

    const blockingSummary = this._blockHandler.getSummary();
    this._testInfo.push({
      fullTitle: test.fullTitle(),
      duration,
      pass,
      blockingSummary,
    });
  }

  private printResults() {
    const results = this._testInfo.map(({ fullTitle, duration, pass, blockingSummary }) => {
      const blockingInfo = Object.entries(blockingSummary)
        .filter(([_, val]) => val !== undefined)
        .map(([key, val]) => `${key}: ${(key === "count" ? val : val?.toFixed(2)) ?? "N/A"}`)
        .join(", ");

      /* eslint-disable @typescript-eslint/naming-convention */
      return {
        Status: pass ? "PASS" : "FAIL",
        Test: fullTitle,
        Duration: `${duration} ms`,
        Blocks: blockingInfo,
      };
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    console.log();
    console.log(tableFormatter(results));

    for (const test of this.failures) {
      console.error();
      console.error(`${test.fullTitle()}:`);
      console.error(test.err);
    }
  }

  /** Saves performance results in a format that is compatible with Github benchmark action. */
  private saveResults() {
    const data = this._testInfo.flatMap(({ fullTitle, duration, blockingSummary }) => {
      const durationEntry = {
        name: fullTitle,
        unit: "ms",
        value: duration,
      };

      const blockingEntry = {
        name: `${fullTitle} (P95 of main thread blocks)`,
        unit: "ms",
        value: blockingSummary.p95 ?? 0,
        extra: Object.entries(blockingSummary)
          .map(([key, val]) => `${key}: ${val ?? "N/A"}`)
          .join("\n"),
      };

      return [durationEntry, blockingEntry];
    });

    const outputPath = this._outputPath!;
    fs.writeFileSync(outputPath, JSON.stringify(data, undefined, 2));
    console.log(`Test results saved at ${outputPath}`);
  }
}

module.exports = TestReporter;
