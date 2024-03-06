/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs/promises";
import path from "path";
import { StopWatch } from "@itwin/core-bentley";
import { Arguments, getArguments, Scenario } from "./Arguments";
import { BlockHandler } from "./BlockHandler";
import { loadDataSets } from "./Datasets";
import { DefaultHierarchyProvider } from "./DefaultHierarchyProvider";
import { NodeLoader, NodeProvider } from "./NodeLoader";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider";

type Summary = {
  time: number;
  name: string;
} & Record<string, any>;

async function outputGithubSummary(summary: Summary[], filePath: string) {
  const newSummary = summary.map((x) => {
    const { name, time: value, ...rest } = x;
    return {
      name,
      unit: "ms",
      value,
      extra: Object.entries(rest)
        .map(([key, val]) => `${key}: ${val}`)
        .join("\n"),
    };
  });
  await fs.writeFile(filePath, JSON.stringify(newSummary, undefined, 2));
  console.log(`Saved benchmark data: ${filePath}`);
}

async function runBenchmarks(args: Arguments, datasets: string[]) {
  const summary = new Array<Summary>();

  for (const dataSetPath of datasets) {
    for (const scenario of args.scenarios) {
      const nodeProvider: NodeProvider<any> = args.stateless ? new StatelessHierarchyProvider(dataSetPath) : new DefaultHierarchyProvider(dataSetPath);
      const processor = new NodeLoader(nodeProvider, args.stateless ? 10 : undefined);

      console.log(`Processing ${dataSetPath}`);
      console.log(`Scenario: ${scenario}, processor: ${args.stateless ? "stateless" : "default"}`);

      const stopWatch = new StopWatch();
      const blockHandler = new BlockHandler();
      blockHandler.start();
      stopWatch.start();
      try {
        await runScenario(scenario, processor);
      } finally {
        blockHandler.stop();
      }

      const elapsed = stopWatch.stop();
      const iModelName = path.basename(dataSetPath);
      summary.push({
        name: `${scenario} - ${iModelName}`,
        time: elapsed.milliseconds,
        maxBlocked: blockHandler.maxBlockingTime,
        totalBlocked: blockHandler.totalBlockingTime,
      });
    }
  }

  console.table(summary);
  if (args.outputPath) {
    await outputGithubSummary(summary, args.outputPath);
  }
}

async function runScenario(scenario: Scenario, processor: NodeLoader<any>) {
  switch (scenario) {
    case "initial":
      await processor.loadInitialHierarchy();
      break;
    case "full":
      await processor.loadFullHierarchy();
      break;
  }
}

async function main() {
  const args = await getArguments();
  const datasets = await loadDataSets(args.datasetsDir);
  await runBenchmarks(args, datasets);
}

main().catch((err) => console.error("Unhandled error", err));
