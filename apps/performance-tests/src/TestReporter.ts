/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import BentleyMochaReporter from "@itwin/build-tools/mocha-reporter";
import { BlockHandler } from "./util/BlockHandler";

interface TestInfo {
  title: string;
  duration: number;
  maxBlockingTime: number;
  totalBlockingTime: number;
}

class TestReporter extends BentleyMochaReporter {
  private readonly _testInfo = new Array<TestInfo>();
  private readonly _blockHandler = new BlockHandler();
  private readonly _outputPath?: string;

  constructor(runner: Mocha.Runner, options: Mocha.MochaOptions) {
    super(runner, options);

    this._outputPath = options.reporterOptions.BENCHMARK_OUTPUT_PATH;
    runner.on("test", () => this.onTestStart());
    runner.on("test end", (test) => this.onTestEnd(test));
  }

  private onTestStart() {
    this._blockHandler.start();
  }

  private onTestEnd(test: Mocha.Test) {
    this._blockHandler.stop();
    const duration = test.duration!;
    const maxBlockingTime = this._blockHandler.maxBlockingTime;
    const totalBlockingTime = this._blockHandler.totalBlockingTime;

    this._testInfo.push({
      title: test.title,
      duration,
      maxBlockingTime,
      totalBlockingTime,
    });

    console.log(`Took time: ${duration} ms`);
    console.log(`Max blocking time: ${maxBlockingTime}`);
    console.log(`Total blocking time: ${maxBlockingTime}`);
  }

  public override epilogue(): void {
    if (!this._outputPath) {
      return;
    }

    const data = this._testInfo.map(({ title, duration, ...rest }) => ({
      name: title,
      unit: "ms",
      value: duration,
      extra: Object.entries(rest)
        .map(([key, val]) => `${key}: ${val}`)
        .join("\n"),
    }));

    fs.writeFileSync(this._outputPath, JSON.stringify(data, undefined, 2));
  }
}

module.exports = TestReporter;
