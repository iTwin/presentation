/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Purpose of this script is to convert artillery JSON output to a format accepted by
 * [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark)
 */

"use strict";

const fs = require("fs");
const yargs = require("yargs");
const argv = yargs(process.argv).argv;

const artilleryOutputFilePath = argv.in;
if (!artilleryOutputFilePath) {
  console.error(`Fail! Please specify the artillery output JSON file path as the "--in" script argument.`);
  process.exit(1);
}
if (!fs.existsSync(artilleryOutputFilePath)) {
  console.error(`Fail! Provided artillery output JSON file path does not exist: "${artilleryOutputFilePath}"`);
  process.exit(1);
}

const benchmarkOutputFilePath = argv.out;
if (!benchmarkOutputFilePath) {
  console.error(`Fail! Please specify the benchmark output JSON file path as the "--out" script argument.`);
  process.exit(1);
}

const artilleryOutput = JSON.parse(fs.readFileSync(artilleryOutputFilePath, { encoding: "utf8" }));
const omittedEntries = ["http", "itwin", "vusers"];
const benchmarks = Object.entries(artilleryOutput.aggregate.summaries)
  .filter((entry) => !omittedEntries.some((omitPrefix) => entry[0].startsWith(`${omitPrefix}.`)))
  .map(([name, values]) => {
    const extra = Object.entries(values)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    return { name, unit: "ms", value: values.max, extra };
  });

fs.writeFileSync(benchmarkOutputFilePath, JSON.stringify(benchmarks, undefined, 2));
console.log(`Benchmark output saved to "${benchmarkOutputFilePath}" with ${benchmarks.length} entries.`);
