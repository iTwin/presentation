/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

interface Metric {
  name: string;
  unit: string;
  value: number;
  extra?: string;
  comparisonId?: string;
}

const BLOCKING_SUFFIX = " (P95 of main thread blocks)";
const ROUNDS = 3;

/** Reads the duration/blocking pairs written by TestReporter. */
export function readResults(file: string): Metric[] {
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(data)) {
    throw new Error(`Expected a benchmark array in ${file}.`);
  }
  const names = new Set<string>();
  const metrics = data.map((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("name" in entry) ||
      typeof entry.name !== "string" ||
      !("unit" in entry) ||
      entry.unit !== "ms" ||
      !("value" in entry) ||
      typeof entry.value !== "number" ||
      !Number.isFinite(entry.value) ||
      entry.value < 0 ||
      ("extra" in entry && typeof entry.extra !== "string") ||
      ("comparisonId" in entry && (typeof entry.comparisonId !== "string" || entry.comparisonId.length === 0))
    ) {
      throw new Error(`Invalid benchmark metric in ${file}.`);
    }
    if (names.has(entry.name)) {
      throw new Error(`Duplicate benchmark "${entry.name}" in ${file}.`);
    }
    names.add(entry.name);
    return {
      name: entry.name,
      unit: entry.unit,
      value: entry.value,
      ...("extra" in entry && typeof entry.extra === "string" ? { extra: entry.extra } : {}),
      ...("comparisonId" in entry && typeof entry.comparisonId === "string"
        ? { comparisonId: entry.comparisonId }
        : {}),
    };
  });
  for (let index = 0; index < metrics.length; index += 2) {
    if (metrics[index + 1]?.name !== `${metrics[index].name}${BLOCKING_SUFFIX}`) {
      throw new Error(`Missing blocking metric for "${metrics[index].name}" in ${file}.`);
    }
  }
  return metrics;
}

/** Retains each test's fastest duration and the blocking measurement from that same round. */
export function selectFastest(rounds: Metric[][]): Metric[] {
  if (rounds.length === 0 || rounds.some((round) => round.length === 0)) {
    throw new Error("Every benchmark round must contain results.");
  }
  const best = new Map<string, [Metric, Metric]>();
  for (const [roundIndex, metrics] of rounds.entries()) {
    const names = metrics.filter((_, index) => index % 2 === 0).map(({ name }) => name);
    if (roundIndex > 0 && (names.length !== best.size || names.some((name) => !best.has(name)))) {
      throw new Error("Benchmark tests changed between rounds of the same revision.");
    }
    for (let index = 0; index < metrics.length; index += 2) {
      const duration = metrics[index];
      const previous = best.get(duration.name);
      if (!previous || duration.value < previous[0].value) {
        best.set(duration.name, [duration, metrics[index + 1]]);
      }
    }
  }
  return [...best.values()].flat();
}

/** Alternates independently built base/head runners on the same machine. */
export function runComparison(
  baseDirectory: string,
  headDirectory: string,
  outputDirectory: string,
  outputName: string,
  files: string[],
) {
  const comparisonId = randomUUID();
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "benchmark-comparison-"));
  const revisions: { name: string; directory: string; rounds: Metric[][] }[] = [
    { name: "base", directory: baseDirectory, rounds: [] },
    { name: "head", directory: headDirectory, rounds: [] },
  ];
  try {
    for (let round = 1; round <= ROUNDS; round++) {
      for (const revision of revisions) {
        const cwd = join(revision.directory, "apps/performance-tests");
        const present = files.filter((file) => existsSync(join(cwd, file)));
        if (present.length === 0) {
          console.log(`${revision.name}: none of the shard's test files exist; no measurements for this revision.`);
          continue;
        }
        console.log(`Round ${round}/${ROUNDS}: ${revision.name}, ${present.join(", ")}`);
        const output = join(temporaryDirectory, `${revision.name}-${round}.json`);
        execFileSync("pnpm", ["exec", "vitest", "run", ...present, "--allowOnly=false"], {
          cwd,
          stdio: "inherit",
          env: {
            ...process.env,
            NODE_OPTIONS: "--expose-gc",
            BENCHMARK_ITERATIONS: "1",
            BENCHMARK_OUTPUT_PATH: output,
          },
        });
        revision.rounds.push(readResults(output));
      }
    }
    if (revisions.every(({ rounds }) => rounds.length === 0)) {
      throw new Error(`Benchmark files ${files.join(", ")} are absent in both revisions.`);
    }
    for (const revision of revisions) {
      const output = join(outputDirectory, revision.name, `${outputName}.json`);
      mkdirSync(dirname(output), { recursive: true });
      const metrics = revision.rounds.length ? selectFastest(revision.rounds) : [];
      writeFileSync(
        output,
        JSON.stringify(
          metrics.map((metric) => ({ ...metric, comparisonId })),
          undefined,
          2,
        ),
      );
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Formats same-runner comparisons without consulting historical master results. */
export function formatComparison(name: string, base: Metric[], head: Metric[]): string {
  const escape = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("|", "&#124;")
      .replaceAll("`", "&#96;")
      .replace(/[\r\n]/g, " ");
  const baseByName = new Map(base.map((metric) => [metric.name, metric]));
  const headByName = new Map(head.map((metric) => [metric.name, metric]));
  const rows = [...new Set([...baseByName.keys(), ...headByName.keys()])].map((metricName) => {
    const a = baseByName.get(metricName);
    const b = headByName.get(metricName);
    let change: string;
    let status = "";
    if (!a) {
      change = "New";
    } else if (!b) {
      change = "Removed";
    } else if (!a.comparisonId || !b.comparisonId) {
      change = "N/A (runner unknown)";
    } else if (a.comparisonId !== b.comparisonId) {
      change = "N/A (different runners)";
    } else if (a.value === 0) {
      change = b.value === 0 ? "0.00%" : "N/A";
      if (b.value === 0) {
        status = "🟰";
      }
    } else {
      const difference = b.value - a.value;
      const percent = (difference / a.value) * 100;
      change = `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
      if (difference === 0) {
        status = "🟰";
      } else if (Math.abs(difference) > 50 && Math.abs(percent) > 10) {
        status = difference > 0 ? "🚨" : "✅";
      } else {
        status = "〰️";
      }
    }
    return `| ${escape(metricName)} | ${a ? a.value.toFixed(0) : "-"} | ${b ? b.value.toFixed(0) : "-"} | ${change} | ${status} |`;
  });
  return [
    `## ${escape(name)} benchmark`,
    "",
    `A/B/A/B/A/B on the same runner per shard. Each test uses its fastest of ${ROUNDS} runs; blocking metrics come from that same run.`,
    "Timings are rounded to the nearest millisecond; percentages and status use unrounded values. Negative changes are faster. Percentages require matching A/B invocation IDs; tests measured on different runners or without provenance have no comparison, nor do new and removed tests.",
    "🟰 unchanged; 🚨 slower; ✅ faster; 〰️ below threshold. Slower and faster require a change greater than both 10% and 50 ms.",
    "",
    "| Test / metric | Base (ms) | PR (ms) | Change | Status |",
    "| --- | ---: | ---: | ---: | :---: |",
    ...rows,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "run" && args.length >= 5) {
    const [base, head, output, name, ...files] = args;
    runComparison(resolve(base), resolve(head), resolve(output), name, files);
  } else if (command === "report" && args.length === 4) {
    const [name, base, head, output] = args;
    writeFileSync(output, formatComparison(name, readResults(base), readResults(head)));
  } else {
    throw new Error(`
      Usage: BenchmarkComparison.ts
          run <base-dir> <head-dir> <output-dir> <name> <test-file...>
          report <suite> <base-json> <head-json> <output-md>
    `);
  }
}
