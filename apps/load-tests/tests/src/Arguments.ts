/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import yargs from "yargs";

const SCENARIOS = ["initial", "full"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface Arguments {
  datasetsDir: string;
  scenarios: Scenario[];
  count: number;
  stateless?: boolean;
  outputPath?: string;
}

export async function getArguments(): Promise<Arguments> {
  /* eslint-disable id-blacklist */
  const args = await yargs(process.argv)
    .option("datasetsDir", { desc: "Directory of datasets", alias: "d", demandOption: true, string: true })
    .option("scenarios", { desc: "Scenarios to run", demandOption: true, array: true, choices: SCENARIOS })
    .option("count", { desc: "Number of time to run each scenario", alias: "n", number: true, default: 1 })
    .option("stateless", { desc: "Whether or not to use stateless hierarchy", alias: "s", boolean: true })
    .option("outputPath", { desc: "Path for outputting the benchmark results", alias: "o", string: true })
    .parse();
  /* eslint-enable id-blacklist */
  return args as Arguments;
}
