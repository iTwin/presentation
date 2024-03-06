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
  stateless?: boolean;
  outputPath?: string;
}

export async function getArguments(): Promise<Arguments> {
  /* eslint-disable id-blacklist */
  const args = await yargs(process.argv)
    .option("datasetsDir", { desc: "Directory of datasets", demandOption: true, string: true })
    .option("scenarios", { desc: "Scenarios to run", demandOption: true, array: true, choices: SCENARIOS })
    .option("stateless", { desc: "Whether or not to use stateless hierarchy", boolean: true })
    .option("outputPath", { desc: "Path for outputting the benchmark results", string: true })
    .parse();
  /* eslint-enable id-blacklist */
  return args as Arguments;
}
